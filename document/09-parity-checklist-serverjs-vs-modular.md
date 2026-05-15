# 09 - Checklist parity server.js va runtime module hoa

## Muc tieu

Checklist nay dung de doi chieu tung tinh nang tu runtime cu [server.js](../server.js) sang runtime module hoa trong [src/index.js](../src/index.js), dam bao luong cu van on dinh nhu truoc khi cutover.

## Pham vi doi chieu

- Runtime cu: [server.js](../server.js)
- Runtime moi: [src/app/createRuntime.js](../src/app/createRuntime.js)
- Socket flows moi: [src/transports/socket/registerSocketFlows.js](../src/transports/socket/registerSocketFlows.js)
- HTTP routes moi: [src/transports/http/registerHttpRoutes.js](../src/transports/http/registerHttpRoutes.js)
- Redis relay moi: [src/modules/relay/redisRelayService.js](../src/modules/relay/redisRelayService.js)
- Service room: [src/modules/trip/tripRoomService.js](../src/modules/trip/tripRoomService.js)
- Service location: [src/modules/location/locationService.js](../src/modules/location/locationService.js)
- Service emitter: [src/modules/connection/socketEmitterService.js](../src/modules/connection/socketEmitterService.js)

## Ma tran doi chieu tinh nang

Quy uoc cot "Trang thai":

- Done: da migrate + co test tu dong/kiem chung
- Partial: da migrate nhung con thieu test contract hoac soak
- Missing: chua migrate

| Nhom tinh nang | server.js | Module moi | Trang thai | Cach xac nhan |
| --- | --- | --- | --- | --- |
| Health check /health | Co | Co | Done | Chay GET /health, doi chieu schema response |
| POST /driver/event | Co | Co | Done | Test tu dong + test online/offline thuc te |
| POST /customer/event | Co | Co | Done | Test tu dong + test online/offline thuc te |
| Driver auth handshake | Co | Co | Done | Ket noi /drivers voi header Bearer + user_id |
| Customer auth handshake | Co | Co | Done | Ket noi /customers voi header Bearer + user_id |
| Legacy authenticate event | Co | Co | Done | Thu updateLocation truoc/sau authenticate |
| joinTrip/leaveTrip | Co | Co | Done | Kiem tra joinedTrip/leftTrip + room tracking |
| updateLocation throttle/validate/persist | Co | Co | Partial | Can smoke test voi Redis that va payload that |
| Redis relay generic user/trip/broadcast | Co | Co | Partial | Can test voi payload backend that |
| Redis relay bookingTrip:* dac thu | Co | Co | Partial | Can contract test edge cases payload |
| Driver single active socket | Co | Co | Done | Ket noi 2 socket cung user driver, socket cu bi da |
| Customer multi socket | Co | Co | Done | Ket noi nhieu socket cung customer, fanout day du |
| Graceful shutdown | Co | Co | Partial | Can test kill signal trong staging |
| Admin monitor namespace | Co | Da co middleware + event handlers co ban | Partial | Can chot monitoring checklist truoc cutover |
| JWT verify user that su | Chua day du | Da verify HS256/exp khi co JWT_SECRET | Partial | Can xac nhan rollout staging bat buoc secret |

## Checklist kiem thu truoc cutover

### 1) Test tu dong phai pass

1. Chay `npm test`
2. Ket qua phai pass toan bo test trong thu muc `test/`

### 2) Smoke test bang client that

1. /drivers: connect, joinTrip, updateLocation, leaveTrip, disconnect
2. /customers: connect da thiet bi, joinTrip, updateLocation, fanout event
3. / (legacy): authenticate truoc khi updateLocation

### 3) Relay test voi payload backend that

1. Publish `bookingTrip:Request` co/khong co driverId
2. Publish `bookingTrip:Canceled`, `bookingTrip:AcceptedTrip`, `bookingTrip:Started`, `bookingTrip:Completed`, `bookingTrip:CompletedWithProblem`
3. Doi chieu eventName va payload toi dung namespace/room/target

### 4) HTTP endpoint compatibility

1. `POST /driver/event`:

- 400 khi thieu user_id/trip_id/socket_event
- 404 khi user offline
- 200 khi user online

1. `POST /customer/event`:

- 400 khi input invalid
- 404 khi user offline
- 200 + `socketCount` khi user online

### 5) Redis key va cleanup

1. Tao ket noi moi va xac nhan key `socket:uid:*`, `socket:info:*`, `socket:room:*` duoc tao
2. Disconnect va xac nhan cleanup key/member nhu ky vong
3. Xac nhan `location:{userId}` co TTL dung

### 6) Stability gate

1. Chay soak test toi thieu 24h tren staging
2. Khong co crash process
3. Ty le loi parse Redis message nam trong nguong chap nhan

## Danh sach test tu dong hien co

- HTTP routes tests: [test/transports/http/registerHttpRoutes.test.js](../test/transports/http/registerHttpRoutes.test.js)
- Socket flows tests: [test/transports/socket/registerSocketFlows.test.js](../test/transports/socket/registerSocketFlows.test.js)
- Relay tests: [test/modules/relay/redisRelayService.test.js](../test/modules/relay/redisRelayService.test.js)

Coverage da co:

- /health, /driver/event, /customer/event (bao gom ca customer offline 404)
- Driver auth flow, join/leave trip, updateLocation, cleanup disconnect
- Legacy authenticate gate truoc updateLocation
- Driver single-active socket policy
- Customer multi-socket policy
- bookingTrip:Request va bookingTrip:Completed relay + generic trip relay

## Ghi chu quyet dinh cutover

- Chi doi `npm start` sang runtime module hoa sau khi:

1. Tat ca test tu dong pass
2. Tat ca muc Partial trong checklist duoc xac nhan bang contract/smoke test
3. Muc Missing duoc chap nhan tri hoan co ke hoach bu tru ro rang
