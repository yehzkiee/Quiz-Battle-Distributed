# Distributed Transaction with Saga Pattern

Saga Service menjaga konsistensi antara poin user di PostgreSQL dan leaderboard di Valkey.

## Alur Commit

1. Saga Service menerima userId, username, dan points.
2. Saga Service memanggil User Service: PATCH /users/:id/points.
3. User Service menambahkan poin di PostgreSQL.
4. Saga Service memanggil Ranking Service: POST /ranking/update.
5. Ranking Service menyimpan skor terbaru ke Valkey sorted set.
6. Saga selesai dengan status committed.

## Alur Rollback

1. Update poin user berhasil.
2. Update leaderboard gagal karena Ranking Service atau Valkey bermasalah.
3. Saga Service memanggil User Service: PATCH /users/:id/points/rollback.
4. User Service mengurangi kembali poin yang baru ditambahkan.
5. Saga selesai dengan status rolled_back.

## Alasan Dipakai

Transaksi database tunggal tidak cukup karena data tersebar di PostgreSQL dan Valkey melalui service berbeda. Saga Pattern membuat setiap langkah punya aksi kompensasi ketika langkah berikutnya gagal.
