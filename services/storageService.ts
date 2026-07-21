import { StickerIcon, AppConfig, STORAGE_KEYS, DEFAULT_PASSWORD, FrameLayout, PhotoFilter, VirtualBackground, GridLayoutId, FrameStyle, FrameBackground } from '../types';

// --- CONFIGURATION ---
// Mendapatkan URL Backend API secara dinamis dari config localStorage (agar langsung terupdate jika diubah di UI Settings)
export const getApiBaseUrl = (): string => {
  const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.backendUrl) return parsed.backendUrl;
    } catch (_) {}
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
};

// --- API HELPER FUNCTIONS ---

/**
 * Upload aset (sticker/overlay image) ke backend.
 * Catatan: Saat ini menggunakan endpoint uploads backend lokal.
 * Saat hosting, endpoint ini akan diarahkan ke CDN.
 */
export const uploadAsset = async (file: File): Promise<string | null> => {
  const timestamp = Date.now();
  const ext = file.name.split('.').pop();
  const filename = `aset-${timestamp}.${ext}`;
  const baseUrl = getApiBaseUrl();

  const formData = new FormData();
  const renamedFile = new File([file], filename, { type: file.type });
  formData.append('photo', renamedFile);
  // session_id dummy untuk aset non-sesi
  formData.append('session_id', `ASSET-${timestamp}`);

  try {
    const response = await fetch(`${baseUrl}/api/photos`, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const data = await response.json();
      // Backend mengembalikan URL relatif, jadikan absolut
      const url = data.data?.url;
      if (url) {
        return url.startsWith('http') ? url : `${baseUrl}${url}`;
      }
      return `${baseUrl}/uploads/${filename}`;
    } else {
      console.error('Upload aset gagal:', response.statusText);
      return null;
    }
  } catch (error) {
    console.error('Error upload aset:', error);
    return null;
  }
};

// --- Config / Password ---

export const getAppConfig = (): AppConfig => {
  const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
          password: parsed.password || DEFAULT_PASSWORD,
          customSubtitle: parsed.customSubtitle || '',
          customLogoUrl: parsed.customLogoUrl || '',
          uiMode: parsed.uiMode || 'normal',
          monitorOrientation: parsed.monitorOrientation || 'horizontal',
          backendUrl: parsed.backendUrl || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
          apiKey: parsed.apiKey || import.meta.env.VITE_KIOSK_API_KEY || '',
          kioskId: parsed.kioskId || import.meta.env.VITE_KIOSK_ID || 'K-001'
      };
    } catch (e) {
      console.error('Error parsing config', e);
    }
  }
  const defaultConfig: AppConfig = {
      password: DEFAULT_PASSWORD,
      customSubtitle: '',
      customLogoUrl: '',
      uiMode: 'normal',
      monitorOrientation: 'horizontal',
      backendUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
      apiKey: import.meta.env.VITE_KIOSK_API_KEY || '',
      kioskId: import.meta.env.VITE_KIOSK_ID || 'K-001'
  };
  saveAppConfig(defaultConfig);
  return defaultConfig;
};

export const saveAppConfig = (config: AppConfig): void => {
  // Config kiosk (password, subtitle, logo, UI mode, backend api settings) disimpan di localStorage
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
};

// --- Icons ---

export const getStoredIcons = (): StickerIcon[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.ICONS);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.error('Error parsing stored icons, resetting to defaults', e);
      localStorage.removeItem(STORAGE_KEYS.ICONS);
    }
  }
  return seedOpenMojiIcons();
};

export const saveStoredIcons = (icons: StickerIcon[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.ICONS, JSON.stringify(icons));
  } catch (error) {
    console.error('Storage limit reached', error);
    alert('Storage limit reached! Please delete some assets.');
  }
};

const OPENMOJI_BASE_URL = 'https://openmoji.org/data/color/svg';
const EMOJI_HEX_CODES = [
  '1F600', '1F603', '1F604', '1F601', '1F606', '1F605', '1F923', '1F602', '1F642', '1F643',
  '1F609', '1F60A', '1F607', '1F970', '1F60D', '1F929', '1F618', '1F617', '1F60B', '1F61B',
  '1F61C', '1F92A', '1F61D', '1F911', '1F917', '1F92D', '1F92B', '1F914', '1F910', '1F928',
  '1F610', '1F611', '1F636', '1F60F', '1F612', '1F644', '1F62C', '1F925', '1F60C', '1F614',
  '1F62A', '1F924', '1F634', '1F637', '1F912', '1F915', '1F922', '1F92E', '1F927', '1F975',
  '1F976', '1F974', '1F635', '1F92F', '1F920', '1F973', '1F60E', '1F913', '1F9D0', '1F615',
  '1F61F', '1F641', '1F62E', '1F62F', '1F632', '1F633', '1F97A', '1F626', '1F627', '1F628',
  '1F625', '1F622', '1F62D', '1F631', '1F616', '1F623', '1F61E', '1F613', '1F629', '1F62B',
  '1F971', '1F624', '1F621', '1F620', '1F92C', '1F608', '1F47F', '1F480', '2620', '1F479',
  '1F47A', '1F47B', '1F47D', '1F47E', '1F916', '1F435', '1F412', '1F436', '1F431', '1F981'
];

export const seedOpenMojiIcons = (): StickerIcon[] => {
  try {
     const stored = localStorage.getItem(STORAGE_KEYS.ICONS);
     if (stored) {
         const parsed = JSON.parse(stored);
         if (Array.isArray(parsed) && parsed.length >= 100) return parsed;
     }
  } catch (e) {
      // ignore
  }

  const initialIcons: StickerIcon[] = EMOJI_HEX_CODES.map((hex) => ({
    id: crypto.randomUUID(),
    name: `OpenMoji ${hex}`,
    url: `${OPENMOJI_BASE_URL}/${hex.toUpperCase()}.svg`,
    source: 'openmoji'
  }));
  saveStoredIcons(initialIcons);
  return initialIcons;
};

// --- Frames ---

export const getLayoutConfig = (id: string) => {
    switch(id) {
        case '1x1': // Polaroid: 1200 x 1800 px
            return {
                width: 1200, height: 1800,
                slots: [
                    { x: 60, y: 60, width: 1080, height: 1340 }
                ]
            };
        case '2x1': // Photo Strip: 600 x 1700 px
            return {
                width: 600, height: 1700,
                slots: [
                    { x: 30, y: 30, width: 540, height: 700 },
                    { x: 30, y: 30 + 700 + 20, width: 540, height: 700 }
                ]
            };
        case '3x1': // Photo Strip: 600 x 1700 px
            return {
                width: 600, height: 1700,
                slots: [
                    { x: 30, y: 30, width: 540, height: 460 },
                    { x: 30, y: 30 + 460 + 20, width: 540, height: 460 },
                    { x: 30, y: 30 + (460 + 20) * 2, width: 540, height: 460 }
                ]
            };
        case '4x1': // Photo Strip: 600 x 1700 px
            return {
                 width: 600, height: 1700,
                 slots: [
                     { x: 30, y: 30, width: 540, height: 340 },
                     { x: 30, y: 30 + 340 + 20, width: 540, height: 340 },
                     { x: 30, y: 30 + (340 + 20) * 2, width: 540, height: 340 },
                     { x: 30, y: 30 + (340 + 20) * 3, width: 540, height: 340 }
                 ]
            };
        case '2x2': // Grid 2x2: 900 x 1200 px
            return {
                width: 900, height: 1200,
                slots: [
                    { x: 50, y: 50, width: 385, height: 385 },
                    { x: 50 + 385 + 30, y: 50, width: 385, height: 385 },
                    { x: 50, y: 50 + 385 + 30, width: 385, height: 385 },
                    { x: 50 + 385 + 30, y: 50 + 385 + 30, width: 385, height: 385 },
                ]
            };
         case '2x3': // Grid 2x3: 900 x 1500 px
            return {
                width: 900, height: 1500,
                slots: Array.from({length: 6}).map((_, i) => ({
                    x: 50 + (i%2) * (385 + 30),
                    y: 50 + Math.floor(i/2) * (385 + 30),
                    width: 385, height: 385
                }))
            };
         case '3x3': // Grid 3x3: 1285 x 1900 px
             return {
                width: 1285, height: 1900,
                slots: Array.from({length: 9}).map((_, i) => ({
                    x: 35 + (i%3) * (385 + 30),
                    y: 50 + Math.floor(i/3) * (385 + 30),
                    width: 385, height: 385
                }))
            };
        default:
            return { width: 1200, height: 1800, slots: [] };
    }
}

const createDefaultStyles = (gridId: string): FrameStyle[] => {
    const defaults: Partial<FrameStyle>[] = [
        {
            name: 'Classic White',
            backgroundConfig: { type: 'solid', color: '#ffffff' },
            elements: []
        },
        {
            name: 'Neon Night',
            backgroundConfig: {
                type: 'gradient',
                gradientType: 'linear',
                gradientAngle: 45,
                gradientStops: [{color: '#ff00cc', offset: 0}, {color: '#333399', offset: 100}]
            },
            elements: [{
                id: '1', type: 'text', content: 'Party Time', x: 50, y: 92, width: 0, height: 0, rotation: 0, opacity: 1, zIndex: 1,
                fontFamily: 'Neon', fontSize: 60, color: '#ff00ff', effect: 'neon', fontWeight: 'bold'
            }]
        },
        {
            name: 'Sunny Day',
            backgroundConfig: {
                type: 'gradient',
                gradientType: 'radial',
                gradientStops: [{color: '#ffffcc', offset: 0}, {color: '#ff9966', offset: 100}]
            },
            elements: []
        }
    ];

    return defaults.map(d => ({
        id: crypto.randomUUID(),
        name: d.name!,
        backgroundConfig: d.backgroundConfig!,
        elements: d.elements || [],
        overlayUrl: '',
        previewUrl: ''
    }));
};

export const getStoredFrames = (): FrameLayout[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.FRAMES);
  if (stored) {
    try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
        console.error('Error parsing stored frames', e);
        localStorage.removeItem(STORAGE_KEYS.FRAMES);
    }
  }

  const defaultFrames: FrameLayout[] = [
    { id: '1x1', label: 'Polaroid (1200x1800)', enabled: true, price: 10000, styles: createDefaultStyles('1x1') },
    { id: '2x1', label: 'Strip 2 (600x1700)', enabled: true, price: 15000, styles: createDefaultStyles('2x1') },
    { id: '3x1', label: 'Strip 3 (600x1700)', enabled: true, price: 17000, styles: createDefaultStyles('3x1') },
    { id: '4x1', label: 'Strip 4 (600x1700)', enabled: true, price: 20000, styles: createDefaultStyles('4x1') },
    { id: '2x2', label: 'Grid 2x2 (900x1200)', enabled: true, price: 20000, styles: createDefaultStyles('2x2') },
    { id: '2x3', label: 'Grid 2x3 (900x1500)', enabled: true, price: 25000, styles: createDefaultStyles('2x3') },
    { id: '3x3', label: 'Grid 3x3 (1285x1900)', enabled: true, price: 30000, styles: createDefaultStyles('3x3') },
  ];
  saveStoredFrames(defaultFrames);
  return defaultFrames;
};

export const saveStoredFrames = (frames: FrameLayout[]): void => {
  localStorage.setItem(STORAGE_KEYS.FRAMES, JSON.stringify(frames));
  // Sync ke backend secara background (non-blocking)
  syncFramesToDatabase(frames).catch(e => console.warn('Background frame sync gagal:', e));
};

// --- Filters ---

export const getStoredFilters = (): PhotoFilter[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.FILTERS);
  if (stored) {
    try {
        return JSON.parse(stored);
    } catch(e) {
        console.error('Error parsing filters', e);
    }
  }
  return seedDefaultFilters();
};

export const seedDefaultFilters = (): PhotoFilter[] => {
  const defaultFilters: PhotoFilter[] = [
    { id: 'normal', name: 'Normal', cssFilter: 'none', enabled: true },
    { id: 'grayscale', name: 'B&W', cssFilter: 'grayscale(100%)', enabled: true },
    { id: 'sepia', name: 'Sepia', cssFilter: 'sepia(100%)', enabled: true },
    { id: 'contrast', name: 'High Contrast', cssFilter: 'contrast(160%)', enabled: true },
    { id: 'brightness', name: 'Bright', cssFilter: 'brightness(130%)', enabled: true },
    { id: 'vintage', name: 'Vintage', cssFilter: 'sepia(50%) contrast(120%) saturate(80%)', enabled: true },
    { id: 'cool', name: 'Cool', cssFilter: 'hue-rotate(180deg) saturate(80%)', enabled: true },
    { id: 'warm', name: 'Warm', cssFilter: 'sepia(30%) saturate(140%)', enabled: true },
    { id: 'fade', name: 'Fade', cssFilter: 'opacity(80%) contrast(90%)', enabled: true },
    { id: 'blur', name: 'Dreamy', cssFilter: 'blur(1px) brightness(110%)', enabled: true },
    { id: 'clarendon', name: 'Vivid', cssFilter: 'contrast(120%) saturate(125%)', enabled: true },
    { id: 'gingham', name: 'Soft', cssFilter: 'brightness(105%) hue-rotate(-10deg)', enabled: true },
    { id: 'moon', name: 'Moon', cssFilter: 'grayscale(100%) brightness(110%) contrast(110%)', enabled: true },
    { id: 'lark', name: 'Lark', cssFilter: 'contrast(90%) brightness(110%) saturate(110%)', enabled: true },
    { id: 'reyes', name: 'Reyes', cssFilter: 'sepia(20%) brightness(110%) contrast(85%)', enabled: true },
    { id: 'slumber', name: 'Slumber', cssFilter: 'saturate(66%) brightness(105%)', enabled: true },
    { id: 'crema', name: 'Crema', cssFilter: 'contrast(90%) saturate(90%)', enabled: true },
    { id: 'aden', name: 'Aden', cssFilter: 'hue-rotate(-20deg) contrast(90%) saturate(85%) brightness(120%)', enabled: true },
    { id: 'perpetua', name: 'Perpetua', cssFilter: 'contrast(110%) brightness(110%) saturate(110%)', enabled: true },
    { id: 'amaro', name: 'Amaro', cssFilter: 'hue-rotate(-10deg) contrast(90%) brightness(110%) saturate(150%)', enabled: true },
    { id: 'mayfair', name: 'Mayfair', cssFilter: 'contrast(110%) saturate(110%)', enabled: true }
  ];
  saveStoredFilters(defaultFilters);
  return defaultFilters;
};

export const saveStoredFilters = (filters: PhotoFilter[]): void => {
  localStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(filters));
  // Sync ke backend secara background (non-blocking)
  syncFiltersToDatabase(filters).catch(e => console.warn('Background filter sync gagal:', e));
};

// --- Backgrounds ---

export const getStoredBackgrounds = (): VirtualBackground[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.BACKGROUNDS);
  if (stored) {
    try {
        return JSON.parse(stored);
    } catch(e) {
        console.error('Error parsing backgrounds', e);
    }
  }
  return seedDefaultBackgrounds();
};

export const seedDefaultBackgrounds = (): VirtualBackground[] => {
  return [];
};

export const saveStoredBackgrounds = (bgs: VirtualBackground[]): void => {
  localStorage.setItem(STORAGE_KEYS.BACKGROUNDS, JSON.stringify(bgs));
};

// --- Backend Syncing Helpers ---

/**
 * Sync frame layouts ke backend sebagai frame_templates.
 * Setiap style dalam setiap layout dikirim sebagai satu frame template.
 */
export const syncFramesToDatabase = async (frames: FrameLayout[]): Promise<boolean> => {
  const baseUrl = getApiBaseUrl();
  try {
    // Kirim setiap style sebagai individual frame template
    const promises = frames.flatMap(layout =>
      layout.styles.map(style =>
        fetch(`${baseUrl}/api/frame_templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${layout.label} — ${style.name}`,
            category: layout.id,
            image_url: style.overlayUrl || style.previewUrl || '',
            slot_count: layout.styles.length,
            layout_config: {
              layout_id: layout.id,
              layout_label: layout.label,
              layout_price: layout.price,
              layout_enabled: layout.enabled,
              style_id: style.id,
              backgroundConfig: style.backgroundConfig,
              elements: style.elements,
              previewUrl: style.previewUrl,
              overlayUrl: style.overlayUrl
            }
          })
        }).catch(() => null) // Jangan crash jika satu gagal
      )
    );
    await Promise.allSettled(promises);
    return true;
  } catch (e) {
    console.error('Gagal sync frames ke backend:', e);
    return false;
  }
};

/**
 * Sync filters ke backend.
 * Format backend: { name, css_filter, is_active }
 */
export const syncFiltersToDatabase = async (filters: PhotoFilter[]): Promise<boolean> => {
  const baseUrl = getApiBaseUrl();
  try {
    const promises = filters.map(filter =>
      fetch(`${baseUrl}/api/filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: filter.name,
          css_filter: filter.cssFilter,
          is_active: filter.enabled ? 1 : 0
        })
      }).catch(() => null)
    );
    await Promise.allSettled(promises);
    return true;
  } catch (e) {
    console.error('Gagal sync filters ke backend:', e);
    return false;
  }
};

export const syncToDatabase = async (): Promise<boolean> => {
  const frames = getStoredFrames();
  const filters = getStoredFilters();
  const framesSuccess = await syncFramesToDatabase(frames);
  const filtersSuccess = await syncFiltersToDatabase(filters);
  return framesSuccess && filtersSuccess;
};

/**
 * Sync data dari Backend API Server ke localStorage kiosk.
 * Filters: diambil penuh dari backend (format baru: css_filter field).
 * Frames: hanya diambil jika localStorage kosong (format backend lebih sederhana).
 */
export const syncFromDatabase = async (): Promise<boolean> => {
  const baseUrl = getApiBaseUrl();
  try {
    // 1. Fetch filters dari backend
    // Format response baru: { success, count, data: [{ id, name, css_filter, is_active }] }
    const filtersRes = await fetch(`${baseUrl}/api/filters`);
    let hasFiltersData = false;
    if (filtersRes.ok) {
      const data = await filtersRes.json();
      if (data.success && data.data && data.data.length > 0) {
        hasFiltersData = true;
        const dbFilters: PhotoFilter[] = data.data.map((row: any) => ({
          id: String(row.id),
          name: row.name,
          cssFilter: row.css_filter,
          enabled: !!row.is_active
        }));
        localStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(dbFilters));
        console.log(`✅ ${dbFilters.length} filter berhasil diambil dari backend`);
      }
    }

    // 2. Fetch frame templates dari backend
    // Format response baru: { success, count, data: [{ id, name, category, image_url, slot_count, layout_config }] }
    const framesRes = await fetch(`${baseUrl}/api/frame_templates`);
    let hasFramesData = false;
    if (framesRes.ok) {
      const data = await framesRes.json();
      if (data.success && data.data && data.data.length > 0) {
        hasFramesData = true;
        // Rekonstruksi FrameLayout dari data backend
        // layout_config berisi data lengkap yang disimpan saat syncFramesToDatabase
        const layoutsMap = new Map<string, FrameLayout>();

        for (const row of data.data) {
          const config = typeof row.layout_config === 'string'
            ? JSON.parse(row.layout_config)
            : row.layout_config;

          const layoutId = config.layout_id || row.category || 'unknown';

          if (!layoutsMap.has(layoutId)) {
            layoutsMap.set(layoutId, {
              id: layoutId,
              label: config.layout_label || `${layoutId} Layout`,
              enabled: config.layout_enabled !== undefined ? !!config.layout_enabled : true,
              price: config.layout_price !== undefined ? Number(config.layout_price) : 20000,
              styles: []
            });
          }

          layoutsMap.get(layoutId)!.styles.push({
            id: config.style_id || String(row.id),
            name: row.name.replace(`${config.layout_label} — `, ''),
            backgroundConfig: config.backgroundConfig || { type: 'solid', color: '#ffffff' },
            elements: config.elements || [],
            previewUrl: config.previewUrl || '',
            overlayUrl: config.overlayUrl || ''
          });
        }

        const frameLayouts = Array.from(layoutsMap.values());
        localStorage.setItem(STORAGE_KEYS.FRAMES, JSON.stringify(frameLayouts));
        console.log(`✅ ${frameLayouts.length} layout frame berhasil diambil dari backend`);
      }
    }

    // Auto-seed default data ke backend jika masih kosong (pertama kali setup)
    if (!hasFiltersData) {
      console.log('📦 Backend kosong, seeding default filters...');
      await syncFiltersToDatabase(getStoredFilters());
    }
    if (!hasFramesData) {
      console.log('📦 Backend kosong, seeding default frames...');
      await syncFramesToDatabase(getStoredFrames());
    }

    return true;
  } catch (error) {
    console.error('Gagal sync dari backend:', error);
    return false;
  }
};