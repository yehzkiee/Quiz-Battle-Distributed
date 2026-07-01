# Quiz Battle Distributed

Quiz Battle Distributed adalah aplikasi kuis multiplayer realtime berbasis microservices. Pemain dapat register/login, masuk lobby, membuat atau join room, bermain kuis pilihan ganda secara realtime, chat di dalam room, melihat hasil skor multiplayer, dan masuk ke leaderboard.

Project ini dibuat untuk menunjukkan konsep distributed system menggunakan Docker, Nginx API Gateway, PostgreSQL replication, PGPool, Valkey cache, JWT authentication, gRPC, WebSocket, dan beberapa backend service terpisah.

## Fitur Utama

- Register dan login user dengan JWT.
- Role-based access: `root_admin`, `admin`, `instructor`, dan `user`.
- Lobby, Matchmaking, Ranking, dan Settings.
- Public room dan private room dengan kode unik.
- Host/Admin room dapat memulai quiz.
- Semua player masuk quiz secara realtime saat host menekan Start Quiz.
- Quiz multiplayer dinamis, tidak hanya 1 vs 1.
- Bank soal pilihan ganda A-D.
- Quiz menampilkan 5 soal acak dari bank soal.
- Timer absolut 30 detik per soal.
- Jawaban benar/salah diberi tanda sebelum lanjut soal berikutnya.
- Skor akhir semua player ditampilkan setelah quiz selesai.
- Chat realtime dalam room.
- Leaderboard/ranking berdasarkan total poin.
- User dapat mengganti display name maksimal 1 kali.
- Root admin dapat mengelola user.
- Admin/instructor dapat mengelola soal.
- PostgreSQL primary-standby replication.
- Nginx sebagai API Gateway dan load balancer.
- Cloudflare Tunnel untuk demo public URL.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Fastify
- Realtime: WebSocket
- Service-to-service: gRPC
- Database: PostgreSQL
- Database proxy: PGPool
- Cache: Valkey Redis-compatible
- Gateway: Nginx
- Container: Docker Compose
- Public tunnel: Cloudflared

## Arsitektur Singkat

```text
Browser / Player
      |
      v
Nginx API Gateway
      |
      +--> Frontend
      +--> Login Service
      +--> User Service 1
      +--> User Service 2
      +--> Matchmaking Service
      +--> Signaling Service
      +--> Ranking Service
      +--> Saga Service
      |
      v
PGPool
      |
      +--> PostgreSQL Primary
      +--> PostgreSQL Standby

Ranking Service --> Valkey Cache
Cloudflared Tunnel --> Nginx API Gateway
```

## Service dan Fungsinya

### 1. Frontend

Frontend adalah tampilan aplikasi yang digunakan player dan admin.

Fungsinya:

- Menampilkan halaman login/register.
- Menampilkan lobby.
- Menampilkan matchmaking.
- Menampilkan room public/private.
- Menampilkan quiz duel.
- Menampilkan ranking.
- Menampilkan settings.
- Menyimpan JWT token di browser localStorage.

### 2. Nginx Load Balancer / API Gateway

Nginx adalah pintu masuk utama aplikasi.

Fungsinya:

- Menerima request dari browser.
- Mengarahkan request ke service yang sesuai.
- Menyatukan frontend dan backend dalam satu alamat.
- Menjadi gateway untuk REST API dan WebSocket.
- Membantu load balancing ke `user-service-1` dan `user-service-2`.

Contoh routing:

```text
/                 -> frontend
/api/auth         -> login-service
/api/users        -> user-service cluster
/api/questions    -> user-service cluster
/api/rooms        -> user-service cluster
/api/matchmaking  -> matchmaking-service
/api/ranking      -> ranking-service
/api/saga         -> saga-service
/ws/signaling     -> signaling-service
```

Konfigurasi gateway ada di:

```text
nginx/nginx.conf
```

### 3. Login Service

Login Service mengurus autentikasi.

Fungsinya:

- Register akun baru.
- Login user.
- Memvalidasi username dan password.
- Membuat JWT token.
- Verifikasi JWT token.

### 4. User Service

User Service adalah service data utama aplikasi.

Fungsinya:

- Mengelola data user.
- Mengelola role user.
- Mengelola display name.
- Membatasi ganti nama maksimal 1 kali.
- Mengelola poin user.
- Mengelola bank soal.
- Mengelola room quiz.
- Mengelola hasil pertandingan.
- Menyediakan gRPC server untuk validasi user.

Project menjalankan dua instance:

```text
user-service-1
user-service-2
```

Tujuannya untuk menunjukkan service replication dan load balancing.

### 5. Matchmaking Service

Matchmaking Service mengatur pencarian lawan.

Fungsinya:

- Menaruh player ke queue matchmaking.
- Mencari player lain.
- Membuat match.
- Menghubungkan player ke room.
- Berkomunikasi ke User Service melalui gRPC untuk validasi user.

### 6. Signaling Service

Signaling Service menangani komunikasi realtime.

Fungsinya:

- Player join room secara realtime.
- Update daftar player room.
- Broadcast event Start Quiz.
- Sinkronisasi status quiz.
- Mengirim chat room.
- Mengirim update skor.
- Mengirim event hasil quiz.

### 7. Ranking Service

Ranking Service mengelola leaderboard cepat.

Fungsinya:

- Menyimpan update leaderboard ke Valkey.
- Mengambil ranking pemain.
- Menampilkan posisi player berdasarkan poin.

### 8. Saga Service

Saga Service mengatur transaksi terdistribusi setelah pertandingan selesai.

Fungsinya:

- Menerima event match finished.
- Update poin user melalui User Service.
- Update ranking melalui Ranking Service.
- Melakukan rollback poin jika update leaderboard gagal.

### 9. PostgreSQL Primary

PostgreSQL Primary adalah database utama.

Fungsinya:

- Menyimpan data user.
- Menyimpan bank soal.
- Menyimpan room.
- Menyimpan hasil quiz.
- Menyimpan poin dan role.
- Menerima operasi tulis seperti insert, update, dan delete.

### 10. PostgreSQL Standby

PostgreSQL Standby adalah replika database.

Fungsinya:

- Menyimpan salinan data dari primary.
- Menjadi backup/replika.
- Mendukung konsep high availability.
- Menunjukkan database replication.

### 11. PGPool

PGPool adalah proxy database.

Fungsinya:

- Menjadi penghubung service backend ke PostgreSQL.
- Mengatur koneksi ke primary dan standby.
- Mendukung load balancing database.
- Membantu failover.

### 12. Valkey Cache

Valkey adalah cache Redis-compatible.

Fungsinya:

- Menyimpan leaderboard cepat.
- Menyimpan data sementara.
- Mendukung akses data cepat untuk Ranking Service.

### 13. Cloudflared Tunnel

Cloudflared membuat aplikasi lokal dapat diakses melalui public URL.

Fungsinya:

- Membuat URL `https://...trycloudflare.com`.
- Mengarahkan traffic public ke Nginx.
- Memudahkan demo online tanpa hosting manual.

## Database

Database utama bernama:

```text
quiz_db
```

Credential database dibaca dari file `.env` lokal. Gunakan `.env.example` sebagai template, lalu isi nilai rahasia di `.env` yang tidak ikut Git.

Volume Docker:

```text
quiz-battle-distributed_pg-primary-data
quiz-battle-distributed_pg-standby-data
```

### Tabel Penting

#### `users`

Menyimpan akun dan profil pemain.

Data penting:

- `id`
- `username`
- `password`
- `role`
- `display_name`
- `rename_used`
- `points`

#### `questions`

Menyimpan bank soal pilihan ganda.

Data penting:

- `question_text`
- `option_a`
- `option_b`
- `option_c`
- `option_d`
- `correct_option`
- `points`
- `difficulty`
- `created_by`

#### `quiz_rooms`

Menyimpan data room.

Data penting:

- `code`
- `title`
- `visibility`
- `question_ids`
- `members`
- `host_user_id`
- `max_players`
- `status`
- `started_at`

#### `quiz_match_results`

Menyimpan hasil quiz.

Data penting:

- `room_code`
- `user_id`
- `username`
- `score`
- `correct_count`
- `total_questions`
- `elapsed_ms`
- `answers`
- `completed_at`

## JWT Authentication

JWT token digunakan sebagai identitas digital user setelah login.

Alur JWT:

```text
User login
  -> Login Service validasi username/password
  -> Login Service membuat JWT token
  -> Token dikirim ke frontend
  -> Frontend menyimpan token di localStorage
  -> Token dikirim pada request API berikutnya
  -> Backend memverifikasi token dan role user
```

Token disimpan di browser:

```text
localStorage key: quiz-token
```

Data user disimpan di:

```text
localStorage key: quiz-user
```

Header request:

```text
Authorization: Bearer <jwt-token>
```

JWT berisi data seperti:

- `id`
- `username`
- `role`
- `iat`
- `exp`

## Role dan Hak Akses

### Root Admin

- Mengelola semua akun user.
- Menghapus user.
- Melihat action management pada ranking/user manager.
- Mengelola soal.
- Memilih bank soal room.

### Admin

- Mengelola soal.
- Mengakses fitur admin tertentu.

### Instructor

- Mengelola bank soal.

### User

- Bermain quiz.
- Join room.
- Melihat ranking.
- Mengubah display name maksimal 1 kali.

## Akun Demo

Akun default dapat dibuat otomatis jika variabel berikut diisi pada `.env`:

```text
Root Admin:
username: ROOT_ADMIN_USERNAME
password: ROOT_ADMIN_PASSWORD

Admin:
username: DEFAULT_ADMIN_USERNAME
password: DEFAULT_ADMIN_PASSWORD

Instructor:
username: DEFAULT_INSTRUCTOR_USERNAME
password: DEFAULT_INSTRUCTOR_PASSWORD
```

User biasa dapat dibuat melalui halaman register.

## Cara Menjalankan Project

Pastikan Docker Desktop sudah berjalan.

```powershell
cd D:\Kompar_Job\quiz-battle-distributed
docker compose up --build
```

Buka aplikasi:

```text
http://localhost
```

Atau:

```text
http://localhost:8080
```

## Public URL dengan Cloudflare Tunnel

Setelah Docker Compose berjalan, cek URL public:

```powershell
docker compose logs --tail=80 cloudflared-tunnel
```

Cari tulisan:

```text
Your quick Tunnel has been created! Visit it at:
https://....trycloudflare.com
```

Catatan:

- URL quick tunnel berubah saat container tunnel dibuat ulang.
- Untuk production, gunakan named tunnel dari Cloudflare.

## Cek Container

Menampilkan semua container:

```powershell
docker compose ps
```

Menampilkan nama service:

```powershell
docker compose ps --services
```

Menghitung service:

```powershell
docker compose ps --services | Measure-Object
```

Total container utama project ini:

```text
14 container
```

Daftar container:

```text
frontend
nginx-lb
login-service
user-service-1
user-service-2
matchmaking-service
signaling-service
ranking-service
saga-service
postgresql-primary
postgresql-standby
pgpool
valkey-cache
cloudflared-tunnel
```

## Cek Health Service

```powershell
Invoke-RestMethod http://localhost/api/auth/health
Invoke-RestMethod http://localhost/api/users/health
Invoke-RestMethod http://localhost/api/questions/health
Invoke-RestMethod http://localhost/api/ranking/health
Invoke-RestMethod http://localhost/api/saga/health
```

Jika normal, service mengembalikan status `ok`.

## Cek Database dari Terminal

Masuk ke PostgreSQL:

```powershell
docker compose exec -e PGPASSWORD=$env:POSTGRES_PASSWORD postgresql-primary psql -U postgres -d quiz_db
```

Melihat tabel:

```sql
\dt
```

Melihat user:

```sql
SELECT id, username, display_name, role, points FROM users ORDER BY id;
```

Melihat soal:

```sql
SELECT id, question_text, correct_option, points FROM questions LIMIT 10;
```

Melihat room:

```sql
SELECT code, title, visibility, status, max_players FROM quiz_rooms ORDER BY created_at DESC LIMIT 10;
```

Melihat hasil quiz:

```sql
SELECT room_code, user_id, username, score, correct_count, total_questions, completed_at
FROM quiz_match_results
ORDER BY completed_at DESC
LIMIT 10;
```

Keluar dari PostgreSQL:

```sql
\q
```

## Cek Replikasi PostgreSQL

Primary:

```powershell
docker compose exec -e PGPASSWORD=$env:POSTGRES_PASSWORD postgresql-primary psql -U postgres -d quiz_db -c "SELECT pg_is_in_recovery();"
```

Hasil `f` berarti primary.

Standby:

```powershell
docker compose exec -e PGPASSWORD=$env:POSTGRES_PASSWORD postgresql-standby psql -U postgres -d quiz_db -c "SELECT pg_is_in_recovery();"
```

Hasil `t` berarti standby/replika.

## Cek JWT di Browser

Setelah login:

1. Buka browser.
2. Tekan `F12`.
3. Buka tab Application.
4. Pilih Local Storage.
5. Pilih domain `http://localhost` atau URL Cloudflare.
6. Cari key `quiz-token`.

Decode payload JWT lewat Console:

```javascript
const token = localStorage.getItem('quiz-token');
JSON.parse(atob(token.split('.')[1]));
```

## Cek Log

```powershell
docker compose logs --tail=50 nginx-lb
docker compose logs --tail=50 login-service
docker compose logs --tail=50 user-service-1
docker compose logs --tail=50 matchmaking-service
docker compose logs --tail=50 signaling-service
docker compose logs --tail=50 cloudflared-tunnel
```

## Script Verifikasi Kritis

Project menyediakan script:

```text
scripts/verify-critical.ps1
```

Jalankan di PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\verify-critical.ps1
```

Script ini membantu mengecek service penting, endpoint API, role, soal, Saga, container, dan replikasi.

## Alur Aplikasi

```text
1. User membuka aplikasi melalui browser.
2. Request masuk ke Nginx.
3. User login/register melalui Login Service.
4. Frontend menyimpan JWT token.
5. User masuk Lobby.
6. User memilih Matchmaking atau membuat Room.
7. Public room muncul di Matchmaking.
8. Private room hanya bisa diakses dengan kode unik.
9. Host menekan Start Quiz.
10. Signaling Service mengirim event realtime ke semua player.
11. Semua player masuk halaman Quiz Duel.
12. Player menjawab 5 soal acak.
13. Server menghitung skor.
14. Hasil quiz disimpan ke PostgreSQL.
15. Saga Service update poin dan leaderboard.
16. Ranking menampilkan poin terbaru.
```

## Penjelasan Singkat untuk Presentasi

Project ini adalah aplikasi Quiz Battle berbasis microservices. Setiap fungsi utama dipisah menjadi service yang berbeda, seperti Login Service untuk autentikasi, User Service untuk data utama, Matchmaking Service untuk pencarian lawan, Signaling Service untuk realtime, Ranking Service untuk leaderboard, dan Saga Service untuk transaksi poin. Semua request masuk melalui Nginx sebagai API Gateway.

Database menggunakan PostgreSQL primary dan standby. Primary digunakan untuk menyimpan data utama, sedangkan standby menjadi replika. PGPool digunakan sebagai proxy database agar backend cukup terhubung ke satu endpoint database. Valkey digunakan sebagai cache leaderboard. JWT digunakan untuk mengenali user yang sudah login dan membatasi akses berdasarkan role.

Dengan Docker Compose, seluruh service dapat dijalankan sekaligus, sehingga aplikasi mudah dijalankan dan didemokan.

## Kontribusi Tim

Project ini dikembangkan oleh:

- Abdi Arya Pratama
- Devin Ammar Santoso
- Rezaul Karim
- Ridwan Rafiansyah
- William Jenkins Sinaga
- Yehezkiel Hotmatua Suranta Dongoran

## Pertanyaan yang Sering Muncul Saat Presentasi

### Apa fungsi Nginx?

Nginx berfungsi sebagai API Gateway dan load balancer. Semua request dari browser masuk ke Nginx, lalu diteruskan ke service yang sesuai.

### Apa fungsi JWT?

JWT digunakan sebagai identitas user setelah login. Token dikirim pada setiap request API agar backend dapat mengetahui siapa user tersebut dan apa role-nya.

### Apa fungsi PostgreSQL?

PostgreSQL menyimpan data permanen seperti user, soal, room, hasil quiz, dan poin.

### Apa fungsi PostgreSQL Standby?

Standby menyimpan salinan data dari primary sebagai replika dan backup.

### Apa fungsi PGPool?

PGPool mengatur koneksi backend ke PostgreSQL primary dan standby.

### Apa fungsi Valkey?

Valkey menyimpan data cepat seperti leaderboard cache.

### Apa fungsi Signaling Service?

Signaling Service mengirim event realtime seperti player join, chat, start quiz, update skor, dan hasil quiz.

### Apa fungsi Saga Service?

Saga Service mengatur proses update poin dan leaderboard setelah quiz selesai agar data tetap konsisten.

### Kenapa memakai Docker?

Docker membuat semua service dapat dijalankan dengan environment yang konsisten menggunakan satu perintah.

### Apakah project ini sudah microservices?

Ya. Project ini memisahkan fitur utama ke beberapa service berbeda dan menjalankannya sebagai container terpisah.

## GitHub Push

Jika repository belum pernah dibuat di GitHub:

```powershell
git init
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Jika repository sudah ada remote:

```powershell
git add .
git commit -m "Update project documentation"
git push
```
