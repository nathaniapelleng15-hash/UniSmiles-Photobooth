import React, { useState, useEffect } from 'react';
import { getAppConfig, syncFromCloud, syncToCloud, syncFromDatabase } from './services/storageService';
import { IconManager } from './components/IconManager';
import { PasswordSettings } from './components/PasswordSettings';
import { BrandingSettings } from './components/BrandingSettings';
import { FrameManager } from './components/FrameManager';
import { FilterManager } from './components/FilterManager';
import { BackgroundManager } from './components/BackgroundManager';
import { PhotoBooth } from './components/PhotoBooth';
import { TransactionManager } from './components/TransactionManager';
import { 
  Settings, 
  Image as ImageIcon, 
  LogOut, 
  Lock, 
  LayoutTemplate, 
  Wand2, 
  Wallpaper,
  X,
  Cloud,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Receipt
} from 'lucide-react';

enum View {
  BOOTH = 'BOOTH',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD'
}

enum AdminTab {
  SETTINGS = 'SETTINGS',
  ICONS = 'ICONS',
  FRAMES = 'FRAMES',
  FILTERS = 'FILTERS',
  BACKGROUNDS = 'BACKGROUNDS',
  TRANSACTIONS = 'TRANSACTIONS'
}

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.BOOTH);
  const [activeTab, setActiveTab] = useState<AdminTab>(AdminTab.SETTINGS);
  
  // Login Modal State
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Sync State
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Initial Sync on Mount
  useEffect(() => {
    const initSync = async () => {
      try {
        // Sync from cloud (Google Sheet) before loading the UI
        await syncFromCloud();
        // Sinkronisasi data dari MySQL lokal
        await syncFromDatabase();
      } catch (error) {
        console.error("Initialization sync failed", error);
      } finally {
        setIsInitializing(false);
      }
    };
    initSync();
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncStatus('idle');
    // Save current local state to cloud
    const success = await syncToCloud();
    if (success) {
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 3000);
    } else {
        setSyncStatus('error');
    }
    setIsSyncing(false);
  };

  // --- Handlers ---

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Validasi password kosong
    if (!passwordInput || passwordInput.trim() === '') {
      setLoginError('Password cannot be empty');
      return;
    }
    const config = getAppConfig();
    if (passwordInput === config.password) {
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

  // --- Views ---

  const NavButton = ({ tab, icon: Icon, label }: { tab: AdminTab, icon: any, label: string }) => (
    <a
      id={`menu-${tab.toLowerCase()}`}
      href="#"
      onClick={(e) => { e.preventDefault(); setActiveTab(tab); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
        activeTab === tab
          ? 'bg-indigo-50 text-indigo-700 font-medium' 
          : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      <Icon size={20} />
      {label}
    </a>
  );

  if (isInitializing) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0c1633] text-white gap-6">
        <div className="animate-spin text-white/50"><RefreshCw size={64} /></div>
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
      
      {/* 1. Photo Booth View (Default) */}
      {currentView === View.BOOTH && (
        <PhotoBooth onAdminClick={() => setIsLoginOpen(true)} />
      )}

      {/* 2. Admin Dashboard View */}
      {currentView === View.ADMIN_DASHBOARD && (
        <div className="flex h-full bg-gray-50">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <img src="/assets/LOGO UNI SMILE.png" alt="UniSmile" className="h-12 w-12 object-contain" />
                Admin Panel
              </h2>
            </div>
            
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              <NavButton tab={AdminTab.SETTINGS} icon={Settings} label="Settings" />
              <NavButton tab={AdminTab.ICONS} icon={ImageIcon} label="Stickers & Icons" />
              <NavButton tab={AdminTab.FRAMES} icon={LayoutTemplate} label="Frames & Layouts" />
              <NavButton tab={AdminTab.FILTERS} icon={Wand2} label="Photo Filters" />
              <NavButton tab={AdminTab.BACKGROUNDS} icon={Wallpaper} label="Backgrounds" />
              <NavButton tab={AdminTab.TRANSACTIONS} icon={Receipt} label="Transactions" />
            </nav>

            <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3">
               <button 
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors border ${
                      syncStatus === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
                      syncStatus === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
               >
                   {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : 
                    syncStatus === 'success' ? <CheckCircle2 size={16} /> : <Cloud size={16} /> }
                   {isSyncing ? 'Syncing...' : syncStatus === 'success' ? 'Synced' : 'Sync to Cloud'}
               </button>

               <button 
                id="btn-exit-to-booth"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white py-2.5 rounded-lg font-medium transition-colors"
              >
                <LogOut size={16} /> Exit to Booth
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <header className="bg-white border-b border-gray-200 p-4 md:hidden flex justify-between items-center sticky top-0 z-10">
              <h2 className="font-bold text-gray-800">Admin Panel</h2>
              <button onClick={handleLogout}><LogOut size={20} className="text-gray-600"/></button>
            </header>

            {/* Mobile Tabs */}
            <div className="flex md:hidden bg-white border-b border-gray-200 overflow-x-auto">
              <a href="#" id="menu-settings-mobile" onClick={(e) => { e.preventDefault(); setActiveTab(AdminTab.SETTINGS); }} className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 ${activeTab === AdminTab.SETTINGS ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Settings</a>
              <a href="#" id="menu-icons-mobile" onClick={(e) => { e.preventDefault(); setActiveTab(AdminTab.ICONS); }} className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 ${activeTab === AdminTab.ICONS ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Icons</a>
              <a href="#" id="menu-frames-mobile" onClick={(e) => { e.preventDefault(); setActiveTab(AdminTab.FRAMES); }} className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 ${activeTab === AdminTab.FRAMES ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Frames</a>
              <a href="#" id="menu-filters-mobile" onClick={(e) => { e.preventDefault(); setActiveTab(AdminTab.FILTERS); }} className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 ${activeTab === AdminTab.FILTERS ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Filters</a>
              <a href="#" id="menu-backgrounds-mobile" onClick={(e) => { e.preventDefault(); setActiveTab(AdminTab.BACKGROUNDS); }} className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 ${activeTab === AdminTab.BACKGROUNDS ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Backgrounds</a>
              <a href="#" id="menu-transactions-mobile" onClick={(e) => { e.preventDefault(); setActiveTab(AdminTab.TRANSACTIONS); }} className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 ${activeTab === AdminTab.TRANSACTIONS ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>Transactions</a>
            </div>

            <div className="p-6 md:p-10 max-w-7xl mx-auto">
              {activeTab === AdminTab.SETTINGS && (
                <div className="animate-fade-in">
                  <h1 className="text-3xl font-bold text-gray-900 mb-8">System Settings</h1>
                  <PasswordSettings />
                  <BrandingSettings />
                </div>
              )}
              {activeTab === AdminTab.ICONS && <div className="animate-fade-in"><IconManager /></div>}
              {activeTab === AdminTab.FRAMES && <div className="animate-fade-in"><FrameManager /></div>}
              {activeTab === AdminTab.FILTERS && <div className="animate-fade-in"><FilterManager /></div>}
              {activeTab === AdminTab.BACKGROUNDS && <div className="animate-fade-in"><BackgroundManager /></div>}
              {activeTab === AdminTab.TRANSACTIONS && <div className="animate-fade-in"><TransactionManager /></div>}
            </div>
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
                {loginError && <p id="error-message" className="text-red-500 text-sm mt-2 text-center">{loginError}</p>}
              </div>
              <button
                id="btn-unlock-settings"
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all"
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
