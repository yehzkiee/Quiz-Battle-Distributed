# Testing Scenario

## Health Check

~~~bash
curl http://localhost/api/auth/health
curl http://localhost/api/users/health
curl http://localhost/api/matchmaking/health
curl http://localhost/api/ranking/health
curl http://localhost/api/saga/health
~~~

## Register dan Login

~~~bash
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"william","password":"<your-password>"}'

curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"william","password":"<your-password>"}'
~~~

## Matchmaking

Jalankan dua user berbeda:

~~~bash
curl -X POST http://localhost/api/matchmaking/join \
  -H "Content-Type: application/json" \
  -d '{"userId":1}'

curl -X POST http://localhost/api/matchmaking/join \
  -H "Content-Type: application/json" \
  -d '{"userId":2}'
~~~

## Saga dan Leaderboard

~~~bash
curl -X POST http://localhost/api/saga/match-finished \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"username":"william","points":10}'

curl http://localhost/api/ranking
~~~

## Fault Tolerance

### User Service Instance Mati

~~~bash
docker stop quiz_user_service_1
curl http://localhost/api/users/health
~~~

Nginx harus mengarahkan request ke user-service-2.

### Ranking Service Mati

~~~bash
docker stop quiz_ranking_service
curl -X POST http://localhost/api/saga/match-finished \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"username":"william","points":10}'
~~~

Hasil yang diharapkan: Saga Service mengembalikan status rollback.

### PostgreSQL Primary Mati

~~~bash
docker stop quiz_postgresql_primary
~~~

PGPool dan standby disiapkan sebagai rancangan fault tolerance database. Untuk demo failover penuh, standby perlu dipromosikan sesuai prosedur PostgreSQL/PGPool.
