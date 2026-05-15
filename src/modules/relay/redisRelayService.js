function createRedisRelayService({
  io,
  namespaces,
  socketEmitter,
  loggerPort,
  runtimeMetrics,
}) {
  function emitTripRoomAll(room, eventName, payload) {
    io.to(room).emit(eventName, payload);
    namespaces.drivers.to(room).emit(eventName, payload);
    namespaces.customers.to(room).emit(eventName, payload);
  }

  function parseBookingEvent(event) {
    const payloadData = event?.payload?.data;
    let tripId =
      typeof payloadData === "object" && payloadData !== null
        ? payloadData.tripId
        : payloadData;

    let baseEventName = event.eventName;
    const parts = String(event.eventName || "").split(":");
    if (parts.length >= 3 && parts[0] === "bookingTrip") {
      baseEventName = `${parts[0]}:${parts[1]}`;
      if (!tripId) {
        tripId = parts.slice(2).join(":");
      }
    }

    return { baseEventName, tripId };
  }

  async function relayBookingEvent(event) {
    const { baseEventName, tripId } = parseBookingEvent(event);
    if (!tripId) return false;

    const room = `trip_${tripId}`;
    const customerTarget = event.target;

    if (baseEventName === "bookingTrip:Request") {
      if (runtimeMetrics)
        runtimeMetrics.recordRelayEvent("bookingTrip:Request");
      const driverId =
        event.payload?.driverId || event.target || event.payload?.target;
      if (driverId) {
        await socketEmitter.emitToDriver(
          driverId,
          "bookingTrip:Request",
          tripId,
        );
      }
      return true;
    }

    if (baseEventName === "bookingTrip:Canceled") {
      if (runtimeMetrics)
        runtimeMetrics.recordRelayEvent("bookingTrip:Canceled");
      const eventName = `bookingTrip:Canceled:${tripId}`;
      emitTripRoomAll(room, eventName);
      if (event.payload?.driverId) {
        await socketEmitter.emitToDriver(event.payload.driverId, eventName);
      }
      return true;
    }

    if (baseEventName === "bookingTrip:AcceptedTrip") {
      if (runtimeMetrics)
        runtimeMetrics.recordRelayEvent("bookingTrip:AcceptedTrip");
      const eventName = `bookingTrip:AcceptedTrip:${tripId}`;
      io.to(room).emit(eventName);
      namespaces.customers.to(room).emit(eventName);
      if (customerTarget) {
        await socketEmitter.emitToCustomer(customerTarget, eventName, tripId);
      }
      return true;
    }

    if (baseEventName === "bookingTrip:ToPickUp") {
      if (runtimeMetrics)
        runtimeMetrics.recordRelayEvent("bookingTrip:ToPickUp");
      const eventName = `bookingTrip:ToPickUp:${tripId}`;
      emitTripRoomAll(room, eventName);
      if (customerTarget) {
        await socketEmitter.emitToCustomer(customerTarget, eventName, tripId);
      }
      return true;
    }

    if (baseEventName === "bookingTrip:DriverCanceled") {
      if (runtimeMetrics)
        runtimeMetrics.recordRelayEvent("bookingTrip:DriverCanceled");
      const eventName = `bookingTrip:Canceled:${tripId}`;
      io.to(room).emit(eventName);
      namespaces.customers.to(room).emit(eventName);
      if (customerTarget) {
        await socketEmitter.emitToCustomer(customerTarget, eventName, tripId);
      }
      return true;
    }

    if (baseEventName === "bookingTrip:Started") {
      if (runtimeMetrics)
        runtimeMetrics.recordRelayEvent("bookingTrip:Started");
      const eventName = `bookingTrip:Started:${tripId}`;
      emitTripRoomAll(room, eventName, tripId);
      if (customerTarget) {
        await socketEmitter.emitToCustomer(customerTarget, eventName, tripId);
      }
      return true;
    }

    if (baseEventName === "bookingTrip:Completed") {
      if (runtimeMetrics)
        runtimeMetrics.recordRelayEvent("bookingTrip:Completed");
      const eventName = `bookingTrip:Completed:${tripId}`;
      const payload = event.payload?.data ?? tripId;
      emitTripRoomAll(room, eventName, payload);
      if (customerTarget) {
        await socketEmitter.emitToCustomer(customerTarget, eventName, payload);
      }
      return true;
    }

    if (baseEventName === "bookingTrip:CompletedWithProblem") {
      if (runtimeMetrics) {
        runtimeMetrics.recordRelayEvent("bookingTrip:CompletedWithProblem");
      }
      const eventName = `bookingTrip:CompletedWithProblem:${tripId}`;
      const payload = event.payload?.problemDescription
        ? { tripId, problemDescription: event.payload.problemDescription }
        : tripId;
      emitTripRoomAll(room, eventName, payload);
      if (customerTarget) {
        await socketEmitter.emitToCustomer(customerTarget, eventName, tripId);
      }
      return true;
    }

    return false;
  }

  function relayGenericEvent(event) {
    const bookingPrefix = String(event?.eventName || "").startsWith(
      "bookingTrip:",
    );
    if (bookingPrefix) {
      relayBookingEvent(event).catch((error) => {
        loggerPort.error(
          "REDIS_RELAY",
          "Failed to relay booking event",
          error,
          {
            eventName: event?.eventName,
          },
        );
      });
      return;
    }

    const { type, target, eventName, payload } = event;

    if (type === "user" && target) {
      if (runtimeMetrics) runtimeMetrics.recordRelayEvent(eventName);
      const actualData = payload?.data;
      const userType = payload?.userType || "customer";

      if (target === "admins" || target === "admin") {
        if (namespaces.admin) {
          namespaces.admin.emit(eventName, actualData);
        }
        return;
      }

      if (target === "drivers" || target === "customers") {
        const namespace =
          target === "drivers" ? namespaces.drivers : namespaces.customers;
        namespace.emit(eventName, actualData);
        io.emit(eventName, actualData);
        return;
      }

      const userRoom = `${userType}_${target}`;
      if (userType === "driver") {
        namespaces.drivers.to(userRoom).emit(eventName, actualData);
        socketEmitter
          .emitToDriver(target, eventName, actualData)
          .catch(() => {});
      } else {
        namespaces.customers.to(userRoom).emit(eventName, actualData);
        socketEmitter
          .emitToCustomer(target, eventName, actualData)
          .catch(() => {});
      }
      return;
    }

    if (type === "trip" && target) {
      if (runtimeMetrics) runtimeMetrics.recordRelayEvent(eventName);
      const room = `trip_${target}`;
      io.to(room).emit(eventName, payload);
      namespaces.drivers.to(room).emit(eventName, payload);
      namespaces.customers.to(room).emit(eventName, payload);
      return;
    }

    if (type === "broadcast") {
      if (runtimeMetrics) runtimeMetrics.recordRelayEvent(eventName);
      if (target) {
        io.to(target).emit(eventName, payload);
        namespaces.drivers.to(target).emit(eventName, payload);
        namespaces.customers.to(target).emit(eventName, payload);
      } else {
        io.emit(eventName, payload);
        namespaces.drivers.emit(eventName, payload);
        namespaces.customers.emit(eventName, payload);
      }
      return;
    }

    loggerPort.debug("REDIS_RELAY", "Unhandled generic relay event", {
      type,
      target,
      eventName,
    });
  }

  return {
    relayGenericEvent,
  };
}

module.exports = { createRedisRelayService };
