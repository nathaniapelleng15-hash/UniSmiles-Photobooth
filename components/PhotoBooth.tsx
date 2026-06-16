import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Settings, Camera, ChevronRight, Download, RefreshCw, 
  Check, Image as ImageIcon, ChevronLeft, SwitchCamera, Send, Mail, QrCode, Printer,
  Lock, Unlock, Scan, X, ChevronUp, ChevronDown, Loader2, Wand2, LayoutTemplate, AlertCircle, AlertTriangle
} from 'lucide-react';
import { FrameLayout, FrameStyle, PhotoFilter, GridLayoutId, VirtualBackground, FrameElement } from '../types';
import { getStoredFrames, getStoredFilters, getLayoutConfig, getStoredBackgrounds, getAppConfig } from '../services/storageService';
import { useAirGesture } from './useAirGesture';

// Global Scale (Now 1.0 since we removed transform scale from index.html)
const GLOBAL_SCALE = 1.0;

// Sound Effects
const SHUTTER_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3";
const COUNTDOWN_SOUND_URL = "https://cdn.pixabay.com/download/audio/2022/03/24/audio_cda640386c.mp3?filename=beep-6-96243.mp3";

// API — Local Node.js server (port 3001)
const UPLOAD_API_URL = "http://localhost:3001/api/photos/upload";
const BASE_RESULT_URL = "http://localhost:3001/uploads/";
// API_KEY tidak diperlukan lagi (server lokal)

interface PhotoBoothProps {
  onAdminClick: () => void;
}

type BoothStep = 'LANDING' | 'LAYOUT' | 'PAYMENT' | 'CAPTURE' | 'EDIT' | 'RESULT';

// --- OPTIMIZATION: Global Image Cache ---
// Stores URL -> Base64 mapping to prevent re-fetching same assets
const imageCache = new Map<string, string>();

// --- Helper: Robust Image to Base64 with Timeout & Cache ---
const convertImageToBase64 = async (url: string): Promise<string> => {
  // 1. Check Cache
  if (!url || url.startsWith('data:')) return url;
  if (imageCache.has(url)) return imageCache.get(url)!;

  // Helper to fetch with timeout and convert to base64
  const fetchAndConvert = async (targetUrl: string, timeout = 5000): Promise<string> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(targetUrl, { 
            signal: controller.signal,
            credentials: 'omit', // Standard CORS request without cookies
            referrerPolicy: 'no-referrer', // Prevent sending Referer header to avoid hotlink blocks
            mode: 'cors'
        });
        clearTimeout(id);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') resolve(reader.result);
                else reject(new Error('Reader result is not string'));
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
  };

  // Helper: Try to load via Image object and draw to canvas (last resort for CORS-friendly but fetch-unfriendly servers)
  const imageObjectLoad = (targetUrl: string): Promise<string> => {
      return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous'; // Required for toDataURL
          img.referrerPolicy = 'no-referrer'; 
          img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) { reject(new Error('Canvas ctx null')); return; }
              ctx.drawImage(img, 0, 0);
              try {
                  const data = canvas.toDataURL('image/png');
                  resolve(data);
              } catch (e) { reject(e); } // Likely tainted canvas
          };
          img.onerror = (e) => reject(new Error('Image load error'));
          img.src = targetUrl;
      });
  };

  // List of Proxies to Try in Order
  // Using multiple services maximizes chance of bypassing 403s
  const PROXIES = [
      (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      (u: string) => `https://wsrv.nl/?url=${encodeURIComponent(u)}&output=png`,
      (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u: string) => `https://images.weserv.nl/?url=${encodeURIComponent(u)}&output=png`,
      (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];

  let resultBase64: string | null = null;

  // 1. Try Direct Fetch first (optimistic)
  try {
      resultBase64 = await fetchAndConvert(url);
  } catch (e) {
      // console.warn("Direct fetch failed, trying proxies...");
  }

  // 2. Try Proxies if direct failed
  if (!resultBase64) {
      for (const proxyGen of PROXIES) {
          try {
              const proxyUrl = proxyGen(url);
              resultBase64 = await fetchAndConvert(proxyUrl);
              if (resultBase64) break; // Success!
          } catch (e) {
              // Continue to next proxy
          }
      }
  }

  // 3. Last Resort: Image Object Load (bypass fetch API restrictions)
  if (!resultBase64) {
      try {
          resultBase64 = await imageObjectLoad(url);
      } catch (e) {
          console.error(`All strategies failed for: ${url}`);
      }
  }

  if (resultBase64 && resultBase64.startsWith('data:')) {
      imageCache.set(url, resultBase64);
      return resultBase64;
  }
  
  // If all else fails, return original URL. 
  // It might fail in html2canvas (taint), but at least it tries.
  return url;
};

// --- Components ---

interface BoothWrapperProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onAdminClick?: () => void;
  hideAdmin?: boolean;
  isLocked?: boolean;
  onToggleLock?: () => void;
  uiMode: 'normal' | 'air-touch';
  hideHeader?: boolean;
  customBg?: string;
  onBack?: () => void;
  hideLogos?: boolean;
  isVertical?: boolean;
}

const BoothWrapper: React.FC<BoothWrapperProps> = ({ children, title, subtitle, onAdminClick, hideAdmin, isLocked, onToggleLock, uiMode, hideHeader, customBg, onBack, hideLogos, isVertical }) => (
  <div className={`h-full w-full ${customBg || 'bg-[#0c1633]'} text-white flex flex-col overflow-hidden select-none relative`}>
      {/* Logos at Bottom Center for all wrapper screens */}
      {!hideLogos && (
          <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 w-max flex items-center justify-center opacity-80 pointer-events-none z-40 ${isVertical ? 'gap-6 scale-75' : 'gap-10 md:gap-12 scale-90 md:scale-100'}`}>
              <img src="/assets/LOGO UNI INSIDE.png" alt="Uni Inside" className={`object-contain ${isVertical ? 'h-8' : 'h-12 md:h-16'}`} />
              <img src="/assets/LOGO KOLAB.png" alt="Kolab" className={`object-contain ${isVertical ? 'h-8' : 'h-12 md:h-16'}`} />
              <img src="/assets/LOGO UNI SMILE.png" alt="Uni Smile" className={`rounded-xl object-contain ${isVertical ? 'h-8' : 'h-12 md:h-16'}`} />
          </div>
      )}

      {/* Absolute Back Button if onBack is provided */}
      {onBack && (
         <div className={`absolute z-50 ${isVertical ? 'top-3 left-3' : 'top-6 left-6'}`}>
             <button onClick={onBack} className="active:scale-95 hover:scale-110 transition-all outline-none">
                 <img src="/assets/BACK.png" alt="Back" className={`object-contain drop-shadow-md ${isVertical ? 'h-12' : 'h-20 md:h-24'}`} />
             </button>
         </div>
      )}

      {!hideHeader && (
        <div className={`px-6 w-full flex justify-center relative items-center bg-white/10 backdrop-blur-md border-b border-white/10 shrink-0 z-10 ${uiMode === 'air-touch' ? 'py-8' : isVertical ? 'py-3' : 'py-5'}`}>
            {/* Title - Centered */}
            <div className="text-center pointer-events-none">
                {title && <h2 className={`font-display font-bold tracking-tight leading-none drop-shadow-lg ${uiMode === 'air-touch' ? 'text-4xl' : isVertical ? 'text-xl' : 'text-3xl md:text-4xl'}`}>{title}</h2>}
                {subtitle && <p className={`text-white/90 mt-1 drop-shadow-md ${uiMode === 'air-touch' ? 'text-xl' : isVertical ? 'text-xs' : 'text-base md:text-lg'}`}>{subtitle}</p>}
            </div>

            {/* Absolute positioned right actions */}
            <div className={`absolute right-4 top-1/2 -translate-y-1/2 flex z-20 ${uiMode === 'air-touch' ? 'gap-6' : 'gap-3'}`}>
                {onToggleLock && (
                <button id="btn-toggle-cursor-lock" onClick={onToggleLock} className={`rounded-full transition-colors active:scale-95 border-2 ${uiMode === 'air-touch' ? 'p-6' : 'p-4'} ${isLocked ? 'bg-red-500/80 border-red-400' : 'bg-green-500/20 border-green-400/50 hover:bg-green-500/40'}`} style={{ display: uiMode === 'air-touch' ? 'block' : 'none' }}>
                    {isLocked ? <Lock size={uiMode === 'air-touch' ? 40 : 32} /> : <Unlock size={uiMode === 'air-touch' ? 40 : 32} />}
                </button>
                )}
                {!hideAdmin && onAdminClick && (
                    <button id="btn-admin-settings" onClick={onAdminClick} className={`hover:bg-white/20 rounded-full transition-colors active:scale-95 ${uiMode === 'air-touch' ? 'p-6' : isVertical ? 'p-2' : 'p-4'}`}>
                        <Settings size={uiMode === 'air-touch' ? 40 : isVertical ? 22 : 32}/>
                    </button>
                )}
            </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden relative flex flex-col">
          {children}
      </div>
  </div>
);

// --- Detailed Frame Thumbnail ---
const FrameThumbnail: React.FC<{ style: FrameStyle, layoutId: string }> = ({ style, layoutId }) => {
    const config = getLayoutConfig(layoutId);
    let bgStyle: React.CSSProperties = { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 };
    
    // Simple estimation for thumbnails: assume thumbnail width is around 150px
    const THUMB_WIDTH = 150;
    const scaleFactor = THUMB_WIDTH / config.width;
    
    if (style.backgroundConfig.type === 'solid') {
        bgStyle.backgroundColor = style.backgroundConfig.color;
    } else if (style.backgroundConfig.type === 'gradient') {
        const stops = style.backgroundConfig.gradientStops?.map(s => `${s.color} ${s.offset}%`).join(', ');
        if (style.backgroundConfig.gradientType === 'radial') {
            bgStyle.background = `radial-gradient(circle, ${stops})`;
        } else {
            bgStyle.background = `linear-gradient(${style.backgroundConfig.gradientAngle || 90}deg, ${stops})`;
        }
    } else {
        bgStyle.backgroundColor = '#ffffff';
    }

    return (
        <div className="relative w-full h-full overflow-hidden bg-white shadow-sm" style={{ aspectRatio: `${config.width} / ${config.height}` }}>
            <div style={bgStyle}></div>
            {config.slots.map((slot, i) => (
                <div key={`slot-${i}`} className="absolute bg-gray-900/10 border border-gray-900/20"
                    style={{
                        left: `${(slot.x / config.width) * 100}%`,
                        top: `${(slot.y / config.height) * 100}%`,
                        width: `${(slot.width / config.width) * 100}%`,
                        height: `${(slot.height / config.height) * 100}%`,
                    }}
                >
                    <div className="w-full h-full flex items-center justify-center opacity-30"><ImageIcon size={12} className="text-black" /></div>
                </div>
            ))}
            {style.elements.map((el) => {
                const widthVal = el.width && !isNaN(Number(el.width)) && Number(el.width) > 0 ? Number(el.width) : 20;
                
                // Scale text properties
                const fontSize = (el.fontSize || 40) * scaleFactor;
                const strokeWidth = 0.5; // Fixed small stroke for thumbnails

                return (
                    <div key={el.id} style={{
                            position: 'absolute', left: `${el.x}%`, top: `${el.y}%`,
                            transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
                            width: el.type === 'text' ? 'auto' : `${widthVal}%`,
                            zIndex: 10, opacity: el.opacity,
                        }}
                    >
                        {el.type === 'text' ? (
                            <span style={{
                                fontFamily: el.fontFamily, 
                                fontSize: `${fontSize}px`, 
                                fontWeight: el.fontWeight, 
                                fontStyle: el.fontStyle, 
                                textDecoration: el.textDecoration,
                                color: el.color, 
                                whiteSpace: 'nowrap',
                                textShadow: el.effect === 'shadow' ? '1px 1px 1px rgba(0,0,0,0.5)' : el.effect === 'neon' ? `0 0 2px ${el.color}, 0 0 4px ${el.color}` : 'none',
                                WebkitTextStroke: el.effect === 'outline' ? `${strokeWidth}px black` : 'none',
                            }}>{el.content}</span>
                        ) : (
                            <img 
                                src={el.content} 
                                alt="asset" 
                                style={{ width: '100%', height: 'auto', display: 'block' }} 
                                loading="lazy"
                                // Important: No crossOrigin here for thumbnails, ensures display even if CORS fails
                                onError={(e) => {
                                    // Fallback to a clear error indicator if asset fails
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export const PhotoBooth: React.FC<PhotoBoothProps> = ({ onAdminClick }) => {
  const [step, setStep] = useState<BoothStep>('LANDING');
  const [uiMode, setUiMode] = useState<'normal' | 'air-touch'>('normal');
  const [monitorOrientation, setMonitorOrientation] = useState<'horizontal' | 'vertical'>('horizontal');

  // State
  const [selectedLayoutId, setSelectedLayoutId] = useState<GridLayoutId | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<PhotoFilter | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<FrameStyle | null>(null);
  const [editTab, setEditTab] = useState<'FRAMES' | 'FILTERS'>('FRAMES');
  
  // Important: processedFrame holds the version where all asset URLs are converted to Base64
  const [processedFrame, setProcessedFrame] = useState<FrameStyle | null>(null);
  const [areAssetsReady, setAreAssetsReady] = useState(false);
  
  const [backgrounds, setBackgrounds] = useState<VirtualBackground[]>([]);
  const [selectedBackground, setSelectedBackground] = useState<VirtualBackground | null>(null);
  const [frames, setFrames] = useState<FrameLayout[]>([]);
  const [filters, setFilters] = useState<PhotoFilter[]>([]);
  
  const [customSubtitle, setCustomSubtitle] = useState('');
  const [customLogoUrl, setCustomLogoUrl] = useState('');

  // Camera & Capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryCount, setCameraRetryCount] = useState(0);
  
  // Hands / Gesture
  const handsRef = useRef<any>(null);
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [isCursorLocked, setIsCursorLocked] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationBox, setCalibrationBox] = useState({ minX: 0.3, maxX: 0.7, minY: 0.25, maxY: 0.75 });
  // This ref is updated EVERY render so the MediaPipe callback always has fresh closures
  const onHandResultsRef = useRef<(results: any) => void>(() => {});

  // Open-hand start-photo hold state (separate from 3s click-hold)
  const openHandCaptureHoldStart = useRef<number | null>(null);
  const OPEN_HAND_START_MS = 1500; // 1.5 s to trigger startAutoCapture

  // Air Gesture Hook
  const { state: gestureState, processLandmarks, processNoHand } = useAirGesture(
    gestureEnabled && !isCursorLocked,
    calibrationBox,
    {
      onHoldClick: (_el) => {},
      onOpenHandHold: (durationMs, _el) => {
        if (step === 'CAPTURE' && !isAutoCapturing && capturedPhotos.length === 0) {
          if (!openHandCaptureHoldStart.current) {
            openHandCaptureHoldStart.current = Date.now();
          } else if (durationMs >= OPEN_HAND_START_MS) {
            if (!isAutoCapturing) {
              openHandCaptureHoldStart.current = null;
              setIsAutoCapturing(true);
            }
          }
        } else {
          openHandCaptureHoldStart.current = null;
        }
      },
    }
  );

  // Reset capture hold when hand leaves or pinches
  useEffect(() => {
    if (gestureState.gesture !== 'open_hand') {
      openHandCaptureHoldStart.current = null;
    }
  }, [gestureState.gesture]);

  // Convenient destructure
  const cursorPos = gestureState.cursorPos;
  const isPinching = gestureState.isPinching;

  // UI State
  const [isResultPanelCollapsed, setIsResultPanelCollapsed] = useState(false);
  
  const configRef = useRef({ gestureEnabled: false, isCursorLocked: false, countdown: null as number | null, calibrationBox: { minX: 0.3, maxX: 0.7, minY: 0.25, maxY: 0.75 } });
  // ✅ Sync every render (no useEffect delay) so MediaPipe callback always reads fresh values
  configRef.current = { gestureEnabled, isCursorLocked, countdown, calibrationBox };

  const loopStateRef = useRef({ step, isCalibrating, selectedBackground, calibrationBox });
  loopStateRef.current = { step, isCalibrating, selectedBackground, calibrationBox };
  
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);
  const countdownAudioRef = useRef<HTMLAudioElement | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');

  const selfieSegmentationRef = useRef<any>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isCameraRunning = useRef(false);

  // Result & Upload State
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'preparing' | 'uploading' | 'success' | 'error'>('idle');
  const [resultTimestamp, setResultTimestamp] = useState<string>('');
  const [finalUploadedUrl, setFinalUploadedUrl] = useState<string | null>(null);

  useEffect(() => {
    const allFrames = getStoredFrames(); // Removed filter here to get complete list, filtering happens in LAYOUT step
    setFrames(allFrames);
    const allFilters = getStoredFilters().filter(f => f.enabled);
    setFilters(allFilters);
    setBackgrounds(getStoredBackgrounds());
    
    const appConfig = getAppConfig();
    setCustomSubtitle(appConfig.customSubtitle || '');
    setCustomLogoUrl(appConfig.customLogoUrl || '');
    
    const mode = appConfig.uiMode || 'normal';
    setUiMode(mode);
    setGestureEnabled(mode === 'air-touch');
    setMonitorOrientation(appConfig.monitorOrientation || 'horizontal');

    shutterAudioRef.current = new Audio(SHUTTER_SOUND_URL);
    shutterAudioRef.current.preload = 'auto';
    countdownAudioRef.current = new Audio(COUNTDOWN_SOUND_URL);
    countdownAudioRef.current.preload = 'auto';

    if ((window as any).SelfieSegmentation) {
      const selfieSegmentation = new (window as any).SelfieSegmentation({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` });
      selfieSegmentation.setOptions({ modelSelection: 1, selfieMode: true });
      selfieSegmentation.onResults(onSegmentationResults);
      selfieSegmentationRef.current = selfieSegmentation;
    }

    if ((window as any).Hands) {
      const hands = new (window as any).Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      // ✅ FIX: wrap in a stable closure that calls the always-fresh ref
      // This avoids the stale-closure bug where processLandmarks/processNoHand
      // are captured once at init (when gestureEnabled=false) and never update.
      hands.onResults((results: any) => onHandResultsRef.current(results));
      handsRef.current = hands;
    }
  }, []);

  // --- BUG FIX: Auto-select first frame if none selected ---
  useEffect(() => {
    // If we are in FRAMES or RESULT step, and no frame is selected yet, pick the first one from the current layout.
    // This prevents the "blank image" or crash issue when finishing without selecting a frame.
    if ((step === 'FRAMES' || step === 'RESULT') && !selectedFrame && selectedLayoutId) {
        const layoutConfig = frames.find(f => f.id === selectedLayoutId);
        if (layoutConfig && layoutConfig.styles.length > 0) {
            setSelectedFrame(layoutConfig.styles[0]);
        }
    }
  }, [step, selectedFrame, selectedLayoutId, frames]);

  // --- OPTIMIZATION: Process Frame Assets to Base64 ---
  useEffect(() => {
    let isMounted = true;
    const processFrameAssets = async () => {
        // Validation checks
        if (!selectedFrame) {
            if (isMounted) {
                setProcessedFrame(null);
                setAreAssetsReady(true);
            }
            return;
        }
        
        // Only run when entering RESULT step
        if (step !== 'RESULT') {
            if (isMounted) {
                if (areAssetsReady) setAreAssetsReady(false);
                if (processedFrame) setProcessedFrame(null);
            }
            return;
        }

        // Optimization: Avoid re-processing if ID is identical
        if (processedFrame?.id === selectedFrame.id && areAssetsReady) {
            return;
        }

        // Optimization: If no elements, no need to process
        if (!selectedFrame.elements || selectedFrame.elements.length === 0) {
             if (isMounted) {
                setProcessedFrame(selectedFrame);
                setAreAssetsReady(true);
                setUploadStatus('idle');
             }
             return;
        }

        if (isMounted) {
            setAreAssetsReady(false);
            setUploadStatus('preparing');
        }

        const newFrame = JSON.parse(JSON.stringify(selectedFrame));
        
        try {
            // Convert all sticker image URLs to Base64 in PARALLEL
            const newElements = await Promise.all(newFrame.elements.map(async (el: FrameElement) => {
                if (el.type === 'sticker' && el.content.startsWith('http')) {
                    try {
                        const base64 = await convertImageToBase64(el.content);
                        return { ...el, content: base64 };
                    } catch (innerErr) {
                        console.error("Failed to convert specific asset, keeping URL:", el.content);
                        return el; // Keep original URL as fallback
                    }
                }
                return el;
            }));

            if (isMounted) {
                newFrame.elements = newElements;
                setProcessedFrame(newFrame);
                // Force ready
                setAreAssetsReady(true);
                setUploadStatus('idle');
            }
            
        } catch (e) {
            console.error("Asset processing failed globally", e);
            // Critical Fail-safe: Allow user to proceed with raw URLs
            if (isMounted) {
                setProcessedFrame(selectedFrame); // Fallback to raw frame
                setAreAssetsReady(true); 
                setUploadStatus('error');
            }
        }
    };

    // Safety Timeout: If processing takes > 10 seconds, force ready state
    const safetyTimeout = setTimeout(() => {
        if (step === 'RESULT' && !areAssetsReady && isMounted) {
            console.warn("Asset processing timed out. Forcing ready state.");
            setAreAssetsReady(true);
            setUploadStatus('idle');
        }
    }, 10000);

    processFrameAssets();

    return () => {
        isMounted = false;
        clearTimeout(safetyTimeout);
    };
  }, [selectedFrame, step]); // Removed extra deps to prevent looping



  // ✅ Update ref every render — MediaPipe callback always calls the latest version
  // This fixes stale closure: processLandmarks captured at init had enabled=false
  onHandResultsRef.current = (results: any) => {
      const { gestureEnabled: ge, isCursorLocked: locked, countdown: cd } = configRef.current;

      if (!ge || locked || (cd !== null && cd > 0)) {
          processNoHand();
          return;
      }

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          processLandmarks(results.multiHandLandmarks[0]);
      } else {
          processNoHand();
      }
  };

  const adjustSensitivity = (level: number) => {
      const maxMargin = 0.35; const minMargin = 0.1; 
      const margin = minMargin + ((level - 1) / 4) * (maxMargin - minMargin);
      setCalibrationBox({ minX: margin, maxX: 1 - margin, minY: margin * 0.8, maxY: 1 - (margin * 1.2) });
  };

  // ── Air Cursor React Component ─────────────────────────────────────────────
  const AirCursor: React.FC = () => {
    const isVisible = gestureEnabled && cursorPos !== null && !isCursorLocked;
    const { gesture, holdProgress, holdFired } = gestureState;
    const circumference = 2 * Math.PI * 34; // r=34 for 80px SVG
    const strokeDashoffset = circumference * (1 - (holdProgress || 0));
    const gestureClass = gesture === 'pinch' ? 'pinch' : gesture === 'open_hand' ? 'open-hand' : '';
    const labelText = gesture === 'pinch' ? '✌ PINCH' : gesture === 'open_hand' ? '✋ HOLD' : '';
    return (
      <div
        id="air-cursor"
        className={`air-cursor ${gestureClass} ${holdFired ? 'hold-fired' : ''}`}
        style={{ 
          left: cursorPos?.x ?? 0, 
          top: cursorPos?.y ?? 0,
          display: isVisible ? 'block' : 'none'
        }}
      >
        {/* Progress ring SVG – only visible during open_hand hold */}
        {gesture === 'open_hand' && holdProgress > 0 && (
          <svg id="air-cursor-progress-ring" className="air-cursor__svg" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(246,205,70,0.2)" strokeWidth="4" />
            <circle
              className="air-cursor__progress-circle"
              cx="40" cy="40" r="34"
              fill="none"
              stroke={holdProgress >= 1 ? '#fff' : '#f6cd46'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
        )}
        <div className="air-cursor__ring" />
        <div className="air-cursor__dot" />
        {labelText && <div className="air-cursor__label">{labelText}</div>}
      </div>
    );
  };

  // Capture-screen open-hand hold progress (0-1 over OPEN_HAND_START_MS)
  // Derived from gestureState which updates every frame via setState in the hook
  const captureHoldProgress = (() => {
    if (step !== 'CAPTURE' || gestureState.gesture !== 'open_hand' || isAutoCapturing) return 0;
    if (!openHandCaptureHoldStart.current) return 0;
    // gestureState.holdProgress is the 3s hold-click progress (0-1 over 3s)
    // We want 1.5s progress, so scale: progress = elapsed / 1500ms
    // Since gestureState re-renders each frame, Date.now() will be fresh
    return Math.min(1, (Date.now() - openHandCaptureHoldStart.current) / OPEN_HAND_START_MS);
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // NOTE: gestureState is in deps through rendering – this IIFE re-runs every render triggered by gestureState changes

  // Improved Stop Camera to be more robust
  const stopCamera = () => {
    isCameraRunning.current = false;
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }
    if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
            track.stop();
            // Explicitly remove track to ensure it's detached
            stream.removeTrack(track);
        });
        videoRef.current.srcObject = null;
    }
  };

  // Robust Start Camera with Error Handling and Retry Mechanism
  useEffect(() => {
    let isActive = true;
    
    const startCamera = async () => {
      // Clear previous error when starting
      if (isActive) setCameraError(null);

      try {
        const constraints: MediaStreamConstraints = { 
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 }, 
                frameRate: { ideal: 30 } 
            } 
        };
        
        if (currentDeviceId) {
            (constraints.video as MediaTrackConstraints).deviceId = { exact: currentDeviceId };
        }
        
        // Attempt to get user media
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // If effect cleaned up during await, stop stream immediately
        if (!isActive) {
            stream.getTracks().forEach(t => t.stop());
            return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
              try { 
                  if (!isActive) return;
                  await videoRef.current?.play(); 
                  if (isActive && !isCameraRunning.current) { 
                      isCameraRunning.current = true; 
                      processVideo(); 
                  } 
              } catch (e) { 
                  console.error("Play error", e); 
              }
          };
        }
        
        // Only enumerate devices if we successfully got a stream (permission granted)
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        if (isActive) {
            setDevices(allDevices.filter(d => d.kind === 'videoinput'));
        }

      } catch (err: any) {
        console.error("Camera error:", err);
        if (isActive) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setCameraError("Camera access denied. Please allow permission in browser settings.");
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setCameraError("No camera device found.");
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                setCameraError("Camera is in use by another application.");
            } else {
                setCameraError("Camera error: " + (err.message || "Unknown error"));
            }
        }
      }
    };

    startCamera();

    return () => {
      isActive = false;
      stopCamera();
    };
  }, [currentDeviceId, cameraRetryCount]); 

  const toggleCamera = () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex(d => d.deviceId === (currentDeviceId || devices[0].deviceId));
    setCurrentDeviceId(devices[(currentIndex + 1) % devices.length].deviceId);
  };

  const retryCamera = () => {
      setCameraRetryCount(prev => prev + 1);
  };

  const processVideo = async () => {
    if (!isCameraRunning.current || !videoRef.current) return;
    if (videoRef.current.paused || videoRef.current.ended) { animationFrameRef.current = requestAnimationFrame(processVideo); return; }

    const videoElement = videoRef.current;
    if (handsRef.current && configRef.current.gestureEnabled) await handsRef.current.send({ image: videoElement });

    const { step: currentStep, isCalibrating: currentIsCalibrating, selectedBackground: currentBackground } = loopStateRef.current;
    if (currentIsCalibrating || currentStep === 'PAYMENT' || currentStep === 'CAPTURE') {
        if (currentBackground && selfieSegmentationRef.current && currentStep !== 'LANDING') {
             try { await selfieSegmentationRef.current.send({ image: videoElement }); } catch (e) { drawVideoDirectly(); }
        } else {
             drawVideoDirectly();
        }
    }
    animationFrameRef.current = requestAnimationFrame(processVideo);
  };

  const drawVideoDirectly = () => {
    const canvas = processingCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const { isCalibrating: currentIsCalibrating, calibrationBox: currentBox } = loopStateRef.current;
    if (currentIsCalibrating) {
        const boxX = currentBox.minX * canvas.width; const boxY = currentBox.minY * canvas.height;
        const boxW = (currentBox.maxX - currentBox.minX) * canvas.width; const boxH = (currentBox.maxY - currentBox.minY) * canvas.height;
        ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 6; ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)'; ctx.fillRect(boxX, boxY, boxW, boxH);
    }
    ctx.restore();
  };

  const onSegmentationResults = (results: any) => {
    const canvas = processingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width !== results.image.width) { canvas.width = results.image.width; canvas.height = results.image.height; }
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-over';
    
    if (bgImageRef.current) {
         const bg = bgImageRef.current;
         const scale = Math.max(canvas.width / bg.width, canvas.height / bg.height);
         const x = (canvas.width / 2) - (bg.width / 2) * scale;
         const y = (canvas.height / 2) - (bg.height / 2) * scale;
         ctx.drawImage(bg, x, y, bg.width * scale, bg.height * scale);
    } else { ctx.fillStyle = '#00FF00'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.restore();
  };

  const loadBgImage = (url: string) => {
    const img = new Image(); img.crossOrigin = "Anonymous"; img.src = url;
    img.onload = () => { bgImageRef.current = img; };
  };

  // --- Actions ---
  const handleStart = () => {
      // Ensure state is clear when starting fresh
      setCapturedPhotos([]);
      setFinalUploadedUrl(null);
      setProcessedFrame(null);
      setStep('LAYOUT');
  };
  const handleLayoutSelect = (id: GridLayoutId) => { 
    setSelectedLayoutId(id); 
    setCapturedPhotos([]); 
    setIsAutoCapturing(false); 
    setResultTimestamp(Date.now().toString());
    setStep('PAYMENT'); 
  };
  const handlePaymentConfirm = async () => {
    const price = frames.find(f => f.id === selectedLayoutId)?.price || 45000;
    try {
      await fetch('http://localhost:3001/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: resultTimestamp,
          layout_id: selectedLayoutId,
          amount: price,
          payment_method: 'QRIS',
          status: 'success'
        })
      });
    } catch (e) {
      console.error('Failed to log transaction:', e);
    }
    setStep('CAPTURE');
  };
  const handleFinish = () => { 
    setStep('RESULT'); 
    setIsResultPanelCollapsed(window.innerWidth < 1280); 
  };


  const startAutoCapture = () => setIsAutoCapturing(true);
  const takePhoto = useCallback(() => {
    if (!processingCanvasRef.current) return;
    setFlash(true);
    if (shutterAudioRef.current) { shutterAudioRef.current.currentTime = 0; shutterAudioRef.current.play().catch(e=>{}); }
    setTimeout(() => setFlash(false), 150); 
    const canvas = processingCanvasRef.current;
    setCapturedPhotos(prev => [...prev, canvas.toDataURL('image/jpeg', 0.95)]);
    setCountdown(null);
  }, []);

  useEffect(() => {
    if (!isAutoCapturing || step !== 'CAPTURE') return;
    const config = getLayoutConfig(selectedLayoutId!);
    if (capturedPhotos.length >= config.slots.length) {
        setIsAutoCapturing(false); setIsProcessing(true);
        setTimeout(() => { setStep('EDIT'); setIsProcessing(false); }, 1000);
        return;
    }
    if (countdown === null && !flash) setCountdown(3); 
  }, [isAutoCapturing, capturedPhotos.length, step, selectedLayoutId, countdown, flash]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
        if (countdownAudioRef.current) { countdownAudioRef.current.currentTime = 0; countdownAudioRef.current.play().catch(e=>{}); }
        const timer = setTimeout(() => setCountdown(prev => (prev !== null ? prev - 1 : null)), 1000);
        return () => clearTimeout(timer);
    } else if (countdown === 0) takePhoto();
  }, [countdown, takePhoto]);

  const handleRetake = () => {
    setCapturedPhotos([]); 
    setIsAutoCapturing(false); 
    setStep('CAPTURE'); 
    setUploadStatus('idle'); 
    setFinalUploadedUrl(null); 
    setIsSent(false); 
    setProcessedFrame(null);
    setEmail('');
    setEmailError(null);
    const emailForm = document.getElementById('email-form-container');
    if (emailForm) { emailForm.classList.add('hidden'); emailForm.classList.remove('flex'); }
  };

  const handleHome = () => {
      // Soft Reset: Clear all state to initial values instead of forcing a page reload
      // This prevents black screen issues and feels faster
      setCapturedPhotos([]);
      setSelectedLayoutId(null);
      setSelectedBackground(null);
      setSelectedFilter(null);
      setSelectedFrame(null);
      setProcessedFrame(null);
      setAreAssetsReady(false);
      setFinalUploadedUrl(null);
      setUploadStatus('idle');
      setEmail('');
      setEmailError(null);
      setIsSent(false);
      setStep('LANDING');
      const emailForm = document.getElementById('email-form-container');
      if (emailForm) { emailForm.classList.add('hidden'); emailForm.classList.remove('flex'); }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || email.trim() === '') {
      setEmailError('Email tidak boleh kosong');
      return;
    }
    setIsSending(true);
    setEmailError(null);
    try {
      // Gunakan URL server jika sudah ada, kalau tidak generate dari canvas
      let photoUrl = finalUploadedUrl;
      let photoBase64: string | null = null;

      if (!photoUrl) {
        // Generate gambar langsung dari canvas
        const generated = await generateCompositeImage();
        if (!generated) throw new Error('Gagal menghasilkan gambar. Coba lagi.');
        photoBase64 = generated; // data:image/png;base64,...
      }

      const res = await fetch('http://localhost:3001/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          photoUrl: photoUrl || null,
          photoBase64: photoBase64 || null,
          sessionId: resultTimestamp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal kirim email');
      setIsSent(true);
    } catch (err: any) {
      setEmailError(err.message || 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setIsSending(false);
    }
  };

  // --- Final Image Generation (Canvas API — pixel-perfect at output resolution) ---
  const generateCompositeImage = async (): Promise<string | null> => {
    if (!selectedLayoutId || capturedPhotos.length === 0) return null;
    const config = getLayoutConfig(selectedLayoutId);
    const frameToUse = processedFrame || selectedFrame;

    const loadImg = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    // object-cover crop: draw img into dx/dy/dw/dh with cover behaviour
    const drawCover = (
      ctx: CanvasRenderingContext2D,
      img: HTMLImageElement,
      dx: number, dy: number, dw: number, dh: number
    ) => {
      const ir = img.naturalWidth / img.naturalHeight;
      const sr = dw / dh;
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (ir > sr) { sw = sh * sr; sx = (img.naturalWidth - sw) / 2; }
      else         { sh = sw / sr; sy = (img.naturalHeight - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    };

    try {
      const canvas = document.createElement('canvas');
      canvas.width  = config.width;
      canvas.height = config.height;
      const ctx = canvas.getContext('2d')!;

      // 1 — Background
      if (frameToUse) {
        const bg = frameToUse.backgroundConfig;
        if (bg.type === 'solid' && bg.color) {
          ctx.fillStyle = bg.color;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (bg.type === 'gradient' && bg.gradientStops?.length) {
          let grad: CanvasGradient;
          const cx = canvas.width / 2, cy = canvas.height / 2;
          if (bg.gradientType === 'radial') {
            grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(canvas.width, canvas.height) / 2);
          } else {
            const a = ((bg.gradientAngle ?? 135) * Math.PI) / 180;
            const len = Math.sqrt(canvas.width ** 2 + canvas.height ** 2) / 2;
            grad = ctx.createLinearGradient(
              cx - Math.cos(a)*len, cy - Math.sin(a)*len,
              cx + Math.cos(a)*len, cy + Math.sin(a)*len
            );
          }
          bg.gradientStops.forEach(s => grad.addColorStop(s.offset / 100, s.color));
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 2 — Photos
      for (let i = 0; i < config.slots.length; i++) {
        const slot = config.slots[i];
        const photo = capturedPhotos[i];
        if (!photo) continue;
        try {
          const img = await loadImg(photo);
          ctx.save();
          if (selectedFilter?.cssFilter && selectedFilter.cssFilter !== 'none') {
            ctx.filter = selectedFilter.cssFilter;
          }
          ctx.beginPath();
          ctx.rect(slot.x, slot.y, slot.width, slot.height);
          ctx.clip();
          drawCover(ctx, img, slot.x, slot.y, slot.width, slot.height);
          ctx.restore();
        } catch (e) { console.warn(`Slot ${i} draw failed`, e); }
      }

      // 3 — Frame elements
      for (const el of (frameToUse?.elements ?? [])) {
        ctx.save();
        ctx.globalAlpha = el.opacity ?? 1;
        ctx.translate((el.x / 100) * canvas.width, (el.y / 100) * canvas.height);
        ctx.rotate(((el.rotation ?? 0) * Math.PI) / 180);
        if (el.type === 'text') {
          const fs = el.fontSize ?? 40;
          ctx.font = `${el.fontStyle ?? 'normal'} ${el.fontWeight ?? 'normal'} ${fs}px ${el.fontFamily ?? 'sans-serif'}`;
          ctx.fillStyle = el.color ?? '#000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (el.effect === 'shadow') { ctx.shadowColor='rgba(0,0,0,.5)'; ctx.shadowBlur=6; ctx.shadowOffsetX=2; ctx.shadowOffsetY=2; }
          else if (el.effect === 'neon') { ctx.shadowColor=el.color??'#fff'; ctx.shadowBlur=20; }
          if (el.effect === 'outline') { ctx.strokeStyle='#000'; ctx.lineWidth=3; ctx.strokeText(el.content,0,0); }
          ctx.fillText(el.content, 0, 0);
        } else if (el.type === 'sticker') {
          try {
            const img = await loadImg(el.content);
            const w = ((el.width ?? 10) / 100) * canvas.width;
            ctx.drawImage(img, -w/2, -w/2, w, w);
          } catch { /* skip */ }
        }
        ctx.restore();
      }

      return canvas.toDataURL('image/png');
    } catch (err) {
      console.error('Canvas image generation failed', err);
      return null;
    }
  };

  const doAutoUpload = async () => {
      try {
          setUploadStatus('uploading');
          await new Promise(r => setTimeout(r, 100));
          
          const element = document.getElementById('final-preview-container');
          if (element) {
              const imgs = element.getElementsByTagName('img');
              await Promise.all(Array.from(imgs).map(img => {
                  if (img.complete) return Promise.resolve();
                  return new Promise((resolve) => { 
                      img.onload = resolve; 
                      img.onerror = resolve; 
                  });
              }));
          }

          const dataUrl = await generateCompositeImage();
          if (!dataUrl) throw new Error("Generation failed");

          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const formData = new FormData();
          formData.append('file', blob, `${resultTimestamp}.png`);
          formData.append('session_id', resultTimestamp);
          formData.append('layout_id', selectedLayoutId || '');

          const uploadRes = await fetch(UPLOAD_API_URL, { method: 'POST', body: formData });
          if (!uploadRes.ok) throw new Error("Upload failed");

          const serverUrl = `${BASE_RESULT_URL}${resultTimestamp}.png`;
          setUploadStatus('success');
          setFinalUploadedUrl(serverUrl);
      } catch (error) {
          console.error(error);
          setUploadStatus('error');
      }
  };

  useEffect(() => {
      if (step === 'RESULT' && areAssetsReady && !finalUploadedUrl && uploadStatus === 'idle') {
          doAutoUpload();
      }
  }, [step, areAssetsReady, finalUploadedUrl, uploadStatus]);

  const handleDownload = async () => {
      if (!areAssetsReady) {
          alert("Please wait for assets to load fully.");
          return;
      }

      const filename = `unismile-${resultTimestamp}.png`;

      // Jika sudah ada URL dari server, fetch sebagai blob dulu
      // (diperlukan karena download attribute tidak bekerja cross-origin)
      if (finalUploadedUrl) {
          try {
              const resp = await fetch(finalUploadedUrl);
              const blob = await resp.blob();
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = blobUrl;
              link.download = filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
              return;
          } catch (e) {
              console.warn('Blob download gagal, fallback ke generateCompositeImage', e);
          }
      }

      // Fallback: generate ulang dari DOM
      const dataUrl = await generateCompositeImage();
      if (dataUrl) {
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  };

  const handlePrint = async () => {
      if (!areAssetsReady) {
          alert("Wait for assets...");
          return;
      }
      const dataUrl = await generateCompositeImage();
      if (dataUrl) {
          // Hitung dimensi fisik cetak berdasarkan layout
          // Standard photo strip: 2x6 inch. Grid/Polaroid menyesuaikan.
          const layoutPrintSizes: Record<string, { w: string, h: string }> = {
              '1x1': { w: '4in', h: '6in' },    // Polaroid 4x6
              '2x1': { w: '2in', h: '6in' },    // Strip 2x6
              '3x1': { w: '2in', h: '6in' },    // Strip 2x6
              '4x1': { w: '2in', h: '6in' },    // Strip 2x6
              '2x2': { w: '4in', h: '6in' },    // Grid 4x6
              '2x3': { w: '4in', h: '6in' },    // Grid 4x6
              '3x3': { w: '6in', h: '8in' },    // Grid 6x8
          };
          const size = layoutPrintSizes[selectedLayoutId || '4x1'] || { w: '2in', h: '6in' };

          const win = window.open('', '_blank');
          if (win) {
              win.document.write(`
                  <html>
                  <head>
                    <title>UniSmile Photo Print</title>
                    <style>
                      @page {
                        size: ${size.w} ${size.h};
                        margin: 0;
                      }
                      * { margin: 0; padding: 0; box-sizing: border-box; }
                      body {
                        width: ${size.w};
                        height: ${size.h};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: #fff;
                      }
                      img {
                        width: ${size.w};
                        height: ${size.h};
                        object-fit: contain;
                        display: block;
                      }
                    </style>
                  </head>
                  <body>
                    <img src="${dataUrl}" />
                  </body>
                  </html>
              `);
              win.document.close();
              win.focus();
              setTimeout(() => { win.print(); }, 800);
          }
      }
  };

  // --- Rendering Helpers ---
  const PreviewComponent = ({ shadow = true, maxHeightStr = '65vh', id }: { shadow?: boolean, maxHeightStr?: string, id?: string }) => {
    if (!selectedLayoutId || capturedPhotos.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full w-full bg-white/5 rounded-xl p-12 text-center text-white">
                <AlertCircle size={48} className="text-red-400 mb-4" />
                <p className="text-xl font-bold">No Photos Found!</p>
                <p className="text-white/60 text-sm mt-2">If you refreshed the page, please go back and take photos again.</p>
            </div>
        );
    }
    const config = getLayoutConfig(selectedLayoutId);
    const ratio = config.width / config.height;
    
    // IMPORTANT: If we are in RESULT step, we MUST use processedFrame. 
    // If it's not ready, show loader to block the view from html2canvas
    if (step === 'RESULT' && (!processedFrame || !areAssetsReady)) {
        return (
            <div className="flex flex-col items-center justify-center h-full w-full bg-gray-100 rounded-xl p-12 text-center animate-fade-in">
                <Loader2 size={48} className="animate-spin text-indigo-600 mb-4" />
                <p className="text-gray-800 font-bold text-lg">Preparing High-Res Result...</p>
                <p className="text-sm text-gray-500 mb-4">Converting assets to secure format</p>
                
                {/* Fallback Button for Hanging States */}
                <button 
                  onClick={() => setAreAssetsReady(true)}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-full text-xs font-bold text-gray-600 hover:bg-gray-50 shadow-sm"
                >
                  <AlertCircle size={14} /> Skip / Force Render
                </button>
            </div>
        );
    }

    // Use processedFrame if available (safe base64), otherwise fallback to selectedFrame (only for editing steps)
    const frameToRender = processedFrame || selectedFrame;
    
    // -- WYSIWYG SCALING LOGIC --
    // Calculate the scale factor between the actual rendered DOM width and the config width.
    // This allows font sizes (px) to scale perfectly.
    const containerRef = useRef<HTMLDivElement>(null);
    const [scaleFactor, setScaleFactor] = useState(1);
    
    useEffect(() => {
        if (!containerRef.current || !selectedLayoutId) return;
        
        const updateScale = () => {
            const domWidth = containerRef.current?.getBoundingClientRect().width || 0;
            const cfg = getLayoutConfig(selectedLayoutId);
            if (cfg.width > 0 && domWidth > 0) {
                setScaleFactor(domWidth / cfg.width);
            }
        };

        const observer = new ResizeObserver(updateScale);
        observer.observe(containerRef.current);
        
        // Initial call
        updateScale();
        
        return () => observer.disconnect();
    }, [selectedLayoutId, step, isResultPanelCollapsed]);

    let bgStyle: React.CSSProperties = {};
    if (frameToRender) {
         const bg = frameToRender.backgroundConfig;
         if (bg.type === 'solid') bgStyle.backgroundColor = bg.color;
         else if (bg.type === 'gradient') {
             const stops = bg.gradientStops?.map(s => `${s.color} ${s.offset}%`).join(', ');
             bgStyle.background = bg.gradientType === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${bg.gradientAngle}deg, ${stops})`;
         }
    } else { bgStyle.backgroundColor = '#fff'; }

    return (
        <div id={id} ref={containerRef} className={`relative mx-auto bg-white ${shadow ? 'shadow-2xl' : ''}`} style={{ width: '100%', maxWidth: `calc(${maxHeightStr} * ${ratio})` }}>
            <div className="relative w-full" style={{ paddingBottom: `${(1/ratio) * 100}%` }}>
                <div className="absolute inset-0 overflow-hidden" style={bgStyle}>
                    {config.slots.map((slot, i) => {
                        const photo = capturedPhotos[i];
                        if (!photo) return null;
                        return (
                            <div key={i} className="absolute overflow-hidden" style={{ left: `${(slot.x / config.width) * 100}%`, top: `${(slot.y / config.height) * 100}%`, width: `${(slot.width / config.width) * 100}%`, height: `${(slot.height / config.height) * 100}%`, zIndex: 1 }}>
                                {/* Captured photos are already Data URIs from canvas, so no CrossOrigin needed strictly, but adding it for safety doesn't hurt. */}
                                <img src={photo} className="w-full h-full object-cover" style={{ filter: selectedFilter?.cssFilter || 'none' }} />
                            </div>
                        );
                    })}
                    {frameToRender?.elements?.map(el => {
                        const widthVal = el.width && !isNaN(Number(el.width)) && Number(el.width) > 0 ? Number(el.width) : 20;
                        
                        // Scale text properties
                        const fontSize = (el.fontSize || 40) * scaleFactor;
                        // Scale stroke/shadows roughly as well
                        const strokeWidth = 2 * scaleFactor; 
                        
                        return (
                            <div key={el.id} style={{
                                    position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
                                    zIndex: el.zIndex + 10, opacity: el.opacity, color: el.color, fontFamily: el.fontFamily,
                                    fontSize: `${Math.max(1, fontSize)}px`, 
                                    fontWeight: el.fontWeight, fontStyle: el.fontStyle, textDecoration: el.textDecoration,
                                    textShadow: el.effect === 'shadow' ? '1px 1px 2px rgba(0,0,0,0.5)' : el.effect === 'neon' ? `0 0 5px ${el.color}, 0 0 10px ${el.color}` : 'none',
                                    WebkitTextStroke: el.effect === 'outline' ? `${strokeWidth}px black` : 'none', 
                                    whiteSpace: 'nowrap', 
                                    // Use max-content to prevent text stacking/wrapping during render
                                    width: el.type === 'text' ? 'max-content' : `${widthVal}%`, 
                                    // Explicit letter spacing to prevent overlap calculation errors in html2canvas
                                    letterSpacing: '0px',
                                    lineHeight: '1',
                                }}>
                                {el.type === 'text' ? el.content : (
                                    <img 
                                      src={el.content} 
                                      style={{ width: '100%', height: 'auto', display: 'block' }} 
                                      // Added referrerPolicy="no-referrer" to prevent hotlink 403s when rendering failed/raw URLs
                                      referrerPolicy="no-referrer"
                                      // Removed crossOrigin="anonymous" to ensure visual loading in standard DOM when CORS is missing
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
  };

  const isAirTouch = uiMode === 'air-touch';
  const isVertical = monitorOrientation === 'vertical'; // portrait monitor mode

  return (
    <>
      {/* ── Air Gesture Cursor ── */}
      <AirCursor />

      {/* --- Error Banner --- */}
      {cameraError && (
        <div id="camera-error-banner" className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-2xl max-w-lg w-[90%] flex items-center gap-4 animate-fade-in-up">
            <div className="bg-red-100 p-2 rounded-full"><AlertTriangle className="text-red-600" size={24} /></div>
            <div className="flex-1">
                <h3 className="font-bold text-red-800">Camera Access Error</h3>
                <p id="camera-error-message" className="text-sm text-red-700">{cameraError}</p>
            </div>
            <button 
                onClick={retryCamera} 
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-sm transition-colors"
            >
                Retry
            </button>
        </div>
      )}

      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      <div 
        id="calibration-overlay" 
        className="fixed inset-0 z-50 items-center justify-center bg-black/90 p-4 animate-fade-in"
        style={{ display: isCalibrating ? 'flex' : 'none' }}
      >
          <div className="w-full h-full max-w-6xl flex flex-col relative">
              <div className="flex justify-between items-center mb-4 text-white">
                  <h2 className="text-3xl font-bold flex items-center gap-3"><Scan size={32} className="text-green-400" /> Hand Calibration</h2>
                  <button id="btn-close-calibration" onClick={() => setIsCalibrating(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full"><X size={32} /></button>
              </div>
              <div className="flex-1 relative border-4 border-white/20 rounded-3xl overflow-hidden bg-black pointer-events-none">
                   <canvas id="calibration-canvas" ref={processingCanvasRef} className="w-full h-full object-contain transform scale-x-[-1]" />
                   <div className="absolute top-4 left-4 bg-black/60 p-4 rounded-xl text-white max-w-sm pointer-events-none">
                       <p className="text-lg font-semibold text-green-400 mb-2">Instructions:</p>
                       <ul className="list-disc pl-5 space-y-2 text-sm opacity-90">
                           <li>Keep your hand inside the <span className="text-green-400 font-bold">GREEN BOX</span> to move the cursor.</li>
                           <li><b>Pinch & Hold</b> to Drag. <b>Tap</b> to Click.</li>
                       </ul>
                   </div>
              </div>
              <div className="mt-6 flex items-center justify-between gap-8 bg-white/10 p-6 rounded-2xl backdrop-blur-md">
                  <div className="flex-1">
                      <label className="text-white font-bold mb-2 block uppercase text-sm tracking-wider">Sensitivity</label>
                      <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map(level => (
                              <button id={`btn-sensitivity-level-${level}`} key={level} onClick={() => adjustSensitivity(level)} className={`flex-1 py-4 rounded-xl font-bold text-xl transition-all ${(Math.abs(calibrationBox.minX - (0.1 + ((level - 1) / 4) * 0.25)) < 0.01) ? 'bg-green-500 text-white shadow-lg' : 'bg-white/20 text-white'}`}>{level}</button>
                          ))}
                      </div>
                  </div>
                  <button id="btn-done-calibration" onClick={() => setIsCalibrating(false)} className="px-10 py-6 bg-white text-black font-extrabold text-2xl rounded-2xl hover:scale-105 transition-transform shadow-xl flex items-center gap-3"><Check size={32} className="text-green-600" /> Done</button>
              </div>
          </div>
      </div>

      {step === 'LANDING' && (
        <>
          <div className="h-full w-full bg-[#0c1633] flex flex-col items-center justify-center relative overflow-hidden text-white p-4 select-none">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                 <div className="absolute top-[10%] left-[10%] w-48 h-48 bg-orange-400/40 rounded-full blur-[60px] float-anim"></div>
                 <div className="absolute bottom-[10%] right-[10%] w-64 h-64 bg-slate-400/40 rounded-full blur-[60px] float-anim"></div>
            </div>
            <div className="z-10 text-center animate-fade-in-up flex flex-col items-center">
              <div className="relative mt-8 md:mt-12 pointer-events-none w-full flex justify-center">
                <img src="/assets/title.png" alt="UniSmile Photo Title" className="w-[85vw] max-w-[1200px] h-auto drop-shadow-2xl transform hover:scale-105 transition-transform duration-500" />
                {customSubtitle && <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-white/20 backdrop-blur-md px-6 py-2 rounded-full border border-white/30 font-bold text-2xl md:text-3xl whitespace-nowrap shadow-xl">x {customSubtitle}</div>}
              </div>
              <div className="-mt-16 md:-mt-32 z-20 relative">
                <button onClick={handleStart} className="group relative active:scale-95 transition-all hover:scale-[1.03]">
                  <img src="/assets/start.png" alt="Start Photo" className={`h-auto drop-shadow-xl ${isAirTouch ? 'w-[450px] md:w-[550px]' : 'w-[350px] md:w-[450px]'}`} />
                </button>
              </div>
              
              {/* Branding Logos */}
              <div className="mt-8 pb-8 flex items-center justify-center gap-10 opacity-90 overflow-hidden px-4">
                  <img src="/assets/LOGO UNI INSIDE.png" alt="Uni Inside" className="h-12 md:h-16 object-contain" />
                  <img src="/assets/LOGO KOLAB.png" alt="Kolab" className="h-12 md:h-16 object-contain" />
                  <img src="/assets/LOGO UNI SMILE.png" alt="Uni Smile" className="h-12 md:h-16 rounded-xl object-contain" />
              </div>
            </div>
            <div className="absolute top-8 right-8 flex gap-4 z-50">
               <button id="btn-toggle-cursor-lock-landing" onClick={() => setIsCursorLocked(!isCursorLocked)} className={`rounded-full backdrop-blur-sm transition-colors border-2 ${isAirTouch ? 'p-6' : 'p-4'} ${isCursorLocked ? 'bg-red-500/20 border-red-400 text-white' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'}`} style={{ display: isAirTouch ? 'block' : 'none' }}>{isCursorLocked ? <Lock size={isAirTouch?40:32}/> : <Unlock size={isAirTouch?40:32}/>}</button>
               <button id="btn-calibrate-landing" onClick={() => setIsCalibrating(true)} className={`${isAirTouch ? 'p-6' : 'p-4'} rounded-full backdrop-blur-sm transition-colors bg-white/10 text-white/70 hover:bg-white/20 border-2 border-white/20`} style={{ display: isAirTouch ? 'block' : 'none' }}><Scan size={isAirTouch?40:40} /></button>
               <button id="btn-admin-settings-landing" onClick={onAdminClick} className={`text-white/70 hover:text-white transition-colors bg-white/10 ${isAirTouch ? 'p-6' : 'p-4'} rounded-full hover:bg-white/20 backdrop-blur-sm border-2 border-white/20`}><Settings size={isAirTouch?40:40} /></button>
            </div>
            <div id="gesture-status-banner" className="absolute top-8 left-1/2 -translate-x-1/2 text-white/80 bg-black/30 px-6 py-2 rounded-full backdrop-blur text-lg pointer-events-none text-center whitespace-nowrap" style={{ display: gestureEnabled ? 'block' : 'none' }}>
                {isCursorLocked
                  ? "🔒 Cursor Locked"
                  : "✌ Pinch geser  ·  ✋ Tahan buka tangan = klik (3 detik)"}
            </div>
          </div>
        </>
      )}

      {step === 'LAYOUT' && (
        <BoothWrapper title="Choose Layout" subtitle="Tap to select your format" onAdminClick={onAdminClick} isLocked={isCursorLocked} onToggleLock={() => setIsCursorLocked(!isCursorLocked)} uiMode={uiMode} onBack={() => setStep('LANDING')} isVertical={isVertical}>
            <div className={`h-full flex flex-col ${isVertical ? 'p-4' : isAirTouch ? 'p-10' : 'p-6 md:p-10'}`}>
                <div className="flex-1 overflow-y-auto flex items-center justify-center">
                    <div className={`flex flex-wrap justify-center items-center w-full mx-auto ${isVertical ? 'gap-3 max-w-xs pt-2 pb-4' : isAirTouch ? 'gap-10 md:gap-14 max-w-4xl' : 'gap-5 md:gap-8 max-w-4xl lg:max-w-5xl pb-6'}`}>
                        {[{id: '1x1', label: 'Polaroid', count: 1}, {id: '2x1', label: 'Strip (2)', count: 2}, {id: '3x1', label: 'Strip (3)', count: 3}, {id: '4x1', label: 'Strip (4)', count: 4}, {id: '2x2', label: 'Grid (4)', count: 4}, {id: '2x3', label: 'Grid (6)', count: 6}, {id: '3x3', label: 'Grid (9)', count: 9}]
                        .filter(layout => frames.find(f => f.id === layout.id)?.enabled)
                        .map((layout) => (
                            <button 
                              key={layout.id} 
                              onClick={() => handleLayoutSelect(layout.id as GridLayoutId)} 
                              className={`group relative aspect-[4/5] bg-white/10 backdrop-blur-md rounded-2xl border-2 border-white/20 hover:bg-white/20 hover:border-pink-400 hover:scale-105 transition-all flex flex-col items-center justify-center shrink-0
                              ${isVertical 
                                ? 'w-[calc(50%-0.375rem)] gap-2 p-3 shadow-lg' 
                                : isAirTouch 
                                  ? 'w-[calc(50%-1.25rem)] md:w-[calc(25%-2.625rem)] gap-6 p-6 shadow-2xl rounded-3xl' 
                                  : 'w-[calc(50%-0.625rem)] md:w-[calc(25%-1.5rem)] gap-4 p-5 shadow-xl rounded-3xl'}`}
                            >
                                 <div className={`grid gap-1 w-full h-full rounded-xl ${isVertical ? 'p-2' : 'p-3 gap-2'} ${layout.id === '1x1' ? 'grid-cols-1 grid-rows-1' : layout.id === '2x1' ? 'grid-cols-1 grid-rows-2' : layout.id === '3x1' ? 'grid-cols-1 grid-rows-3' : layout.id === '4x1' ? 'grid-cols-1 grid-rows-4' : layout.id === '2x2' ? 'grid-cols-2 grid-rows-2' : layout.id === '2x3' ? 'grid-cols-2 grid-rows-3' : 'grid-cols-3 grid-rows-3'}`}>{Array.from({length: layout.count}).map((_, i) => (<div key={i} className="bg-white/40 rounded-sm group-hover:bg-pink-300/60 transition-colors"></div>))}</div>
                                <span className={`font-bold tracking-wide ${isVertical ? 'text-sm' : isAirTouch ? 'text-2xl md:text-3xl' : 'text-base md:text-xl'}`}>{layout.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </BoothWrapper>
      )}

      {step === 'PAYMENT' && (
        <BoothWrapper uiMode={uiMode} isLocked={isCursorLocked} onToggleLock={() => setIsCursorLocked(!isCursorLocked)} hideHeader customBg="bg-[#0c1633]" isVertical={isVertical}>
             <div className="h-full w-full bg-[#0c1633] flex flex-col items-center justify-center relative overflow-hidden p-6">
                
                <div className="z-10 w-full max-w-7xl flex flex-col items-center">
                    {/* Main Content Area */}
                    <div className="flex flex-row items-center justify-center gap-12 lg:gap-20 w-full mt-2 lg:-mt-24">
                        {/* E-Wallet Column */}
                        <div className="hidden lg:flex flex-col items-center animate-fade-in-left">
                            <img src="/assets/QRISEWALLET.png" alt="E-Wallet Partners" className="w-[400px] h-auto object-contain" />
                        </div>

                        {/* Main Payment Section */}
                        <div className="flex flex-col items-center shrink-0">
                            {/* Title Section */}
                            <div className="text-center mb-2 md:mb-4 lg:-mb-10 animate-fade-in flex flex-col items-center z-0 pointer-events-none">
                                <img src="/assets/PAYWITHQR.png" alt="Pay With QR" className="h-32 md:h-48 lg:h-64 object-contain drop-shadow-md" />
                            </div>

                            {/* Main Payment Card */}
                            <div className="flex flex-col items-center w-full max-w-[260px] md:max-w-[320px]">
                                <div className="w-full bg-white flex flex-col items-center justify-center p-4 md:p-5 shadow-2xl rounded-2xl animate-scale-in relative">
                                    <div className="flex justify-between items-center w-full mb-3 px-2">
                                        <span className="font-bold text-gray-800 text-lg md:text-xl tracking-wide">QRIS</span>
                                        <span className="text-[#00aead] font-black text-lg md:text-xl">
                                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(frames.find(f => f.id === selectedLayoutId)?.price || 45000)}
                                        </span>
                                    </div>
                                    <div className="flex-1 flex items-center justify-center w-full">
                                        <img src="/assets/QRUNI.jpeg" alt="QRIS Uni" className="w-full h-auto max-h-[45vh] lg:max-h-[50vh] object-contain rounded-xl" />
                                    </div>
                                </div>
                                
                                {/* Check Status Button Outside the Square */}
                                <button onClick={handlePaymentConfirm} className="mt-4 md:mt-6 w-full bg-[#f6cd46] hover:bg-[#e5bc35] text-black py-3 md:py-4 rounded-xl text-lg md:text-xl font-bold shadow-[0_10px_20px_rgba(246,205,70,0.3)] transition-all active:scale-95">
                                    Check Status
                                </button>
                            </div>
                        </div>

                        {/* Bank Column */}
                        <div className="hidden lg:flex flex-col items-center animate-fade-in-right">
                            <img src="/assets/QRISBANK.png" alt="Bank Partners" className="w-[460px] h-auto object-contain" />
                        </div>
                    </div>


                </div>

                {/* Back Button */}
                 <div className="absolute top-6 left-6 z-50">
                     <button onClick={() => setStep('LAYOUT')} className="active:scale-95 hover:scale-110 transition-all outline-none">
                         <img src="/assets/BACK.png" alt="Back" className="h-20 md:h-24 object-contain drop-shadow-md" />
                     </button>
                 </div>
             </div>
        </BoothWrapper>
      )}

      {step === 'CAPTURE' && (
        <div className="h-full w-full bg-black relative overflow-hidden flex flex-col">
            <div className={`fixed inset-0 bg-white z-[100] pointer-events-none transition-opacity duration-[150ms] ${flash ? 'opacity-100' : 'opacity-0'}`} />
            <div className="relative flex-1 w-full bg-black overflow-hidden">
                <canvas id="camera-preview" ref={processingCanvasRef} className="w-full h-full object-cover transform scale-x-[-1]" />
                {countdown !== null && <div id="countdown-display" className="absolute inset-0 flex items-center justify-center z-30"><span className="text-[20rem] font-bold text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] animate-bounce font-display">{countdown}</span></div>}
                {isProcessing && <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-40"><div className="text-center"><RefreshCw size={80} className="animate-spin text-white mb-6 mx-auto" /><h2 className="text-4xl font-bold text-white">Processing...</h2></div></div>}
                <div className={`absolute right-8 z-20 flex flex-col gap-4 ${isAirTouch ? 'top-12' : 'top-8'}`}>
                        <button id="btn-switch-camera" onClick={toggleCamera} className={`${isAirTouch ? 'w-24 h-24' : 'w-20 h-20'} rounded-full bg-black/40 backdrop-blur-md border-2 border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-95`}><SwitchCamera size={isAirTouch?48:40} /></button>
                        <button id="btn-toggle-cursor-lock-capture" onClick={() => setIsCursorLocked(!isCursorLocked)} className={`${isAirTouch ? 'w-24 h-24' : 'w-20 h-20'} rounded-full backdrop-blur-md border-2 flex items-center justify-center transition-all active:scale-95 ${isCursorLocked ? 'bg-red-500/80 border-red-400 text-white' : 'bg-black/40 border-white/20 text-white/70 hover:bg-white/20'}`} style={{ display: isAirTouch ? 'block' : 'none' }}>{isCursorLocked ? <Lock size={isAirTouch?40:32}/> : <Unlock size={isAirTouch?40:32}/>}</button>
                </div>
            </div>
            {/* Bottom controls bar — compact in vertical */}
            <div className={`bg-[#0c1633]/90 backdrop-blur-xl border-t border-white/10 flex flex-col justify-center relative z-50 px-3 md:px-8 ${isVertical ? 'h-[14vh] min-h-[100px]' : 'h-[18vh] md:h-[20vh]'}`}>
                <div className="flex justify-between items-center h-full gap-2">
                    {/* Thumbnails */}
                    <div className={`flex gap-1.5 overflow-x-auto items-center h-full ${isVertical ? 'py-1.5' : 'py-2 gap-2'}`}>
                        {Array.from({length: (selectedLayoutId ? getLayoutConfig(selectedLayoutId).slots.length : 0)}).map((_, i) => (
                            <div key={i} className={`flex-shrink-0 rounded-lg border-2 flex items-center justify-center overflow-hidden bg-white/5 ${capturedPhotos[i] ? 'border-green-400' : 'border-white/20'} ${isVertical ? 'w-10 h-14' : 'w-16 h-24 md:w-24 md:h-32'}`}>
                                {capturedPhotos[i] ? <img src={capturedPhotos[i]} className="w-full h-full object-cover" /> : <span className={`text-white/30 font-bold ${isVertical ? 'text-sm' : 'text-lg'}`}>{i + 1}</span>}
                            </div>
                        ))}
                    </div>
                    {/* Center: Start button */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
                        {!isAutoCapturing && capturedPhotos.length === 0 && (
                          <>
                            <button id="btn-start-capture" onClick={startAutoCapture} className={`active:scale-95 transition-transform hover:scale-105 ${isAirTouch ? 'w-[200px] md:w-[250px]' : isVertical ? 'w-[90px]' : 'w-[150px] md:w-[200px]'}`}>
                              <img src="/assets/start photo.png" alt="Start Photo" className="w-full h-auto drop-shadow-xl animate-pulse" />
                            </button>
                            <div 
                              id="gesture-capture-hold-container" 
                              className="flex flex-col items-center pointer-events-none"
                              style={{ display: (gestureEnabled && gestureState.gesture === 'open_hand' && captureHoldProgress > 0) ? 'flex' : 'none' }}
                            >
                              <svg id="gesture-capture-hold-svg" width="48" height="48" viewBox="0 0 64 64">
                                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(246,205,70,0.2)" strokeWidth="5" />
                                <circle cx="32" cy="32" r="28" fill="none" stroke={captureHoldProgress >= 1 ? '#fff' : '#f6cd46'} strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 28} strokeDashoffset={2 * Math.PI * 28 * (1 - captureHoldProgress)} style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.1s linear' }} />
                              </svg>
                              <span id="gesture-capture-hold-text" className="text-xs text-yellow-300 font-bold">Tahan ✋ untuk mulai</span>
                            </div>
                          </>
                        )}
                        {isAutoCapturing && <div id="rec-indicator" className={`rounded-full border-4 border-red-500/50 bg-black/50 backdrop-blur flex items-center justify-center animate-pulse ${isVertical ? 'w-12 h-12' : 'w-16 h-16'}`}><span className={`text-red-500 font-bold ${isVertical ? 'text-xs' : 'text-sm'}`}>REC</span></div>}
                    </div>
                    {/* Right: count + retake */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div id="photo-counter" className={`text-white/70 font-mono ${isVertical ? 'text-xs' : 'text-sm'}`}>{capturedPhotos.length}/{selectedLayoutId ? getLayoutConfig(selectedLayoutId).slots.length : 0}</div>
                        {!isAutoCapturing && capturedPhotos.length > 0 && <button onClick={handleRetake} className={`bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/20 font-bold active:scale-95 ${isAirTouch ? 'px-6 py-4 text-lg' : isVertical ? 'px-3 py-1.5 text-xs' : 'px-8 py-4 text-xl'}`}>Retake</button>}
                    </div>
                </div>
            </div>
        </div>
      )}
      {step === 'EDIT' && (
        <BoothWrapper title="Customize Your Photo" subtitle="Pick a frame and filter" hideAdmin isLocked={isCursorLocked} onToggleLock={() => setIsCursorLocked(!isCursorLocked)} uiMode={uiMode} hideLogos isVertical={isVertical}>
            {/* VERTICAL: stack preview top + controls bottom. HORIZONTAL: side by side */}
            <div className={`h-full flex ${isVertical ? 'flex-col' : 'flex-row'} overflow-hidden bg-[#0a1128] relative text-white`}>
                {/* Preview area – top in vertical, left in horizontal */}
                <div className={`flex flex-col items-center justify-center overflow-hidden relative ${isVertical ? 'h-[38%] shrink-0 p-2 pt-3' : 'flex-1 p-12'}`}>
                    <div className="w-full h-full flex items-center justify-center drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                        <PreviewComponent maxHeightStr={isVertical ? '35vh' : '60vh'} />
                    </div>
                    {!isVertical && (
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-max flex items-center justify-center gap-12 opacity-100 pointer-events-none">
                          <img src="/assets/LOGO UNI INSIDE.png" alt="Uni Inside" className="h-12 md:h-16 object-contain" />
                          <img src="/assets/LOGO KOLAB.png" alt="Kolab" className="h-12 md:h-16 object-contain" />
                          <img src="/assets/LOGO UNI SMILE.png" alt="Uni Smile" className="h-12 md:h-16 rounded-xl object-contain" />
                      </div>
                    )}
                </div>

                {/* Controls – bottom in vertical, right in horizontal */}
                <div className={`bg-[#0c1633] border-white/10 flex flex-col z-20 shadow-[-10px_0_40px_rgba(0,0,0,0.3)] overflow-hidden ${isVertical ? 'flex-1 border-t min-h-0' : 'w-[450px] border-l'}`}>
                    {/* Tabs */}
                    <div className={`grid grid-cols-2 shrink-0 border-b border-white/5 ${isVertical ? 'gap-1.5 p-2' : 'gap-2 p-3'}`}>
                        <button 
                            onClick={() => setEditTab('FRAMES')} 
                            className={`rounded-lg font-bold uppercase tracking-tight transition-all ${isVertical ? 'py-1.5 text-[10px]' : 'py-2 text-xs'} ${editTab === 'FRAMES' ? 'bg-[#f6cd46] text-black shadow-[0_0_15px_rgba(246,205,70,0.3)]' : 'bg-[#1b2b5a] text-white/60 hover:text-white'}`}
                        >
                            1. Pilih Frame
                        </button>
                        <button 
                            onClick={() => setEditTab('FILTERS')} 
                            className={`rounded-lg font-bold uppercase tracking-tight transition-all ${isVertical ? 'py-1.5 text-[10px]' : 'py-2 text-xs'} ${editTab === 'FILTERS' ? 'bg-[#f6cd46] text-black shadow-[0_0_15px_rgba(246,205,70,0.3)]' : 'bg-[#1b2b5a] text-white/60 hover:text-white'}`}
                        >
                            2. Pilih Filter
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className={`flex-1 overflow-y-auto min-h-0 custom-scrollbar ${isVertical ? 'p-1.5' : 'p-4'}`}>
                        {editTab === 'FRAMES' ? (
                            <div className={`grid px-1 ${isVertical ? 'grid-cols-4 gap-1.5' : 'grid-cols-2 gap-3'}`}>
                                {(!selectedLayoutId || frames.find(f => f.id === selectedLayoutId)?.styles.length === 0) && (
                                    <p className="col-span-4 text-white/40 italic p-4 text-center text-sm">No frames available for this layout.</p>
                                )}
                                {frames.find(f => f.id === selectedLayoutId)?.styles.map(style => (
                                    <button 
                                        key={style.id} 
                                        onClick={() => setSelectedFrame(style)} 
                                        className={`group relative aspect-[3/4] rounded-lg overflow-hidden transition-all transform active:scale-95 ${selectedFrame?.id === style.id ? 'ring-2 ring-[#f6cd46] ring-offset-2 ring-offset-[#0c1633] scale-[0.98]' : 'hover:scale-[1.02] opacity-80 hover:opacity-100 ring-1 ring-white/10'}`}
                                    >
                                        <div className="absolute inset-0 bg-white"><FrameThumbnail style={style} layoutId={selectedLayoutId || '1x1'} /></div>
                                        {selectedFrame?.id === style.id && (
                                            <div className="absolute top-1 right-1 bg-[#f6cd46] text-black p-0.5 rounded-full shadow-lg">
                                                <Check size={10} strokeWidth={4} />
                                            </div>
                                        )}
                                        <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/80 to-transparent">
                                            <span className="text-white text-[9px] font-bold truncate block">{style.name}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className={`grid px-1 ${isVertical ? 'grid-cols-4 gap-1.5' : 'grid-cols-2 gap-3'}`}>
                                {filters.map(f => (
                                    <button 
                                        key={f.id} 
                                        onClick={() => setSelectedFilter(f)} 
                                        className={`group relative aspect-video rounded-lg overflow-hidden transition-all transform active:scale-95 ${selectedFilter?.id === f.id ? 'ring-2 ring-[#f6cd46] ring-offset-2 ring-offset-[#0c1633] scale-[0.98]' : 'hover:scale-[1.02] opacity-80 hover:opacity-100 ring-1 ring-white/10'}`}
                                    >
                                        <img src={capturedPhotos[0]} className="w-full h-full object-cover" style={{ filter: f.cssFilter }} />
                                        {selectedFilter?.id === f.id && (
                                            <div className="absolute top-1 right-1 bg-[#f6cd46] text-black p-0.5 rounded-full shadow-lg">
                                                <Check size={10} strokeWidth={4} />
                                            </div>
                                        )}
                                        <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/80 to-transparent text-center">
                                            <span className="text-white text-[9px] font-black uppercase tracking-widest">{f.name}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Bottom Actions */}
                    <div className={`shrink-0 border-t border-white/5 ${isVertical ? 'p-2 space-y-1.5' : 'p-3 space-y-2'}`}>
                        <button 
                            onClick={handleFinish} 
                            className={`w-full bg-white hover:bg-gray-100 text-[#0c1633] rounded-xl font-bold uppercase tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg ${isVertical ? 'py-1.5 text-xs' : 'py-2.5 text-sm'}`}
                        >
                            CETAK & SELESAI
                        </button>
                        <button 
                            onClick={handleRetake} 
                            className={`w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl font-bold uppercase tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 ${isVertical ? 'py-1.5 text-xs' : 'py-2.5 text-sm'}`}
                        >
                            <RefreshCw size={isVertical ? 12 : 14} /> Retake Photos
                        </button>
                    </div>
                </div>
            </div>
        </BoothWrapper>
      )}

      {step === 'RESULT' && (
        <BoothWrapper title="Your Photos" subtitle="Ready to share!" onAdminClick={onAdminClick} isLocked={isCursorLocked} onToggleLock={() => setIsCursorLocked(!isCursorLocked)} uiMode={uiMode} hideLogos isVertical={isVertical}>
            {/* VERTICAL: stack QR top + preview bottom. HORIZONTAL: panel left + preview right */}
            <div className={`h-full flex ${isVertical ? 'flex-col' : 'flex-row'} overflow-hidden bg-[#0a1128] relative text-white`}>
                 {/* QR / info panel – left in horizontal, top in vertical */}
                 <div className={`flex bg-[#0c1633] border-white/10 z-20 shrink-0 ${
                   isVertical
                     ? 'w-full border-b flex-row items-center gap-3 px-3 py-2.5' 
                     : 'w-full lg:w-[450px] xl:w-[500px] h-full border-r flex-col items-center justify-center p-8 lg:p-12 overflow-y-auto custom-scrollbar'
                 }`} style={isVertical ? { height: '36%' } : {}}>
                     {/* QR Code block */}
                     <div className={`bg-[#1b2b5a] rounded-3xl flex flex-col items-center justify-center border-4 transition-colors shrink-0 ${
                       finalUploadedUrl ? 'border-green-400' : 'border-dashed border-white/20'
                     } ${isVertical ? 'h-full aspect-square p-1.5' : 'w-full max-w-[360px] p-8 mb-6 shadow-[0_10px_40px_rgba(0,0,0,0.5)]'}`}>
                         {finalUploadedUrl ? (
                             <>
                                 <div className={`bg-white rounded-2xl shadow-xl animate-fade-in ${isVertical ? 'p-2 mb-1' : 'p-5 mb-5'}`}>
                                     <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(finalUploadedUrl)}`} alt="QR Code" className={isVertical ? 'w-[80px] h-[80px]' : 'w-[220px] h-[220px]'} />
                                 </div>
                                 <span className={`font-black text-green-400 ${isVertical ? 'text-[10px]' : 'text-2xl mb-1 tracking-tight'}`}>Scan to Download</span>
                                 {!isVertical && <span className="text-base font-medium text-white/50">Valid for 24 hours</span>}
                             </>
                         ) : (
                             <div className="flex flex-col items-center text-white/40 text-center">
                                 {uploadStatus === 'uploading' ? (
                                     <>
                                         <Loader2 size={isVertical ? 32 : 80} className="opacity-50 animate-spin" />
                                         <span className={`font-bold ${isVertical ? 'text-xs mt-1' : 'text-lg mt-4 mb-4'}`}>Generating QR...</span>
                                     </>
                                 ) : (
                                     <>
                                         <QrCode size={isVertical ? 32 : 80} className="opacity-50" />
                                         <span className={`px-2 leading-relaxed ${isVertical ? 'text-[9px] mt-1' : 'text-sm mt-4 px-4'}`}>Please wait while we{isVertical ? ' ' : <br/>}generate your QR Code.</span>
                                     </>
                                 )}
                             </div>
                         )}
                     </div>
                     {/* Info + Buttons — right column in vertical, below QR in horizontal */}
                     <div className={`flex flex-col ${isVertical ? 'flex-1 justify-center gap-1.5 min-w-0' : 'w-full max-w-[360px] mt-2 gap-3'}`}>
                         {!isVertical && (
                           <>
                             <h2 className="text-2xl font-black text-center">Thank you!</h2>
                             <p className="text-white/60 text-center text-xs mb-2">Scan QR to download your photo</p>
                           </>
                         )}
                         {isVertical && finalUploadedUrl && (
                           <p className="text-green-400 font-bold text-[11px] text-center">Scan to Download</p>
                         )}
                         <button
                             onClick={handleDownload}
                             disabled={uploadStatus === 'uploading' || !areAssetsReady}
                             className={`w-full px-3 bg-[#f6cd46] hover:bg-[#e5bc35] text-black rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 ${isVertical ? 'py-2 text-xs' : 'py-4'}`}
                         >
                             {uploadStatus === 'uploading' || !areAssetsReady ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                             Download
                         </button>
                         <button onClick={handleRetake} className={`w-full px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 border border-white/20 active:scale-95 ${isVertical ? 'py-2 text-xs' : 'py-3'}`}>
                             <RefreshCw size={14} /> New Photo
                         </button>
                         <button onClick={handleHome} className={`w-full px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all flex items-center justify-center border border-white/20 active:scale-95 ${isVertical ? 'py-2 text-xs' : 'py-3'}`}>
                             Home
                         </button>
                     </div>
                 </div>

                 {/* Preview & actions panel – right in horizontal, bottom in vertical */}
                 <div className={`flex-1 flex flex-col items-center overflow-hidden relative ${isVertical ? 'justify-between py-3 px-4' : 'justify-center p-6 h-full'}`}>
                    {/* Preview Image */}
                    <div className={`w-full flex items-center justify-center drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${isVertical ? 'flex-1 min-h-0' : 'h-full max-h-[55vh] mt-4'}`}>
                        <PreviewComponent maxHeightStr={isVertical ? '40vh' : '55vh'} shadow={true} id="final-preview-container" />
                    </div>

                    {/* Action Buttons */}
                    <div className={`flex flex-wrap items-center justify-center gap-3 z-20 relative shrink-0 ${isVertical ? 'mt-2 pb-1' : 'mt-8'}`}>
                        <button 
                            id="btn-email"
                            onClick={() => {
                                const emailForm = document.getElementById('email-form-container');
                                if (emailForm) {
                                    emailForm.classList.toggle('hidden');
                                    emailForm.classList.toggle('flex');
                                }
                            }}
                            className={`flex items-center gap-2 bg-[#f6cd46] hover:bg-[#e5bc35] text-black rounded-full shadow-[0_10px_20px_rgba(246,205,70,0.3)] transition-all active:scale-95 italic font-serif ${isVertical ? 'px-8 py-2.5 text-base' : 'px-12 py-4 text-xl'}`}
                        >
                            Send Email
                        </button>
                    </div>

                    {/* Email Form Popover */}
                    <div id="email-form-container" className={`hidden absolute left-1/2 -translate-x-1/2 bg-[#1b2b5a] rounded-2xl border border-white/10 shadow-2xl animate-fade-in z-30 flex-col gap-3 ${isVertical ? 'bottom-16 p-4 w-[300px]' : 'bottom-28 p-6 w-[400px]'}`}>
                        {/* Form — selalu ada di DOM, disembunyikan saat sudah terkirim */}
                        <form onSubmit={handleSendEmail} className="flex flex-col gap-3" style={{ display: isSent ? 'none' : 'flex' }}>
                            <h3 className={`text-white font-bold ${isVertical ? 'text-sm' : 'text-lg'}`}>Send via Email</h3>
                            <input 
                              id="input-email"
                              type="email" 
                              placeholder="Enter your email address" 
                              value={email} 
                              onChange={(e) => { setEmail(e.target.value); setEmailError(null); }} 
                              className={`w-full bg-[#0a1128] border rounded-xl px-4 text-white focus:outline-none transition-colors ${emailError ? 'border-red-400 focus:border-red-400' : 'border-white/20 focus:border-[#f6cd46]'} ${isVertical ? 'py-2 text-sm' : 'py-3'}`} 
                            />
                            <div 
                              id="notif-error"
                              className="flex items-start gap-2 bg-red-500/15 border border-red-500/30 rounded-xl px-3 py-2"
                              style={{ display: emailError ? 'flex' : 'none' }}
                            >
                              <span className="text-red-400 text-xs leading-relaxed">{emailError || ''}</span>
                            </div>
                            <button id="btn-send-email" type="submit" disabled={isSending} className={`w-full bg-[#f6cd46] text-black rounded-xl font-bold hover:bg-[#e5bc35] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${isVertical ? 'py-2 text-sm' : 'py-3'}`}>
                                {isSending ? (
                                  <><Loader2 size={16} className="animate-spin" /> Mengirim...</>
                                ) : (
                                  <>Send <Send size={16} /></>
                                )}
                            </button>
                        </form>
                        {/* Notif Success — selalu ada di DOM, ditampilkan saat berhasil terkirim */}
                        <div 
                          id="notif-success" 
                          className="bg-green-500/20 border border-green-500/50 text-green-400 rounded-xl p-4 text-center font-bold flex items-center justify-center gap-2"
                          style={{ display: isSent ? 'flex' : 'none' }}
                        >
                            <Check size={24} /> Email Terkirim!
                        </div>
                    </div>

                    {/* Branding Logos */}
                    {!isVertical && (
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-max flex items-center justify-center gap-12 opacity-80 pointer-events-none">
                          <img src="/assets/LOGO UNI INSIDE.png" alt="Uni Inside" className="h-12 md:h-16 object-contain" />
                          <img src="/assets/LOGO KOLAB.png" alt="Kolab" className="h-12 md:h-16 object-contain" />
                          <img src="/assets/LOGO UNI SMILE.png" alt="Uni Smile" className="h-12 md:h-16 rounded-xl object-contain" />
                      </div>
                    )}
                 </div>
            </div>
        </BoothWrapper>
      )}
    </>
  );
}