import React, { useState, useEffect } from 'react';
import { getAppConfig, syncFromDatabase } from './services/storageService';
import { KioskSettings } from './components/KioskSettings';
import { PhotoBooth } from './components/PhotoBooth';
import { 
  Settings, 
  LogOut, 
  Lock, 
  X,
  RefreshCw
} from 'lucide-react';

enum View {
  BOOTH = 'BOOTH',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD'
}

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.BOOTH);
  
  // Login Modal State
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Sync State
  const [isInitializing, setIsInitializing] = useState(true);

  // Initial Sync on Mount
  useEffect(() => {
    const initSync = async () => {
      try {
        // Sinkronisasi data dari MySQL lokal (Backend Server)
        await syncFromDatabase();
      } catch (error) {
        console.error("Initialization sync failed", error);
      } finally {
        setIsInitializing(false);
      }
    };
    initSync();
  }, []);

  // --- Handlers ---

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const config = getAppConfig();
    const savedPassword = config.password || '123456';
    if (passwordInput === savedPassword) {
      setCurrentView(View.ADMIN_DASHBOARD);
      setIsLoginOpen(false);
      setLoginError('');
      setPasswordInput('');
    } else {
      setLoginError('Incorrect password');
    }
  };

  const handleLogout = () => {
    setCurrentView(View.BOOTH);
  };

  const closeLoginModal = () => {
    setIsLoginOpen(false);
    setPasswordInput('');
    setLoginError('');
  };

  if (isInitializing) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0c1633] text-white gap-6">
        <div className="animate-spin text-white/55"><RefreshCw size={64} /></div>
        <div className="text-center flex flex-col items-center">
            <img src="/assets/title.png" alt="UniSmile Photo Booth" className="h-24 md:h-32 lg:h-40 object-contain mb-6 animate-fade-in" />
            <div className="flex items-center gap-6 mt-6">
                <img src="/assets/LOGO UNI INSIDE.png" alt="Uni Inside" className="h-8 md:h-10 object-contain" />
                <img src="/assets/LOGO KOLAB.png" alt="Kolab" className="h-8 md:h-10 object-contain" />
            </div>
            <p className="text-sm md:text-base text-gray-400 mt-10 font-medium animate-pulse">Loading experience data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden font-sans">
      
      {/* 1. Photo Booth View (Default Screen) */}
      {currentView === View.BOOTH && (
        <PhotoBooth onAdminClick={() => setIsLoginOpen(true)} />
      )}

      {/* 2. Unified Kiosk Settings View */}
      {currentView === View.ADMIN_DASHBOARD && (
        <div className="h-full bg-gray-50 flex flex-col overflow-hidden">
          {/* Header Panel */}
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-3">
              <img src="/assets/LOGO UNI SMILE.png" alt="UniSmile" className="h-10 w-10 object-contain rounded-lg" />
              <div>
                <h2 className="font-extrabold text-gray-800 text-lg leading-tight">Uni-Smiles Kiosk</h2>
                <p className="text-xs text-gray-400 font-medium">Control & Setup Module</p>
              </div>
            </div>
            <button 
              id="btn-exit-to-booth"
              onClick={handleLogout}
              className="flex items-center gap-2 bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-md"
            >
              <LogOut size={16} /> Kembali ke Booth
            </button>
          </header>

          {/* Settings Content */}
          <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-gray-50/50">
            <KioskSettings />
          </main>
        </div>
      )}

      {/* Admin Login Modal */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
            <button onClick={closeLoginModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
            
            <div className="text-center mb-6">
              <div className="mx-auto w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-3">
                <Lock className="text-indigo-600" size={24} />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Admin Access</h2>
              <p className="text-sm text-gray-500">Enter password to configure booth.</p>
            </div>

            <form onSubmit={handleAdminLogin}>
              <div className="mb-4">
                <input
                  id="input-admin-password"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-center text-lg tracking-widest"
                  placeholder="••••"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-2 text-center">Default password is: 123456</p>
                {loginError && <p id="error-message" className="text-red-500 text-sm mt-2 text-center">{loginError}</p>}
              </div>
              <button
                id="btn-unlock-settings"
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all cursor-pointer"
              >
                Unlock Settings
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
