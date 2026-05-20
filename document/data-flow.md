# Data Flow

Cap nhat: 2026-05-20. Tai lieu nay mo ta cac luong du lieu runtime chinh va dan chung source.

## Dan chung source chinh

| Luong | File/function cu the |
| --- | --- |
| Startup | `src/index.js:start()`, `src/app/createRuntime.js:createRuntime()`, `start()` |
| HTTP request | `src/transports/http/registerHttpRoutes.js:registerHttpRoutes()` |
| Socket connection | `src/transports/socket/registerSocketFlows.js:registerSocketFlows()` |
| Redis command state | `src/infrastructure/redis/safeRedisOps.js:createSafeRedisOps()` |
| Optional SQL boot check | `src/infrastructure/sql/createSqlDatabase.js:createSqlDatabase()` |
| Redis Pub/Sub input | `src/transports/redis/subscribeBackendEvents.js:subscribeBackendEvents()` |
| Relay fanout | `src/modules/relay/redisRelayService.js:relayGenericEvent()`, `relayBookingEvent()` |
| Emit helpers | `src/modules/connection/socketEmitterService.js:emitToDriver()`, `emitToCustomer()`, `emitToTrip()`, `emitBroadcast()` |
| Shutdown | `src/app/createRuntime.js:stop()` |

## Startup flow

1. `server.js` load dotenv va require `./src/index`.
2. `src/index.js:start()` goi `createRuntime()`.
3. `createRuntime()` doc env, thu ket noi SQL optional.
4. Neu SQL unavailable, logger ghi error cho Telegram va `resolveRedisTtlPolicy()` cap Redis TTL toi da 7 ngay.
5. Runtime tao Express/HTTP/Socket.IO, Redis clients, registry, metrics va domain services.
6. Dang ky HTTP routes, socket flows va Redis subscriber.
7. `runtime.start()` listen tren `env.port` va cai process handlers.

Dan chung: `server.js`, `src/index.js:start()`, `src/app/createRuntime.js:createRuntime()`.

## Driver/customer connection flow

1. Client ket noi `/drivers` hoac `/customers`.
2. Middleware `parseAuthFromHandshake()` doc Bearer token va `user_id`/`userId`.
3. `authService.verifyUserToken()` verify HS256 neu co `JWT_SECRET`; neu khong co secret thi cho phep backward compatibility.
4. Source gan `socket.userId`, `socket.accessToken`, `socket.userType`.
5. Connection handler join user room, cap nhat in-memory registry va Redis keys.

Redis writes:

- `socket:uid:{userType}:{userId}` add socket id.
- `socket:info:{socketId}` luu metadata.
- `socket:room:{userRoom}` add socket id.

Dan chung: `registerSocketFlows.js:parseAuthFromHandshake()`, `addUserSocket()`, handlers `/drivers` va `/customers`.

## Legacy connection flow

1. Client ket noi namespace `/`.
2. Client emit `authenticate` voi `{ userId, userType }`.
3. Server gan thong tin len socket, cap nhat `registry.legacy`, join room `${userType}_${userId}` va room `${userType}`.
4. Server emit `authenticated`.
5. Neu `updateLocation` truoc khi authenticate, server emit `error { message: "Not authenticated" }`.

Dan chung: `registerSocketFlows.js`, `namespaces.legacy.on("connection")`, event `authenticate`.

## Join/leave trip flow

1. Client emit `joinTrip` voi `tripId`.
2. Server validate `tripId` truthy.
3. `tripRoomService.joinTrip()` join Socket.IO room `trip_{tripId}`, add socket id vao Redis set `socket:room:trip_{tripId}` va set TTL.
4. Server emit `joinedTrip`.
5. `leaveTrip` goi `tripRoomService.leaveTrip()`, remove socket id khoi room set va emit `leftTrip`.

Dan chung: `registerSocketFlows.js` handlers `joinTrip`/`leaveTrip`, `src/modules/trip/tripRoomService.js`.

## Location update flow

1. Client emit `updateLocation` voi `latitude`, `longitude`, optional `tripId`.
2. `locationService.isThrottled(socket.id)` bo qua neu trong 1 giay gan nhat.
3. `validateLocation()` ep number va check range latitude `[-90, 90]`, longitude `[-180, 180]`.
4. `persistLocation()` ghi Redis hash `location:{userId}` va expire 300 giay.
5. Neu co `tripId`, server emit `locationUpdate` den:
   - legacy root room `trip_{tripId}`;
   - `/drivers` room `trip_{tripId}`;
   - `/customers` room `trip_{tripId}`.

Dan chung: `registerSocketFlows.js:onUpdateLocation()`, `locationService.js`, `validateLocation.js`.

## HTTP backend emit flow

### `/emit/user`

1. Express middleware `requireBackendSecret()` validate `x-api-key` hoac Bearer token.
2. Handler validate `userType`, `userId`, `eventName`.
3. `emitToUserCompat()` goi `socketEmitter.emitToUser()` hoac fallback driver/customer methods.
4. Emitter uu tien memory registry, sau do lay Redis socket ids bang `smembers(socket:uid:{userType}:{userId})`.
5. Neu co socket ids thi emit event va tra `socketCount`.

Dan chung: `registerHttpRoutes.js:requireBackendSecret()`, `emitToUserCompat()`, `socketEmitterService.emitToUser()`.

### `/emit/trip`

1. Middleware auth nhu tren.
2. Validate `tripId`, `eventName`.
3. `socketEmitter.emitToTrip()` emit den `trip_{tripId}` tren legacy root, `/drivers`, `/customers`.

Dan chung: `registerHttpRoutes.js`, `socketEmitterService.emitToTrip()`.

### `/emit/broadcast`

1. Middleware auth nhu tren.
2. Validate `eventName` va `userType`.
3. `socketEmitter.emitBroadcast()` emit theo namespace hoac room.

Dan chung: `registerHttpRoutes.js`, `socketEmitterService.emitBroadcast()`.

## Redis Pub/Sub backend flow

1. Runtime subscribe channel `bechill:events`.
2. Khi Redis message den, source `JSON.parse(message)`.
3. Neu parse thanh cong, metrics record valid Redis message.
4. `relayGenericEvent(event)` quyet dinh special booking flow hay generic flow.
5. Neu parse loi, metrics record invalid va logger ghi `REDIS_EVENT`.

Dan chung: `src/transports/redis/subscribeBackendEvents.js:subscribeBackendEvents()`.

## Booking event relay flow

`relayGenericEvent()` route vao `relayBookingEvent()` neu `event.eventName` bat dau bang `bookingTrip:`.

1. `parseBookingEvent()` lay `tripId` tu `payload.data` neu la object, hoac tu `payload.data` primitive, hoac tu suffix `bookingTrip:*:{tripId}`.
2. Moi event base co fanout rieng den driver/customer/trip room.
3. Metrics record relay event theo base event.
4. Loi async trong booking relay duoc catch va log trong `relayGenericEvent()`.

Dan chung: `src/modules/relay/redisRelayService.js:parseBookingEvent()`, `relayBookingEvent()`, `relayGenericEvent()`.

## Disconnect cleanup flow

1. Record disconnect metrics.
2. Xoa socket khoi in-memory registry.
3. `cleanupSocket()` remove socket id khoi `socket:uid:{userType}:{userId}`.
4. Neu set user-socket con 0 thi xoa key.
5. Xoa `socket:info:{socketId}`.
6. Remove socket id khoi moi Redis room set trong `socket.rooms`.
7. Clear location throttle state cua socket.

Dan chung: `registerSocketFlows.js:cleanupSocket()`, `removeUserSocket()`.

## Shutdown flow

1. Process signal/error goi `stop(signal)`.
2. Fetch va disconnect tat ca sockets.
3. Quit Redis command/subscriber clients.
4. Close Socket.IO server va HTTP server.
5. Log stopped.

Dan chung: `src/app/createRuntime.js:stop()`, `installProcessHandlers()`.

## Chua tim thay trong source

- Khong thay event bus/queue bền vững ngoai Redis Pub/Sub.
- Khong thay dead-letter queue cho Redis messages parse loi hoac relay loi.
- Khong thay idempotency key/deduplication cho backend events.
- Khong thay multi-instance room synchronization bang Socket.IO Redis adapter.
- Khong thay flow doc tu backend .NET source; chi suy ra tu contract payload va fixture trong `document/fixtures/backend-bookingtrip-payloads.sample.json`.
- Khong thay flow ghi/doc du lieu SQL ngoai boot-time connectivity check.
