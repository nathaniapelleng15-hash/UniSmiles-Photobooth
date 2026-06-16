import React, { useState, useEffect } from 'react';
import { VirtualBackground } from '../types';
import { getStoredBackgrounds, saveStoredBackgrounds, uploadAsset, syncFromCloud } from '../services/storageService';
import { Image as ImageIcon, Plus, Trash2, Upload, RefreshCw, AlertTriangle, Loader2, CheckCircle2, Link, List } from 'lucide-react';

export const BackgroundManager: React.FC = () => {
  const [backgrounds, setBackgrounds] = useState<VirtualBackground[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Input Modes
  const [inputMode, setInputMode] = useState<'upload' | 'bulk'>('upload');

  // Upload Mode State
  const [bgName, setBgName] = useState('');
  const [bgFile, setBgFile] = useState<File | null>(null);
  
  // Bulk Mode State
  const [bulkText, setBulkText] = useState('');

  const [bgToDelete, setBgToDelete] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setBackgrounds(getStoredBackgrounds());
  }, []);

  const handleDelete = (id: string) => {
    setBgToDelete(id);
  };

  const confirmDelete = () => {
    if (bgToDelete) {
      const updated = backgrounds.filter(bg => bg.id !== bgToDelete);
      setBackgrounds(updated);
      saveStoredBackgrounds(updated);
      setBgToDelete(null);
    }
  };

  const handleReloadFromCloud = async () => {
    setIsLoadingDefaults(true);
    setStatusMessage("Syncing from Cloud...");
    
    const success = await syncFromCloud();
    
    if (success) {
        setBackgrounds(getStoredBackgrounds());
        setStatusMessage("Backgrounds loaded from Sheet!");
    } else {
        setStatusMessage("Failed to sync from Sheet.");
    }

    setIsLoadingDefaults(false);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const resetForm = () => {
      setBgName('');
      setBgFile(null);
      setBulkText('');
      setIsModalOpen(false);
      setIsProcessing(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    if (inputMode === 'upload') {
        if (!bgName || !bgFile) {
            setIsProcessing(false);
            return;
        }

        const url = await uploadAsset(bgFile);
        if (url) {
            const newBg: VirtualBackground = {
                id: crypto.randomUUID(),
                name: bgName,
                url: url
            };
            const updated = [...backgrounds, newBg];
            setBackgrounds(updated);
            saveStoredBackgrounds(updated);
            setStatusMessage("Background uploaded!");
            resetForm();
        } else {
            alert("Upload failed.");
        }
    } else {
        // Bulk Import Logic
        if (!bulkText.trim()) {
            setIsProcessing(false);
            return;
        }

        // Regex to find http/https URLs, handles quotes, commas, brackets nicely
        const urlRegex = /(https?:\/\/[^\s"',\]]+)/g;
        const foundUrls = bulkText.match(urlRegex) || [];

        if (foundUrls.length === 0) {
            alert("No valid URLs found in the text.");
            setIsProcessing(false);
            return;
        }

        const newBackgrounds: VirtualBackground[] = foundUrls.map((url, index) => ({
            id: crypto.randomUUID(),
            name: `Imported BG ${backgrounds.length + index + 1}`,
            url: url
        }));

        const updated = [...backgrounds, ...newBackgrounds];
        setBackgrounds(updated);
        saveStoredBackgrounds(updated);
        setStatusMessage(`${foundUrls.length} backgrounds imported!`);
        resetForm();
    }
    
    setTimeout(() => setStatusMessage(null), 3000);
    setIsProcessing(false);
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header Section - Sticky for easier access */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 -mx-4 sm:mx-0 rounded-none sm:rounded-2xl border-b sm:border border-gray-200 shadow-sm sticky top-0 z-10 backdrop-blur-md bg-white/90">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            Virtual Backgrounds
            <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{backgrounds.length}</span>
          </h2>
          <p className="text-sm text-gray-500">Manage images available for green screen replacement.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
            {statusMessage && (
                <span className="text-sm text-green-600 flex items-center gap-1 font-medium animate-fade-in mr-2 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                    <CheckCircle2 size={14} /> {statusMessage}
                </span>
            )}
            <button
                onClick={handleReloadFromCloud}
                disabled={isLoadingDefaults}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed border border-gray-200"
                title="Force reload data from Google Sheet"
            >
                {isLoadingDefaults ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                <span className="hidden sm:inline">{isLoadingDefaults ? "Syncing..." : "Reload Sheet"}</span>
            </button>
            <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-200 transition-all hover:scale-105 active:scale-95"
            >
                <Plus size={18} /> Add New
            </button>
        </div>
      </div>

      {backgrounds.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center">
          <div className="bg-gray-50 p-4 rounded-full mb-4">
             <ImageIcon size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium text-lg">No backgrounds found.</p>
          <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">Sync from the cloud or add your first background to get started.</p>
           <button onClick={handleReloadFromCloud} disabled={isLoadingDefaults} className="text-indigo-600 hover:text-indigo-700 hover:underline text-sm font-medium flex items-center justify-center gap-2 mx-auto">
            {isLoadingDefaults ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />}
            {isLoadingDefaults ? "Loading from Sheet..." : "Check Google Sheet again"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {backgrounds.map(bg => (
            <div key={bg.id} className="group relative rounded-2xl overflow-hidden bg-white aspect-video shadow-sm hover:shadow-xl border border-gray-200 hover:-translate-y-1 transition-all duration-300">
              <img 
                src={bg.url} 
                alt={bg.name} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                loading="lazy" 
              />
              
              {/* Overlay Actions */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                <button 
                  onClick={() => handleDelete(bg.id)}
                  className="p-3 bg-white text-red-600 rounded-full hover:bg-red-50 shadow-lg transform scale-90 group-hover:scale-100 transition-all duration-200"
                  title="Delete Background"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              {/* Label */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-10">
                <p className="text-white text-sm font-medium truncate drop-shadow-md tracking-wide">{bg.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 relative transform transition-all scale-100 animate-fade-in-up">
            <h3 className="text-2xl font-bold mb-1 text-gray-900">Add Background</h3>
            <p className="text-gray-500 mb-6">Choose how you want to add new backgrounds.</p>
            
            {/* Input Mode Switcher */}
            <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${
                  inputMode === 'upload' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                <Upload size={18} /> Upload File
              </button>
              <button
                type="button"
                onClick={() => setInputMode('bulk')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${
                  inputMode === 'bulk' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                <List size={18} /> Bulk URLs
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-5">
              
              {inputMode === 'upload' ? (
                  <>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Name</label>
                        <input
                        type="text"
                        required={inputMode === 'upload'}
                        value={bgName}
                        onChange={(e) => setBgName(e.target.value)}
                        className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                        placeholder="e.g., Mountain View"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Image File</label>
                        <div className="mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-gray-300 border-dashed rounded-xl hover:bg-gray-50 transition-colors cursor-pointer relative group">
                            <div className="space-y-2 text-center">
                            <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                                <ImageIcon size={32} />
                            </div>
                            <div className="flex text-sm text-gray-600 justify-center">
                                <label className="relative cursor-pointer rounded-md font-bold text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                                <span>Click to upload</span>
                                <input 
                                    type="file" 
                                    className="sr-only" 
                                    accept="image/jpeg, image/png, image/webp"
                                    onChange={(e) => setBgFile(e.target.files?.[0] || null)}
                                />
                                </label>
                                <span className="pl-1 font-normal">or drag and drop</span>
                            </div>
                            <p className="text-xs text-gray-400">JPG, PNG, WEBP up to 5MB</p>
                            {bgFile && (
                                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                                   <CheckCircle2 size={12} /> {bgFile.name}
                                </div>
                            )}
                            </div>
                        </div>
                    </div>
                  </>
              ) : (
                  <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">Paste URLs</label>
                      <textarea
                        required={inputMode === 'bulk'}
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        className="w-full h-40 px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:bg-white focus:outline-none font-mono text-xs leading-relaxed transition-all"
                        placeholder={`"https://example.com/image1.jpg",\n"https://example.com/image2.jpg"`}
                      />
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-green-500"/> Supports JSON lists, comma-separated, or newline-separated URLs.
                      </p>
                  </div>
              )}

              <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-3 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  {isProcessing && <Loader2 size={16} className="animate-spin"/>}
                  {isProcessing ? (inputMode === 'upload' ? 'Uploading...' : 'Importing...') : (inputMode === 'upload' ? 'Add Background' : 'Import URLs')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bgToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 transform transition-all scale-100 animate-fade-in-up">
            <div className="flex items-center gap-4 text-red-600 mb-4">
              <div className="p-3 bg-red-100 rounded-full shrink-0">
                <AlertTriangle size={28} />
              </div>
              <div>
                  <h3 className="text-lg font-bold text-gray-900">Delete Item?</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setBgToDelete(null)}
                className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-200 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};