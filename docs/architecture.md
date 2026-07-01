# Architecture

## Pendahuluan

Quiz Battle Distributed System adalah game kuis tebak kata real-time 1 vs 1. Aplikasi ini dibuat untuk menunjukkan konsep sistem terdistribusi melalui microservices, load balancing, RPC, database replication, cache, real-time communication, fault tolerance, dan distributed transaction.

## Komponen

- Vite React Client: login, register, lobby, matchmaking, quiz room, leaderboard.
- Nginx: gateway, reverse proxy, dan load balancer untuk User Service.
- Login Service: register, login, JWT, verify token.
- User Service: penyimpanan user, poin, REST API, dan gRPC server.
- Matchmaking Service: queue pemain dan validasi user melalui gRPC.
- Signaling Service: WebSocket signaling untuk WebRTC.
- Ranking Service: leaderboard cepat memakai Valkey sorted set.
- Saga Service: orkestrasi update poin dan leaderboard dengan rollback.
- PGPool: proxy koneksi PostgreSQL.
- PostgreSQL Primary-Standby: rancangan replication dan failover.

## Alur Utama

1. Player register atau login melalui Login Service.
2. Login Service menyimpan atau membaca user melalui User Service.
3. User Service menyimpan data di PostgreSQL lewat PGPool.
4. Player menekan cari lawan di frontend.
5. Matchmaking Service memvalidasi user ke User Service melalui gRPC.
6. Dua player dibuatkan room.
7. Player masuk Quiz Room dan membuka WebSocket ke Signaling Service.
8. WebSocket dipakai untuk offer, answer, dan ICE candidate.
9. WebRTC DataChannel dipakai untuk event jawaban antar player.
10. Saat match selesai, frontend mengirim hasil ke Saga Service.
11. Saga Service update poin user, lalu update Ranking Service.
12. Jika leaderboard gagal, Saga Service rollback poin user.

## Fault Tolerance

- Nginx memiliki upstream user_service_cluster berisi user-service-1 dan user-service-2.
- PostgreSQL memakai primary dan standby di belakang PGPool.
- Ranking Service terpisah dari service lain, sehingga kegagalannya tidak mematikan login atau matchmaking.
- Saga Service mengembalikan poin user jika update leaderboard gagal.
