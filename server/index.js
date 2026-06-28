import express    from 'express';
import cors       from 'cors';
import multer     from 'multer';
import path       from 'path';
import fs         from 'fs';
import { fileURLToPath } from 'url';
import dotenv     from 'dotenv';
import nodemailer from 'nodemailer';
import pool, { testConnection } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const app  = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ─── Folder upload ──────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📁 Folder uploads dibuat:', UPLOAD_DIR);
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'DELETE'],
}));
app.use(express.json({ limit: '50mb' }));

// Serve file foto statis — GET /uploads/filename.png
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Multer config (simpan file ke disk) ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Gunakan nama original dari frontend (timestamp.png)
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // max 30MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Hanya file PNG/JPG yang diperbolehkan'));
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', async (_req, res) => {
  let dbStatus = 'disconnected';
  try {
    const [rows] = await pool.execute('SELECT 1 as val');
    if (rows && rows[0]?.val === 1) {
      dbStatus = 'connected';
    }
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }
  res.json({ 
    status: 'ok', 
    server: 'UniSmile Photo Server', 
    database: dbStatus,
    time: new Date().toISOString() 
  });
});

// ── POST /api/photos/upload ──────────────────────────────────────────────────
// Menerima file foto dari frontend, simpan ke disk + MySQL
app.post('/api/photos/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Tidak ada file yang dikirim' });
  }

  const filename   = req.file.filename;
  const fileSize   = req.file.size;
  const url        = `${BASE_URL}/uploads/${filename}`;
  const sessionId  = req.body.session_id || filename.replace('.png', '').replace('.jpg', '');
  const layoutId   = req.body.layout_id  || null;

  try {
    // Pastikan session_id terdaftar di tabel sessions agar tidak melanggar foreign key constraint
    await pool.execute(
      `INSERT IGNORE INTO sessions (id, session_code, started_at, status)
       VALUES (?, ?, CURRENT_TIMESTAMP, 'completed')`,
      [sessionId, sessionId]
    );

    // Insert ke MySQL
    const [result] = await pool.execute(
      `INSERT INTO photos (filename, url, session_id, file_size, layout_id)
       VALUES (?, ?, ?, ?, ?)`,
      [filename, url, sessionId, fileSize, layoutId]
    );

    console.log(`📸 Foto disimpan: ${filename} (ID: ${result.insertId}, ${(fileSize / 1024).toFixed(1)} KB)`);

    res.json({
      success: true,
      id:       result.insertId,
      filename,
      url,
      session_id: sessionId,
    });

  } catch (err) {
    // File sudah tersimpan di disk, coba hapus jika DB gagal
    try { fs.unlinkSync(path.join(UPLOAD_DIR, filename)); } catch (_) {}
    console.error('❌ Gagal insert ke MySQL:', err.message);
    res.status(500).json({ error: 'Gagal menyimpan ke database', detail: err.message });
  }
});

// ── GET /api/photos ───────────────────────────────────────────────────────────
// List semua foto (untuk admin panel nanti)
app.get('/api/photos', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = parseInt(req.query.offset || '0');

    const [rows] = await pool.execute(
      `SELECT id, filename, url, session_id, layout_id, file_size, created_at
       FROM photos
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`
    );

    const [[{ total }]] = await pool.execute('SELECT COUNT(*) as total FROM photos');

    res.json({ total, limit, offset, photos: rows });
  } catch (err) {
    console.error('❌ Gagal query photos:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data foto' });
  }
});

// ── GET /api/photos/:id ───────────────────────────────────────────────────────
// Detail satu foto berdasarkan ID
app.get('/api/photos/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM photos WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Foto tidak ditemukan' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/photos/:id ────────────────────────────────────────────────────
// Hapus foto dari disk + database
app.delete('/api/photos/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM photos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Foto tidak ditemukan' });

    const photo = rows[0];

    // Hapus file dari disk
    const filePath = path.join(UPLOAD_DIR, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // Hapus dari DB
    await pool.execute('DELETE FROM photos WHERE id = ?', [req.params.id]);

    console.log(`🗑️  Foto dihapus: ${photo.filename}`);
    res.json({ success: true, message: `Foto ${photo.filename} berhasil dihapus` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/transactions ──────────────────────────────────────────────────
// Catat transaksi baru saat pembayaran dikonfirmasi
app.post('/api/transactions', async (req, res) => {
  const { session_id, layout_id, amount, payment_method = 'QRIS', status = 'success' } = req.body;

  if (!session_id || !layout_id || amount === undefined) {
    return res.status(400).json({ error: 'Data session_id, layout_id, dan amount harus diisi' });
  }

  // Generate unique transaction code
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  const trxCode = `TRX-${yyyy}${mm}${dd}-${random}`;

  try {
    // 1. Pastikan session terdaftar di tabel sessions agar tidak melanggar foreign key constraint
    await pool.execute(
      `INSERT IGNORE INTO sessions (id, session_code, started_at, status)
       VALUES (?, ?, CURRENT_TIMESTAMP, 'active')`,
      [session_id, session_id]
    );

    // 2. Insert transaksi
    const [result] = await pool.execute(
      `INSERT INTO transactions (transaction_code, session_id, layout_id, amount, payment_method, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [trxCode, session_id, layout_id, Number(amount), payment_method, status]
    );

    console.log(`💵 Transaksi dicatat: ${trxCode} (ID: ${result.insertId}, Rp ${amount})`);

    res.json({
      success: true,
      id: result.insertId,
      transaction_code: trxCode,
      session_id,
      layout_id,
      amount,
      payment_method,
      status,
      created_at: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Gagal mencatat transaksi:', err.message);
    res.status(500).json({ error: 'Gagal mencatat transaksi ke database', detail: err.message });
  }
});

// ── GET /api/transactions ───────────────────────────────────────────────────
// Ambil semua transaksi (untuk admin panel)
app.get('/api/transactions', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = parseInt(req.query.offset || '0');

    // Query list transaksi
    const [rows] = await pool.execute(
      `SELECT id, transaction_code, session_id, layout_id, amount, payment_method, status, created_at
       FROM transactions
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`
    );

    // Query stats: total transaksi & total nominal
    const [[stats]] = await pool.execute(
      `SELECT 
         COUNT(*) as total_count, 
         COALESCE(SUM(amount), 0) as total_amount,
         COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) as success_amount,
         COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count
       FROM transactions`
    );

    res.json({ 
      success: true,
      total: stats.total_count, 
      total_amount: Number(stats.total_amount),
      success_amount: Number(stats.success_amount),
      success_count: stats.success_count,
      limit, 
      offset, 
      transactions: rows 
    });
  } catch (err) {
    console.error('❌ Gagal mengambil transaksi:', err.message);
    const isDbConnectionError = ['ER_ACCESS_DENIED_ERROR', 'ECONNREFUSED', 'ENOTFOUND'].includes(err.code);
    res.status(isDbConnectionError ? 503 : 500).json({ error: 'Gagal mengambil data transaksi', detail: err.message });
  }
});

// ── GET /api/frames ───────────────────────────────────────────────────────────
// Ambil semua template/styles frame dari MySQL
app.get('/api/frames', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM frame_templates ORDER BY id ASC');
    res.json({ success: true, frames: rows });
  } catch (err) {
    console.error('❌ Gagal query frames:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data frames', detail: err.message });
  }
});

// ── POST /api/frames ──────────────────────────────────────────────────────────
// Simpan semua template/styles frame ke MySQL
app.post('/api/frames', async (req, res) => {
  const { frames } = req.body;
  if (!Array.isArray(frames)) {
    return res.status(400).json({ error: 'Data frames harus berupa array' });
  }

  const getSlotCount = (layoutId) => {
    if (layoutId === '1x1') return 1;
    if (layoutId === '2x1') return 2;
    if (layoutId === '3x1') return 3;
    if (layoutId === '4x1') return 4;
    if (layoutId === '2x2') return 4;
    if (layoutId === '2x3') return 6;
    if (layoutId === '3x3') return 9;
    return 1;
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Hapus semua data lama
    await conn.execute('DELETE FROM frame_templates');

    // Pecah per style untuk disimpan di database
    for (const layout of frames) {
      for (const style of layout.styles) {
        const layoutConfig = JSON.stringify({
          layout_id: layout.id,
          layout_label: layout.label,
          layout_enabled: layout.enabled,
          layout_price: layout.price,
          style_id: style.id,
          backgroundConfig: style.backgroundConfig,
          elements: style.elements,
          previewUrl: style.previewUrl,
          overlayUrl: style.overlayUrl
        });

        await conn.execute(
          `INSERT INTO frame_templates (name, slot_count, layout_config, is_active)
           VALUES (?, ?, ?, ?)`,
          [style.name, getSlotCount(layout.id), layoutConfig, layout.enabled ? 1 : 0]
        );
      }
    }
    await conn.commit();
    console.log(`💾 Berhasil mensinkronkan ${frames.length} layout frame ke MySQL`);
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('❌ Gagal sinkronisasi frames ke MySQL:', err.message);
    res.status(500).json({ error: 'Gagal menyimpan data frames', detail: err.message });
  } finally {
    conn.release();
  }
});

// ── GET /api/filters ──────────────────────────────────────────────────────────
// Ambil semua filter dari MySQL
app.get('/api/filters', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM filters ORDER BY id ASC');
    res.json({ success: true, filters: rows });
  } catch (err) {
    console.error('❌ Gagal query filters:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data filters', detail: err.message });
  }
});

// ── POST /api/filters ─────────────────────────────────────────────────────────
// Simpan semua filter ke MySQL
app.post('/api/filters', async (req, res) => {
  const { filters } = req.body;
  if (!Array.isArray(filters)) {
    return res.status(400).json({ error: 'Data filters harus berupa array' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM filters');

    for (const filter of filters) {
      await conn.execute(
        `INSERT INTO filters (name, type, preview_url, is_active)
         VALUES (?, ?, ?, ?)`,
        [filter.name, filter.id, filter.cssFilter, filter.enabled ? 1 : 0]
      );
    }
    await conn.commit();
    console.log(`💾 Berhasil mensinkronkan ${filters.length} filter ke MySQL`);
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('❌ Gagal sinkronisasi filters ke MySQL:', err.message);
    res.status(500).json({ error: 'Gagal menyimpan data filters', detail: err.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/email/send ──────────────────────────────────────────────────────
// Kirim foto ke email pengguna via Gmail SMTP
app.post('/api/email/send', async (req, res) => {
  const { to, photoUrl, photoBase64, sessionId } = req.body;

  if (!to || (!photoUrl && !photoBase64)) {
    return res.status(400).json({ error: 'Email dan foto (URL atau gambar) harus diisi' });
  }

  // Validasi format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ error: 'Format email tidak valid' });
  }

  const gmailUser = (process.env.GMAIL_USER || '').trim();
  const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

  // Cek apakah Gmail credentials sudah dikonfigurasi
  if (!gmailUser || gmailUser === 'your_email@gmail.com' || !gmailAppPassword) {
    return res.status(503).json({ 
      error: 'Fitur email belum dikonfigurasi. Hubungi admin untuk mengatur Gmail credentials di server/.env' 
    });
  }

  try {
    // Buat transporter Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    // Verifikasi koneksi SMTP
    await transporter.verify();

    // Siapkan gambar & attachment
    const logoPath = path.join(__dirname, 'assets/LOGO UNI SMILE.png');
    const devLogoPath = path.join(__dirname, '../public/assets/LOGO UNI SMILE.png');
    const finalLogoPath = fs.existsSync(logoPath) ? logoPath : (fs.existsSync(devLogoPath) ? devLogoPath : null);

    let attachments = [];
    let logoImgSrc = '';

    if (finalLogoPath) {
      attachments.push({
        filename: 'unismile-logo.png',
        path: finalLogoPath,
        cid: 'logo@unismile'
      });
      logoImgSrc = 'cid:logo@unismile';
    } else {
      logoImgSrc = 'https://unismile-photobooth.nathaniapelleng15.workers.dev/assets/LOGO%20UNI%20SMILE.png';
    }
    let photoImgTag = '';
    let downloadBtn = '';

    const isLocalhost = photoUrl && (photoUrl.includes('localhost') || photoUrl.includes('127.0.0.1'));

    if (photoBase64) {
      // Gunakan base64 sebagai inline attachment (cid:photo)
      const matches = photoBase64.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!matches) throw new Error('Format gambar tidak valid');
      const mimeType = matches[1];
      const base64Data = matches[2];
      const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';

      attachments.push({
        filename: `unismile-photo.${ext}`,
        content: base64Data,
        encoding: 'base64',
        cid: 'photo@unismile',
      });

      photoImgTag = `
        <div style="background:#0c1633;border-radius:16px;padding:16px;margin-bottom:24px;border:1px solid rgba(255,255,255,0.1);">
          <img src="cid:photo@unismile" alt="Foto UniSmile" style="max-width:100%;height:auto;border-radius:10px;display:block;margin:0 auto;">
        </div>`;
      downloadBtn = `<p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 16px;">Foto terlampir di email ini sebagai file attachment 📎</p>`;
    } else if (isLocalhost) {
      // Jika URL adalah localhost, Gmail tidak bisa men-download gambarnya.
      // Solusinya: baca file dari disk dan lampirkan langsung sebagai attachment.
      const filename = photoUrl.split('/').pop();
      const localFilePath = path.join(__dirname, 'uploads', filename);
      
      attachments.push({
        filename: filename,
        path: localFilePath,
        cid: 'photo@unismile'
      });

      photoImgTag = `
        <div style="background:#0c1633;border-radius:16px;padding:16px;margin-bottom:24px;border:1px solid rgba(255,255,255,0.1);">
          <img src="cid:photo@unismile" alt="Foto UniSmile" style="max-width:100%;height:auto;border-radius:10px;display:block;margin:0 auto;">
        </div>`;
      downloadBtn = `<p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 16px;">Karena server berjalan di Localhost, foto dilampirkan langsung di email ini sebagai attachment 📎</p>`;
    } else if (photoUrl) {
      // Gunakan URL langsung (jika sudah dihosting di domain publik)
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(photoUrl)}`;
      photoImgTag = `
        <div style="background:#0c1633;border-radius:16px;padding:16px;margin-bottom:24px;border:1px solid rgba(255,255,255,0.1);">
          <img src="${photoUrl}" alt="Foto UniSmile" style="max-width:100%;height:auto;border-radius:10px;display:block;margin:0 auto;">
        </div>`;
      downloadBtn = `
        <a href="${photoUrl}" style="display:inline-block;background:#f6cd46;color:#0c1633;text-decoration:none;padding:16px 40px;border-radius:100px;font-weight:900;font-size:16px;letter-spacing:0.5px;margin-bottom:24px;">
          ⬇️ Download Foto
        </a>
        <div style="margin:0 auto 8px;display:inline-block;background:white;padding:12px;border-radius:12px;">
          <img src="${qrUrl}" alt="QR Code" width="140" height="140" style="display:block;">
        </div>
        <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:4px 0 0;">Scan QR untuk download</p>`;
    }

    // Kirim email dengan template HTML
    const info = await transporter.sendMail({
      from: `"UniSmile Photo Booth" <${gmailUser}>`,
      to,
      subject: '📸 Foto Kamu dari UniSmile Photo Booth!',
      attachments,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Foto UniSmile</title>
        </head>
        <body style="margin:0;padding:0;background:#0c1633;font-family:'Inter',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0c1633;">
            <tr>
              <td align="center" style="padding:40px 20px;">
                <table width="100%" style="max-width:520px;background:#1b2b5a;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background:linear-gradient(135deg,#1b2b5a,#0c1633);padding:32px 24px;text-align:center;border-bottom:2px solid rgba(246,205,70,0.3);">
                      <img src="${logoImgSrc}" alt="UniSmile Logo" style="height:48px;display:block;margin:0 auto 12px;border-radius:12px;">
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:32px 24px;text-align:center;">
                      <p style="color:rgba(255,255,255,0.9);font-size:16px;margin:0 0 8px;">Hei! Foto kamu sudah siap 🎉</p>
                      <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 24px;">Simpan foto kenangan kamu dari UniSmile Photo Booth</p>
                      ${photoImgTag}
                      ${downloadBtn}
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background:rgba(0,0,0,0.3);padding:20px 24px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
                      <p style="color:rgba(255,255,255,0.3);font-size:11px;margin:0;">
                        UniSmile Photo Booth • Ko+ Lab • Uni Inside
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log(`📧 Email terkirim ke ${to} | ID: ${info.messageId} | Mode: ${photoUrl ? 'URL' : 'base64'}`);

    // Catat ke database jika ada session
    if (sessionId) {
      try {
        await pool.execute(
          `INSERT IGNORE INTO sessions (id, session_code, started_at, status) VALUES (?, ?, CURRENT_TIMESTAMP, 'completed')`,
          [sessionId, sessionId]
        );
        await pool.execute(
          `UPDATE photos SET email_sent_to = ?, email_sent_at = CURRENT_TIMESTAMP WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`,
          [to, sessionId]
        );
      } catch (dbErr) {
        console.warn('⚠️  Gagal update DB email_sent:', dbErr.message);
      }
    }

    res.json({ success: true, message: `Email berhasil dikirim ke ${to}` });

  } catch (err) {
    console.error('❌ Gagal kirim email:', err.message);
    
    let errorMsg = 'Gagal mengirim email. Coba lagi.';
    if (err.code === 'EAUTH') {
      errorMsg = 'Autentikasi Gmail gagal. Pastikan App Password sudah benar di server/.env';
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      errorMsg = 'Tidak dapat terhubung ke server email. Periksa koneksi internet.';
    }
    
    res.status(500).json({ error: errorMsg, detail: err.message });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: err.message });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const start = async () => {
  await testConnection(); // Pastikan DB konek dulu
  app.listen(PORT, () => {
    console.log('');
    console.log('🚀 UniSmile Photo Server berjalan!');
    console.log(`   URL  : ${BASE_URL}`);
    console.log(`   Port : ${PORT}`);
    console.log(`   DB   : ${process.env.DB_NAME}@${process.env.DB_HOST}`);
    console.log(`   Foto : ${UPLOAD_DIR}`);
    console.log('');
  });
};

start();
