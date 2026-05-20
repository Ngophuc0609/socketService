# 03 - Business Domain Realtime

Cap nhat: 2026-05-20. Tai lieu nay tom tat nghiep vu suy ra tu source, kem dan chung file/function.

## Dan chung source chinh

| Nghiep vu | File/function cu the |
| --- | --- |
| Socket user lifecycle | `src/transports/socket/registerSocketFlows.js:registerSocketFlows()` |
| Driver/customer connection policy | `registerSocketFlows()` connection handlers cho `/drivers` va `/customers` |
| Trip room membership | `src/modules/trip/tripRoomService.js:createTripRoomService()`, `joinTrip()`, `leaveTrip()` |
| Location normalization/cache | `src/modules/location/locationService.js:createLocationService()`, `src/shared/utils/validateLocation.js:validateLocation()` |
| Booking event relay | `src/modules/relay/redisRelayService.js:relayBookingEvent()` |
| Generic backend relay | `src/modules/relay/redisRelayService.js:relayGenericEvent()` |
| Backend HTTP emit | `src/modules/connection/socketEmitterService.js:emitToDriver()`, `emitToCustomer()`, `emitToTrip()`, `emitBroadcast()` |

## Domain actors

- Driver: nhan booking request, join/leave trip, update location.
- Customer: theo doi trip, co the nhan nhieu event qua nhieu thiet bi.
- Admin: monitor/control namespace neu bat `ADMIN_MONITOR=true`.
- Backend: nguon phat sinh booking/trip/system event qua HTTP route hoac Redis Pub/Sub.
- Socket service: realtime delivery layer, khong so huu database booking/trip.

## Domain terms trong source

- `userType`: `driver` hoac `customer` trong route `/emit/user` va socket registration.
- `userId`: lay tu header `user_id`/`userId` trong namespace role, hoac tu payload `authenticate` trong legacy namespace.
- `tripId`: identifier duoc bien thanh room `trip_{tripId}`.
- User room: `driver_{userId}` hoac `customer_{userId}`.
- Trip room: `trip_{tripId}`.
- Booking event: cac event prefix `bookingTrip:*`.

## Business rules da tim thay

### Driver single-active socket

Trong `/drivers`, khi driver moi ket noi, source kiem tra `registry.drivers.get(userId)`. Neu co socket cu khac id thi disconnect socket cu, sau do set socket moi.

Dan chung: `src/transports/socket/registerSocketFlows.js`, connection handler `namespaces.drivers.on("connection")`.

### Customer multi-device socket

Trong `/customers`, source lay danh sach socket hien tai cua customer, push socket moi va luu lai map. Disconnect chi xoa socket bi disconnect; neu con socket khac thi van giu customer trong registry.

Dan chung: `registerSocketFlows()`, connection handler `namespaces.customers.on("connection")`.

### Legacy compatibility

Namespace `/` cho client cu, khong dung middleware Bearer. Client phai emit `authenticate` voi `{ userId, userType }` truoc khi `updateLocation`; neu chua authenticated thi server emit `error { message: "Not authenticated" }`.

Dan chung: `registerSocketFlows()`, handler `namespaces.legacy.on("connection")`, event `authenticate`, `updateLocation`.

### Join/leave trip room

`joinTrip` yeu cau `tripId`, join room `trip_{tripId}`, add socket id vao Redis set `socket:room:{roomName}`, set TTL. `leaveTrip` leave room va remove socket id khoi Redis set.

Dan chung: `tripRoomService.joinTrip()`, `tripRoomService.leaveTrip()`.

### Location update

`updateLocation` co luong:

1. Throttle theo socket 1 lan/giay.
2. Validate latitude/longitude la number va nam trong range.
3. Luu `location:{userId}` vao Redis voi TTL 300 giay.
4. Neu co `tripId`, emit `locationUpdate` den room `trip_{tripId}` tren legacy root, `/drivers`, `/customers`.

Dan chung: `registerSocketFlows.js:onUpdateLocation()`, `locationService.isThrottled()`, `locationService.persistLocation()`, `validateLocation()`.

### Backend booking event relay

Booking event duoc parse boi `parseBookingEvent()` va xu ly boi `relayBookingEvent()`.

| Event base | Hanh vi source |
| --- | --- |
| `bookingTrip:Request` | Xac dinh `driverId` tu `payload.driverId`, `target` hoac `payload.target`; emit truc tiep `bookingTrip:Request` den driver voi payload `tripId`. |
| `bookingTrip:Canceled` | Emit `bookingTrip:Canceled:{tripId}` den trip room tren legacy, drivers, customers; neu co `payload.driverId` thi emit them den driver. |
| `bookingTrip:AcceptedTrip` | Emit `bookingTrip:AcceptedTrip:{tripId}` den legacy room va customers room; neu co `target` thi emit den customer. |
| `bookingTrip:ToPickUp` | Emit `bookingTrip:ToPickUp:{tripId}` den trip room tren tat ca namespaces; neu co `target` thi emit den customer. |
| `bookingTrip:DriverCanceled` | Map thanh event client `bookingTrip:Canceled:{tripId}` cho legacy room va customers room; neu co `target` thi emit den customer. |
| `bookingTrip:Started` | Emit `bookingTrip:Started:{tripId}` den tat ca trip room, payload la `tripId`; neu co `target` thi emit den customer. |
| `bookingTrip:Completed` | Emit `bookingTrip:Completed:{tripId}` den tat ca trip room, payload la `payload.data` neu co, fallback `tripId`; neu co `target` thi emit den customer. |
| `bookingTrip:CompletedWithProblem` | Emit `bookingTrip:CompletedWithProblem:{tripId}`; payload gom `{ tripId, problemDescription }` neu co mo ta, fallback `tripId`; neu co `target` thi emit den customer voi payload `tripId`. |

Dan chung: `src/modules/relay/redisRelayService.js:parseBookingEvent()`, `relayBookingEvent()`.

## Generic backend event routing

Khi Redis message khong bat dau bang `bookingTrip:`, source route theo `type`:

- `type=user`: neu `target=admins/admin` emit admin namespace; neu `target=drivers/customers` broadcast namespace; neu target la user id thi tao user room `${userType}_${target}` va emit den driver/customer namespace tuong ung, kem fallback `socketEmitter.emitToDriver()` hoac `emitToCustomer()`.
- `type=trip`: emit den room `trip_{target}` tren legacy, drivers, customers.
- `type=broadcast`: neu co target thi emit den room target; neu khong thi emit ca legacy, drivers, customers.

Dan chung: `src/modules/relay/redisRelayService.js:relayGenericEvent()`.

## Business outcomes cua HTTP emit APIs

- `/driver/event`: backend emit event den mot driver, payload la `trip_id`.
- `/customer/event`: backend emit event den tat ca socket cua customer, payload la `trip_id`.
- `/emit/user`: backend emit event tuy y den user driver/customer voi payload tuy y.
- `/emit/trip`: backend emit event tuy y den room `trip_{tripId}`.
- `/emit/broadcast`: backend broadcast theo `userType` va optional `targetRoom`.

Dan chung: `src/transports/http/registerHttpRoutes.js` va `src/modules/connection/socketEmitterService.js`.

## Chua tim thay trong source

- Khong thay dinh nghia trang thai chuyen di day du nhu enum `Requested/Accepted/Started/Completed` ngoai ten event `bookingTrip:*`.
- Khong thay business rule tinh gia, huy chuyen, phan tai xe, thanh toan, rating.
- Khong thay source of truth cho trip/booking; Socket Service chi relay event.
- Khong thay logic retry/deduplicate/idempotency cho backend events.
- Khong thay schema chuan bat buoc cho payload Redis ngoai cac field duoc doc truc tiep trong `relayGenericEvent()`.
- Khong thay validate `tripId` format, `userId` format hay `userType` trong legacy `authenticate` ngoai check truthy.
