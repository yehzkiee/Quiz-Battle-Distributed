# API Documentation

Base URL via Nginx: http://localhost

## Auth API

### POST /api/auth/register

Body:

~~~json
{ "username": "william", "password": "<your-password>" }
~~~

Response:

~~~json
{ "token": "jwt", "user": { "id": 1, "username": "william", "points": 0 } }
~~~

### POST /api/auth/login

Body:

~~~json
{ "username": "william", "password": "<your-password>" }
~~~

### GET /api/auth/verify

Header:

~~~http
Authorization: Bearer <token>
~~~

## User API

- GET /api/users/:id
- GET /api/users/by-username/:username
- PATCH /api/users/:id/points
- PATCH /api/users/:id/points/rollback

Update points body:

~~~json
{ "points": 10 }
~~~

## Matchmaking API

### POST /api/matchmaking/join

~~~json
{ "userId": 1 }
~~~

Matched response:

~~~json
{
  "status": "matched",
  "roomId": "room-abcd1234",
  "players": [
    { "id": 1, "username": "william" },
    { "id": 2, "username": "rival" }
  ]
}
~~~

Other endpoints:

- POST /api/matchmaking/leave
- GET /api/matchmaking/status/:userId

## Signaling WebSocket

Endpoint: ws://localhost/ws/signaling

Events:

- join-room
- player-ready
- webrtc-offer
- webrtc-answer
- ice-candidate
- player-left
- quiz-event

## Ranking API

- GET /api/ranking
- POST /api/ranking/update

Update body:

~~~json
{ "userId": 1, "username": "william", "points": 50 }
~~~

## Saga API

### POST /api/saga/match-finished

~~~json
{ "userId": 1, "username": "william", "points": 10 }
~~~

Jika Ranking Service gagal, Saga Service memanggil rollback poin di User Service.
