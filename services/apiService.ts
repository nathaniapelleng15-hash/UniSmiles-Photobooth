/**
 * apiService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer komunikasi Frontend Kiosk ↔ Backend API Server (Uni-Smiles v2.0)
 *
 * Autentikasi: x-api-key header (API Key kiosk dari .env)
 * Base URL   : VITE_API_BASE_URL dari .env (default: http://localhost:8000)
 *
 * Cara pakai API Key:
 *   1. Super Admin login ke Admin Dashboard
 *   2. Buka Kiosk Management → Register Kiosk
 *   3. Copy API Key yang di-generate
 *   4. Paste ke .env: VITE_KIOSK_API_KEY=<api_key>
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Memuat konfigurasi API (URL, API Key, Kiosk ID) secara dinamis dari localStorage agar langsung terupdate jika diubah di settings
export const getApiConfig = () => {
  const stored = localStorage.getItem('pb_config');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        backendUrl: parsed.backendUrl || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
        apiKey: parsed.apiKey || import.meta.env.VITE_KIOSK_API_KEY || '',
        kioskId: parsed.kioskId || import.meta.env.VITE_KIOSK_ID || 'K-001'
      };
    } catch (_) {}
  }
  return {
    backendUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
    apiKey: import.meta.env.VITE_KIOSK_API_KEY || '',
    kioskId: import.meta.env.VITE_KIOSK_ID || 'K-001'
  };
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface SessionData {
  id: string;
  kiosk_id: string;
  frame_template_id?: number | null;
  status: 'active' | 'completed' | 'abandoned';
}

export interface PhotoData {
  id: number;
  session_id: string;
  url: string;
}

export interface TransactionPayload {
  transaction_code: string;
  amount: number;
  payment_method: 'QRIS' | 'Cash' | string;
  status: 'completed' | 'failed' | 'pending';
}

export interface GesturePayload {
  session_id: string;
  gesture_type: string;
  confidence_score: number;
  action_triggered: string;
}

export interface PrintLogPayload {
  kiosk_id: string;
  session_id: string;
  status: 'success' | 'failed';
  paper_stock_left?: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Helper fetch dengan x-api-key header otomatis.
 * Digunakan untuk semua request yang butuh autentikasi kiosk.
 */
const apiFetch = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const config = getApiConfig();
  const headers: Record<string, string> = {
    'x-api-key': config.apiKey,
    ...(options.headers as Record<string, string> || {})
  };

  if (!config.apiKey) {
    console.warn(
      '[apiService] apiKey belum diisi di Kiosk Settings!\n' +
      'Daftarkan kiosk ini di Admin Dashboard untuk mendapatkan API Key.'
    );
  }

  return fetch(`${config.backendUrl}${endpoint}`, {
    ...options,
    headers
  });
};

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * Cek apakah backend server aktif.
 * Tidak butuh auth — bisa dipanggil saat kiosk startup.
 */
export const checkBackendHealth = async (url: string, currentApiKey: string): Promise<boolean> => {
  try {
    const targetUrl = url || getApiConfig().backendUrl;
    const res = await fetch(`${targetUrl}/payments`, {
      method: 'GET',
      headers: {
        'x-api-key': currentApiKey
      }
    });
    if (res.status === 200) {
      console.log('✅ Backend terhubung & API Key valid');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Backend tidak dapat dijangkau:', error);
    return false;
  }
};

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Mulai sesi photobooth baru.
 * Dipanggil saat pengguna memilih frame dan memulai sesi.
 *
 * @param kioskId    - ID kiosk ini (contoh: "KSK-TLKM-01")
 * @param frameTemplateId - ID frame template yang dipilih (opsional)
 * @returns SessionData jika berhasil, null jika gagal
 */
export const startSession = async (
  kioskId: string,
  frameTemplateId?: number | null
): Promise<SessionData | null> => {
  const sessionId = `#US-${Date.now()}`;

  try {
    const res = await apiFetch('/api/v1/kiosk/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        frame_template_id: frameTemplateId || null
      })
    });

    const data: ApiResponse<SessionData> = await res.json();

    if (res.ok && data.success && data.session_code) {
      console.log(`🎬 Sesi dimulai: ${data.session_code}`);
      return { id: data.session_code, kiosk_id: kioskId, status: 'active' } as SessionData;
    } else {
      console.error('Gagal memulai sesi:', data.message);
      return null;
    }
  } catch (error) {
    console.error('Error saat startSession:', error);
    return null;
  }
};

/**
 * Selesaikan sesi dan catat transaksi.
 * Dipanggil setelah pembayaran QRIS dikonfirmasi.
 *
 * @param sessionId   - ID sesi yang aktif
 * @param transaction - Data transaksi pembayaran
 */
export const completeSession = async (
  sessionId: string
): Promise<boolean> => {
  try {
    const res = await apiFetch(`/api/v1/kiosk/sessions/${encodeURIComponent(sessionId)}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    });

    const data: ApiResponse = await res.json();

    if (res.ok && data.success) {
      console.log(`✅ Sesi ${sessionId} selesai`);
      return true;
    } else {
      console.error('Gagal menyelesaikan sesi:', data.message);
      return false;
    }
  } catch (error) {
    console.error('Error saat completeSession:', error);
    return false;
  }
};

// ─── Photo ────────────────────────────────────────────────────────────────────

/**
 * Upload foto hasil photobooth ke backend.
 * Backend menyimpan file ke folder uploads/ dan URL-nya ke database.
 * Saat hosting: URL akan menjadi URL CDN.
 *
 * @param photoBlob  - File/Blob foto (PNG/JPG)
 * @param sessionId  - ID sesi aktif
 * @param filename   - Nama file (opsional, default: timestamp.png)
 * @returns URL foto jika berhasil, null jika gagal
 */
export const uploadPhoto = async (
  photoBlob: Blob,
  sessionId: string,
  filename?: string
): Promise<string | null> => {
  const finalName = filename || `photo-${Date.now()}.png`;
  const file = new File([photoBlob], finalName, { type: photoBlob.type || 'image/png' });

  const formData = new FormData();
  formData.append('photo', file);      // ← field name 'photo' (bukan 'file')
  formData.append('session_id', sessionId);

  try {
    const res = await apiFetch(`/api/v1/kiosk/sessions/${encodeURIComponent(sessionId)}/photos`, {
      method: 'POST',
      body: formData
    });

    const data: ApiResponse<PhotoData> = await res.json();

    if (res.ok && data.success) {
      const photoUrl = data.data?.url;
      if (!photoUrl) return null;
      // Jadikan URL absolut jika backend mengembalikan path relatif
      const config = getApiConfig();
      const absoluteUrl = photoUrl.startsWith('http')
        ? photoUrl
        : `${config.backendUrl}${photoUrl}`;
      console.log(`📸 Foto terupload: ${absoluteUrl}`);
      return absoluteUrl;
    } else {
      console.error('Gagal upload foto:', data.message);
      return null;
    }
  } catch (error) {
    console.error('Error saat uploadPhoto:', error);
    return null;
  }
};

export const getPhotosBySession = async (sessionId: string): Promise<PhotoData[]> => {
  return []; // Not used in V1 kiosk API docs directly for kiosk display, but kept for compat
};

export const getPaymentProfile = async (): Promise<string | null> => {
  try {
    const res = await apiFetch('/api/v1/kiosk/payments');
    const data = await res.json();
    if (res.ok && data.success && data.data && data.data.length > 0) {
      const qrisData = JSON.parse(data.data[0].payment_data);
      const url = qrisData.qris_image_url;
      const config = getApiConfig();
      return url.startsWith('http') ? url : `${config.backendUrl}${url}`;
    }
    return null;
  } catch (error) {
    console.error('Error getPaymentProfile:', error);
    return null;
  }
};

export const verifyPayment = async (sessionId: string): Promise<boolean> => {
  try {
    const res = await apiFetch(`/api/v1/kiosk/sessions/${encodeURIComponent(sessionId)}/payment`, {
      method: 'POST'
    });
    const data = await res.json();
    return res.ok && data.success;
  } catch (error) {
    console.error('Error verifyPayment:', error);
    return false;
  }
};

// ─── Email ────────────────────────────────────────────────────────────────────

/**
 * Kirim digital copy foto ke email pelanggan.
 * Backend akan mengirim email dengan link download foto.
 *
 * @param sessionId - ID sesi
 * @param email     - Alamat email pelanggan
 */
export const sendPhotoByEmail = async (
  sessionId: string,
  email: string
): Promise<boolean> => {
  try {
    const res = await apiFetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/send-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      }
    );

    const data: ApiResponse = await res.json();

    if (res.ok && data.success) {
      console.log(`📧 Email terkirim ke ${email}`);
      return true;
    } else {
      console.error('Gagal kirim email:', data.message);
      return false;
    }
  } catch (error) {
    console.error('Error saat sendPhotoByEmail:', error);
    return false;
  }
};

// ─── Analytics ────────────────────────────────────────────────────────────────

/**
 * Log gesture yang dideteksi oleh sistem kamera kiosk.
 * Digunakan untuk AI gesture control (contoh: V-sign = ambil foto).
 */
export const logGesture = async (payload: GesturePayload): Promise<boolean> => {
  try {
    const res = await apiFetch('/api/gestures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data: ApiResponse = await res.json();
    return res.ok && data.success;
  } catch (error) {
    console.error('Error saat logGesture:', error);
    return false;
  }
};

/**
 * Catat log print dari kiosk.
 * Digunakan untuk monitoring stok kertas dan status printer.
 */
export const recordPrintLog = async (payload: PrintLogPayload): Promise<boolean> => {
  try {
    const res = await apiFetch('/api/prints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data: ApiResponse = await res.json();
    return res.ok && data.success;
  } catch (error) {
    console.error('Error saat recordPrintLog:', error);
    return false;
  }
};

// ─── Frame Templates & Filters (Read-only dari backend) ───────────────────────

/**
 * Ambil semua frame templates dari backend.
 * Dipanggil saat startup kiosk untuk sync data terbaru dari admin.
 */
export const getFrameTemplates = async () => {
  const config = getApiConfig();
  try {
    const res = await fetch(`${config.backendUrl}/api/frame_templates`);
    const data = await res.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error saat getFrameTemplates:', error);
    return [];
  }
};

/**
 * Ambil semua filter aktif dari backend.
 * Dipanggil saat startup kiosk untuk sync filter terbaru dari admin.
 */
export const getFilters = async () => {
  const config = getApiConfig();
  try {
    const res = await fetch(`${config.backendUrl}/api/filters`);
    const data = await res.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error saat getFilters:', error);
    return [];
  }
};
