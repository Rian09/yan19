# BOT PENGADUAN WHATSAPP

Versi ini disesuaikan dengan struktur project yang Anda kirim.

## Fitur
- WhatsApp Web + QR Code
- Baileys
- Menu layanan interaktif
- Pengguna tidak perlu mengetik angka 1-6
- Pengaduan mendapatkan nomor tiket otomatis
- Database JSON di `data/pengaduan.json`
- Cek status pengaduan
- Menu otomatis muncul kembali setelah layanan selesai

## Menjalankan

Pastikan Node.js sudah terpasang.

```bash
npm install
npm start
```

Kemudian scan QR yang muncul di terminal:
WhatsApp > Perangkat tertaut > Tautkan perangkat.

## Catatan
`package.json` mempertahankan `@whiskeysockets/baileys: latest` sesuai file sumber Anda. Setelah `npm install`, npm akan memasang versi terbaru yang tersedia saat itu.

Jika menu interaktif tidak didukung oleh versi Baileys/WhatsApp yang sedang terpasang, versi yang terpasang perlu dikunci ke versi yang kompatibel.
