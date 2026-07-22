import axios from 'axios';

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

export const apiClient = axios.create();

apiClient.interceptors.request.use((config) => {
  const appConfig = getApiConfig();
  config.baseURL = appConfig.backendUrl;
  config.headers['x-api-key'] = appConfig.apiKey?.trim() || '';
  return config;
});

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * Cek apakah backend server aktif.
 * Tidak butuh auth — bisa dipanggil saat kiosk startup.
 */
export const checkBackendHealth = async (url: string, currentApiKey: string): Promise<boolean> => {
  try {
    const targetUrl = url || getApiConfig().backendUrl;
    const res = await axios.get(`${targetUrl}/payments`, {
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
  try {
    const res = await apiClient.post<ApiResponse<SessionData>>('/sessions/start', {
      frame_template_id: frameTemplateId || null
    });

    const data = res.data;

    if (data.success && (data as any).session_code) {
      console.log(`🎬 Sesi dimulai: ${(data as any).session_code}`);
      return { id: (data as any).session_code, kiosk_id: kioskId, status: 'active' } as SessionData;
    } else {
      console.error('Gagal memulai sesi:', data.message);
      return null;
    }
  } catch (error: any) {
    console.error('Error saat startSession:', error?.response?.data || error);
    return null;
  }
};

/**
 * Selesaikan sesi dan catat transaksi.
 * Dipanggil setelah pembayaran QRIS dikonfirmasi.
 *
 * @param sessionId   - ID sesi yang aktif
 */
export const completeSession = async (
  sessionId: string
): Promise<boolean> => {
  try {
    const res = await apiClient.put<ApiResponse>(`/sessions/${encodeURIComponent(sessionId)}/complete`);
    const data = res.data;

    if (data.success) {
      console.log(`✅ Sesi ${sessionId} selesai`);
      return true;
    } else {
      console.error('Gagal menyelesaikan sesi:', data.message);
      return false;
    }
  } catch (error: any) {
    console.error('Error saat completeSession:', error?.response?.data || error);
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
  formData.append('photo', file);
  formData.append('session_id', sessionId);

  try {
    const res = await apiClient.post<ApiResponse<PhotoData>>(
      `/sessions/${encodeURIComponent(sessionId)}/photos`,
      formData
    );

    const data = res.data;

    if (data.success) {
      const photoUrl = data.data?.url;
      if (!photoUrl) return null;
      
      const config = getApiConfig();
      const rootUrl = config.backendUrl.replace('/api/v1/kiosk', '');
      const absoluteUrl = photoUrl.startsWith('http')
        ? photoUrl
        : `${rootUrl}${photoUrl}`;
      
      console.log(`📸 Foto terupload: ${absoluteUrl}`);
      return absoluteUrl;
    } else {
      console.error('Gagal upload foto:', data.message);
      return null;
    }
  } catch (error: any) {
    console.error('Error saat uploadPhoto:', error?.response?.data || error);
    return null;
  }
};

export const getPhotosBySession = async (sessionId: string): Promise<PhotoData[]> => {
  return []; // Not used in V1 kiosk API docs directly for kiosk display, but kept for compat
};

export const fetchTemplates = async (): Promise<any[]> => {
  try {
    const res = await apiClient.get('/templates');
    const data = res.data;
    if (data.success) {
      return data.data || [];
    }
    return [];
  } catch (error: any) {
    console.error('Error fetchTemplates:', error?.response?.data || error);
    return [];
  }
};

export const fetchPaymentProfile = async (): Promise<string | null> => {
  try {
    const response = await apiClient.get('/payments');
    if (response.data.success && response.data.data && response.data.data.length > 0) {
      const payment = response.data.data[0];
      const paymentData = typeof payment.payment_data === 'string' 
        ? JSON.parse(payment.payment_data) 
        : payment.payment_data;
      const qrisPath = paymentData?.qris_image_url;
      
      // Extract the root server URL (remove /api/v1/kiosk) to fetch the uploaded image
      const config = getApiConfig();
      const rootUrl = config.backendUrl.replace('/api/v1/kiosk', '');
      
      return rootUrl + qrisPath;
    }
    return null;
  } catch (error: any) {
    console.error('Error fetchPaymentProfile:', error?.response?.data || error);
    return null;
  }
};

export const verifyPayment = async (sessionId: string): Promise<boolean> => {
  try {
    const res = await apiClient.post(`/sessions/${encodeURIComponent(sessionId)}/payment`);
    return res.data.success;
  } catch (error: any) {
    console.error('Error verifyPayment:', error?.response?.data || error);
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
    const res = await apiClient.post<ApiResponse>(
      `/sessions/${encodeURIComponent(sessionId)}/send-email`,
      { email }
    );

    const data = res.data;

    if (data.success) {
      console.log(`📧 Email terkirim ke ${email}`);
      return true;
    } else {
      console.error('Gagal kirim email:', data.message);
      return false;
    }
  } catch (error: any) {
    console.error('Error saat sendPhotoByEmail:', error?.response?.data || error);
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
    const res = await apiClient.post<ApiResponse>('/gestures', payload);
    return res.data.success;
  } catch (error: any) {
    console.error('Error saat logGesture:', error?.response?.data || error);
    return false;
  }
};

/**
 * Catat log print dari kiosk.
 * Digunakan untuk monitoring stok kertas dan status printer.
 */
export const recordPrintLog = async (payload: PrintLogPayload): Promise<boolean> => {
  try {
    const res = await apiClient.post<ApiResponse>('/prints', payload);
    return res.data.success;
  } catch (error: any) {
    console.error('Error saat recordPrintLog:', error?.response?.data || error);
    return false;
  }
};

// ─── Frame Templates & Filters (Read-only dari backend) ───────────────────────

/**
 * Ambil semua frame templates dari backend.
 * Dipanggil saat startup kiosk untuk sync data terbaru dari admin.
 */
export const getFrameTemplates = async () => {
  try {
    const res = await apiClient.get('/templates');
    return res.data.success ? res.data.data : [];
  } catch (error: any) {
    console.error('Error saat getFrameTemplates:', error?.response?.data || error);
    return [];
  }
};

/**
 * Ambil semua filter aktif dari backend.
 * Dipanggil saat startup kiosk untuk sync filter terbaru dari admin.
 */
export const getFilters = async () => {
  try {
    const res = await apiClient.get('/filters');
    return res.data.success ? res.data.data : [];
  } catch (error: any) {
    console.error('Error saat getFilters:', error?.response?.data || error);
    return [];
  }
};
