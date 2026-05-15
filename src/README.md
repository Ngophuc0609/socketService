# Modular Runtime Blueprint

Thu muc src la khung kien truc dich de chuyen doi dan tu server.js monolith sang cau truc module hoa.

## Muc tieu

- Tach ro domain logic, transport, infrastructure va config.
- Giu hanh vi nghiep vu hien tai cua SocketServer.
- Cho phep rollout theo tung giai doan, khong gay dung he thong.

## Cau truc

- app: ghep runtime va dependency graph
- config: doc/casting bien moi truong
- infrastructure: logger, redis, connection registry
- modules: auth, location, trip, relay
- transports: http, socket, redis
- shared: constants va helpers dung chung

## Luu y

- Runtime hien tai van la server.js.
- Khung nay de phat trien va migrate dan theo lo trinh trong tai lieu document.
