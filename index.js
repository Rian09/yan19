const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  proto
} = require('@whiskeysockets/baileys');

const P = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const DATA = './data/pengaduan.json';

if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data', { recursive: true });
}
if (!fs.existsSync(DATA)) {
  fs.writeFileSync(DATA, '[]');
}

const OPENING = `*🇮🇩 SELAMAT DATANG DI PORTAL PENGADUAN DAN ASPIRASI MASYARAKAT
YONIF TP 953/HARIMAU RAWA 🇮🇩*

Portal ini merupakan sarana komunikasi masyarakat untuk menyampaikan laporan pengaduan informasi serta aspirasi.

Kami akan menerima dan menindaklanjutinya sesuai ketentuan yang berlaku.

*Apakah ada yang bisa kami bantu?*`;

const sessions = new Map();

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return [];
  }
}

function saveData(data) {
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}

function nextId() {
  const data = loadData();
  const year = new Date().getFullYear();

  // Cari nomor terbesar pada tahun berjalan agar nomor tetap aman
  let max = 0;
  for (const item of data) {
    const m = String(item.id || '').match(new RegExp(`^ADU-${year}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }

  return `ADU-${year}-${String(max + 1).padStart(4, '0')}`;
}

/*
 * Menu interaktif nativeFlow.
 * Pengguna cukup klik "PILIH LAYANAN", lalu memilih salah satu layanan.
 */
async function sendMenu(sock, jid) {
  await sock.sendMessage(jid, { text: OPENING });

  const message = generateWAMessageFromContent(
    jid,
    proto.Message.fromObject({
      interactiveMessage: {
        body: {
          text: 'Silakan pilih layanan yang Anda perlukan:'
        },
        footer: {
          text: 'YONIF TP 953/HARIMAU RAWA'
        },
        header: {
          title: '🇮🇩 MENU LAYANAN',
          subtitle: 'Portal Pengaduan & Aspirasi Masyarakat',
          hasMediaAttachment: false
        },
        nativeFlowMessage: {
          buttons: [
            {
              name: 'single_select',
              buttonParamsJson: JSON.stringify({
                title: '📋 PILIH LAYANAN',
                sections: [
                  {
                    title: 'LAYANAN MASYARAKAT',
                    rows: [
                      {
                        title: '📋 Pengaduan',
                        description: 'Sampaikan pengaduan masyarakat',
                        id: 'pengaduan'
                      },
                      {
                        title: '💬 Aspirasi',
                        description: 'Sampaikan saran dan aspirasi',
                        id: 'aspirasi'
                      },
                      {
                        title: '📢 Informasi',
                        description: 'Kirim informasi kepada petugas',
                        id: 'informasi'
                      },
                      {
                        title: '🔎 Cek Pengaduan',
                        description: 'Cek status pengaduan Anda',
                        id: 'cek'
                      },
                      {
                        title: 'ℹ️ Informasi Pelayanan',
                        description: 'Informasi mengenai pelayanan',
                        id: 'pelayanan'
                      },
                      {
                        title: '👮 Hubungi Petugas',
                        description: 'Hubungi petugas pelayanan',
                        id: 'petugas'
                      }
                    ]
                  }
                ]
              })
            }
          ]
        }
      }
    })
  );

  await sock.relayMessage(jid, message.message, {
    messageId: message.key.id
  });
}

function getInteractiveId(msg) {
  const native = msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (!native?.paramsJson) return null;

  try {
    const params = JSON.parse(native.paramsJson);
    return params.id || null;
  } catch {
    return null;
  }
}

function getText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ''
  ).trim();
}

async function handle(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us')) return;

  const selectedId = getInteractiveId(msg);
  const text = selectedId || getText(msg);
  if (!text) return;

  const low = text.toLowerCase();

  // Tetap menerima MENU/START/0 sebagai fallback, tetapi pengguna
  // tidak perlu mengetiknya karena menu sudah interaktif.
  if (['menu', 'halo', 'hai', 'hi', 'start', 'mulai', '0'].includes(low)) {
    sessions.delete(jid);
    return sendMenu(sock, jid);
  }

  const state = sessions.get(jid);

  // Pilihan dari menu interaktif
  if (low === 'pengaduan') {
    sessions.set(jid, { mode: 'complaint' });
    return sock.sendMessage(jid, {
      text: `📝 *LAYANAN PENGADUAN*

Silakan kirim pengaduan Anda.

Format yang disarankan:

Nama:
No. WhatsApp:
Lokasi:
Waktu Kejadian:
Isi Pengaduan:
Bukti Pendukung:

Kirim seluruh informasi tersebut dalam satu pesan.

📌 Setelah dikirim, sistem akan memberikan Nomor Pengaduan secara otomatis.`
    });
  }

  if (low === 'aspirasi') {
    sessions.set(jid, { mode: 'aspirasi' });
    return sock.sendMessage(jid, {
      text: `💬 *LAYANAN ASPIRASI*

Silakan tuliskan saran, masukan, kritik, atau aspirasi Anda.

Silakan kirim dalam satu pesan.`
    });
  }

  if (low === 'informasi') {
    sessions.set(jid, { mode: 'informasi' });
    return sock.sendMessage(jid, {
      text: `📢 *LAYANAN INFORMASI*

Silakan sampaikan informasi yang ingin dilaporkan.

Jika tersedia, sertakan:
📍 Lokasi
🕐 Waktu
📝 Kronologi
📷 Foto
🎥 Video

Silakan kirim informasi Anda.`
    });
  }

  if (low === 'cek') {
    sessions.set(jid, { mode: 'cek' });
    return sock.sendMessage(jid, {
      text: `🔎 *CEK STATUS PENGADUAN*

Silakan masukkan Nomor Pengaduan Anda.

Contoh:
*ADU-2026-0001*`
    });
  }

  if (low === 'pelayanan') {
    await sock.sendMessage(jid, {
      text: `ℹ️ *INFORMASI PELAYANAN*

Portal ini digunakan sebagai sarana masyarakat untuk:

📋 Menyampaikan Pengaduan
💬 Menyampaikan Aspirasi
📢 Menyampaikan Informasi
🔎 Mengecek Status Pengaduan
👮 Menghubungi Petugas

Setiap laporan akan diterima dan ditindaklanjuti sesuai ketentuan yang berlaku.`
    });
    return sendMenu(sock, jid);
  }

  if (low === 'petugas') {
    sessions.set(jid, { mode: 'petugas' });
    return sock.sendMessage(jid, {
      text: `👮 *HUBUNGI PETUGAS*

Silakan tuliskan pertanyaan atau kebutuhan Anda.

Pesan Anda akan diterima oleh sistem pelayanan.`
    });
  }

  // Mode pengaduan: satu pesan = satu tiket
  if (state?.mode === 'complaint') {
    const id = nextId();
    const data = loadData();

    data.push({
      id,
      phone: jid.replace('@s.whatsapp.net', ''),
      text,
      status: 'Diterima',
      createdAt: new Date().toISOString()
    });

    saveData(data);
    sessions.delete(jid);

    await sock.sendMessage(jid, {
      text: `✅ *PENGADUAN BERHASIL DITERIMA*

Nomor Pengaduan:
*${id}*

Status:
*Diterima*

Pengaduan Anda telah diterima dan akan diproses sesuai ketentuan yang berlaku.

📌 *Simpan Nomor Pengaduan tersebut untuk pengecekan status.*`
    });

    return sendMenu(sock, jid);
  }

  if (state?.mode === 'aspirasi') {
    sessions.delete(jid);

    await sock.sendMessage(jid, {
      text: `✅ *ASPIRASI TELAH DITERIMA*

Terima kasih atas saran, masukan, kritik, dan aspirasi yang Anda sampaikan.`
    });

    return sendMenu(sock, jid);
  }

  if (state?.mode === 'informasi') {
    sessions.delete(jid);

    await sock.sendMessage(jid, {
      text: `✅ *INFORMASI TELAH DITERIMA*

Terima kasih. Informasi Anda telah diterima oleh sistem pelayanan.`
    });

    return sendMenu(sock, jid);
  }

  if (state?.mode === 'cek') {
    const data = loadData();
    const found = data.find(
      x => String(x.id || '').toLowerCase() === low
    );

    sessions.delete(jid);

    if (!found) {
      await sock.sendMessage(jid, {
        text: `❌ *NOMOR PENGADUAN TIDAK DITEMUKAN*

Nomor:
*${text}*

Pastikan Nomor Pengaduan yang dimasukkan sudah benar.`
      });
      return sendMenu(sock, jid);
    }

    await sock.sendMessage(jid, {
      text: `🔎 *STATUS PENGADUAN*

Nomor:
*${found.id}*

Status:
*${found.status}*

Tanggal:
${new Date(found.createdAt).toLocaleString('id-ID')}`
    });

    return sendMenu(sock, jid);
  }

  if (state?.mode === 'petugas') {
    sessions.delete(jid);

    await sock.sendMessage(jid, {
      text: `✅ *PESAN TELAH DITERIMA*

Pesan Anda telah diterima oleh sistem pelayanan dan dapat ditindaklanjuti oleh petugas.`
    });

    return sendMenu(sock, jid);
  }

  // Pesan baru yang bukan perintah akan mendapatkan menu.
  return sendMenu(sock, jid);
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\nSCAN QR INI DENGAN WHATSAPP > PERANGKAT TERTAUT:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('\n=================================');
      console.log(' BOT WHATSAPP AKTIF ✅');
      console.log('=================================\n');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        console.log('Koneksi terputus. Menghubungkan kembali...');
        setTimeout(start, 3000);
      } else {
        console.log('Sesi logout.');
        console.log('Hapus folder auth_info lalu jalankan ulang.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        await handle(sock, msg);
      } catch (e) {
        console.error('ERROR:', e);
      }
    }
  });
}

start();
