import React, { useState, useEffect } from 'react';
import { getAppConfig, saveAppConfig, getStoredIcons } from '../services/storageService';
import { StickerIcon } from '../types';
import { Image as ImageIcon, Save, Type, CheckCircle2, AlertCircle, XCircle, MousePointer2, Hand, HardDrive, Monitor } from 'lucide-react';

export const BrandingSettings: React.FC = () => {
  const [subtitle, setSubtitle] = useState('');
  const [selectedLogoUrl, setSelectedLogoUrl] = useState('');
  const [uiMode, setUiMode] = useState<'normal' | 'air-touch'>('normal');
  const [monitorOrientation, setMonitorOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [availableIcons, setAvailableIcons] = useState<StickerIcon[]>([]);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const config = getAppConfig();
    setSubtitle(config.customSubtitle || '');
    setSelectedLogoUrl(config.customLogoUrl || '');
    setUiMode(config.uiMode || 'normal');
    setMonitorOrientation(config.monitorOrientation || 'horizontal');
    setAvailableIcons(getStoredIcons());
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const config = getAppConfig();
    saveAppConfig({
      ...config,
      customSubtitle: subtitle,
      customLogoUrl: selectedLogoUrl,
      uiMode,
      monitorOrientation,
    });
    setStatus('success');
    setMessage('Settings updated locally!');
    setTimeout(() => { setStatus('idle'); setMessage(''); }, 3000);
  };

  const optionClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
      active ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'
    }`;

  return (
    <div className="max-w-2xl mt-8 pt-8 border-t border-gray-200">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <ImageIcon className="text-gray-500" size={24} />
          Custom Branding &amp; UI
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Customize logo, text, navigation, and monitor layout.{' '}
          <span className="inline-flex items-center gap-1 ml-1 text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded text-xs">
            <HardDrive size={10} /> Local Device Only
          </span>
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">

        {/* ── Navigation Style ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <label className="block text-sm font-medium text-gray-700">Navigation Style</label>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Local Storage</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button id="btn-normal-ui" type="button" onClick={() => setUiMode('normal')} className={optionClass(uiMode === 'normal')}>
              <MousePointer2 size={32} />
              Normal UI
              <span className="text-xs text-center opacity-75">Standard mouse/touch controls. Compact layout.</span>
            </button>
            <button id="btn-air-touch-ui" type="button" onClick={() => setUiMode('air-touch')} className={optionClass(uiMode === 'air-touch')}>
              <Hand size={32} />
              Air Touch UI
              <span className="text-xs text-center opacity-75">Large buttons, extra spacing. Optimized for gestures.</span>
            </button>
          </div>
        </div>

        {/* ── Monitor Orientation ── */}
        <div className="border-t border-gray-100 pt-6">
          <div className="flex items-center gap-2 mb-1">
            <Monitor size={16} className="text-gray-600" />
            <label className="block text-sm font-medium text-gray-700">Monitor Orientation</label>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Local Storage</span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Pilih orientasi monitor fisik yang digunakan. Mempengaruhi layout seluruh tampilan booth.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* Horizontal card */}
            <button id="btn-horizontal" type="button" onClick={() => setMonitorOrientation('horizontal')} className={optionClass(monitorOrientation === 'horizontal')}>
              {/* Mini monitor mockup – landscape */}
              <div className="flex flex-col items-center gap-0.5">
                <div className={`w-20 h-12 rounded-sm border-2 flex items-end justify-center ${monitorOrientation === 'horizontal' ? 'border-indigo-500 bg-indigo-100' : 'border-gray-400 bg-gray-100'}`}>
                  <div className="w-full h-full p-1 flex gap-1">
                    <div className={`flex-1 rounded-sm ${monitorOrientation === 'horizontal' ? 'bg-indigo-300' : 'bg-gray-300'}`} />
                    <div className="w-5 flex flex-col gap-1">
                      <div className={`flex-1 rounded-sm ${monitorOrientation === 'horizontal' ? 'bg-indigo-400' : 'bg-gray-400'}`} />
                      <div className={`flex-1 rounded-sm ${monitorOrientation === 'horizontal' ? 'bg-indigo-400' : 'bg-gray-400'}`} />
                      <div className={`flex-1 rounded-sm ${monitorOrientation === 'horizontal' ? 'bg-indigo-400' : 'bg-gray-400'}`} />
                    </div>
                  </div>
                </div>
                <div className={`w-5 h-1.5 rounded-b ${monitorOrientation === 'horizontal' ? 'bg-indigo-400' : 'bg-gray-400'}`} />
                <div className={`w-10 h-0.5 rounded ${monitorOrientation === 'horizontal' ? 'bg-indigo-300' : 'bg-gray-300'}`} />
              </div>
              Horizontal
              <span className="text-xs text-center opacity-75 leading-relaxed">Monitor landscape (lebar). Panel samping — desain default.</span>
            </button>

            {/* Vertical card */}
            <button id="btn-vertical" type="button" onClick={() => setMonitorOrientation('vertical')} className={optionClass(monitorOrientation === 'vertical')}>
              {/* Mini monitor mockup – portrait */}
              <div className="flex flex-col items-center gap-0.5">
                <div className={`w-12 h-20 rounded-sm border-2 flex items-end justify-center ${monitorOrientation === 'vertical' ? 'border-indigo-500 bg-indigo-100' : 'border-gray-400 bg-gray-100'}`}>
                  <div className="w-full h-full p-1 flex flex-col gap-1">
                    <div className={`flex-1 rounded-sm ${monitorOrientation === 'vertical' ? 'bg-indigo-300' : 'bg-gray-300'}`} />
                    <div className="h-5 flex gap-1">
                      <div className={`flex-1 rounded-sm ${monitorOrientation === 'vertical' ? 'bg-indigo-400' : 'bg-gray-400'}`} />
                      <div className={`flex-1 rounded-sm ${monitorOrientation === 'vertical' ? 'bg-indigo-400' : 'bg-gray-400'}`} />
                    </div>
                  </div>
                </div>
                <div className={`w-3 h-1.5 rounded-b ${monitorOrientation === 'vertical' ? 'bg-indigo-400' : 'bg-gray-400'}`} />
                <div className={`w-8 h-0.5 rounded ${monitorOrientation === 'vertical' ? 'bg-indigo-300' : 'bg-gray-300'}`} />
              </div>
              Vertical
              <span className="text-xs text-center opacity-75 leading-relaxed">Monitor portrait (tinggi). Preview atas, kontrol bawah.</span>
            </button>
          </div>

          {monitorOrientation === 'vertical' && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <span className="text-base leading-none mt-0.5">💡</span>
              <span>Mode vertikal mengubah layout CAPTURE, LAYOUT, EDIT, dan RESULT menjadi stack atas-bawah yang optimal untuk monitor portrait (tinggi).</span>
            </div>
          )}
        </div>

        {/* ── Subtitle ── */}
        <div className="border-t border-gray-100 pt-6">
          <div className="flex items-center gap-2 mb-2">
            <Type size={16} className="text-gray-600" />
            <label className="text-sm font-medium text-gray-700">Brand / Event Name</label>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Local Storage</span>
          </div>
          <input
            id="input-brand-name"
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            placeholder="e.g. Wedding 2024"
          />
          <p className="text-xs text-gray-400 mt-1">Displayed as: "UniSmile Photo Booth x [Your Text]"</p>
        </div>

        {/* ── Logo ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon size={16} className="text-gray-600" />
            <label className="text-sm font-medium text-gray-700">Select Logo (from Assets)</label>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Local Storage</span>
          </div>
          <div className="flex items-center gap-4 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center border border-gray-200 shadow-sm">
              {selectedLogoUrl ? <img src={selectedLogoUrl} className="max-w-full max-h-full p-1" alt="Selected Logo" /> : <span className="text-xs text-gray-400">Default</span>}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">Current Logo</p>
              <p className="text-xs text-gray-500 truncate max-w-[200px]">{selectedLogoUrl || 'Default Camera Icon'}</p>
            </div>
            {selectedLogoUrl && (
              <button type="button" onClick={() => setSelectedLogoUrl('')} className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1">
                <XCircle size={16} /> Reset
              </button>
            )}
          </div>
          <div className="h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
              {availableIcons.length === 0 && (
                <p className="text-center col-span-full text-sm text-gray-400 py-4">No assets found. Upload stickers in 'Stickers &amp; Icons' tab.</p>
              )}
              {availableIcons.map((icon) => (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() => setSelectedLogoUrl(icon.url)}
                  className={`aspect-square p-2 bg-white rounded-lg border flex items-center justify-center transition-all ${selectedLogoUrl === icon.url ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <img src={icon.url} className="max-w-full max-h-full object-contain" alt={icon.name} loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {status !== 'idle' && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {status === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {message}
          </div>
        )}

        <div className="pt-2">
          <button type="submit" className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-medium transition-colors">
            <Save size={18} />
            Save Settings (Local)
          </button>
        </div>
      </form>
    </div>
  );
};