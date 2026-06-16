import React, { useState, useEffect } from 'react';
import { StickerIcon } from '../types';
import { getStoredIcons, saveStoredIcons, seedOpenMojiIcons, uploadAsset } from '../services/storageService';
import { Trash2, Plus, RefreshCw, AlertTriangle, Upload, Link as LinkIcon, Image as ImageIcon, Loader2 } from 'lucide-react';

export const IconManager: React.FC = () => {
  const [icons, setIcons] = useState<StickerIcon[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [iconToDelete, setIconToDelete] = useState<string | null>(null);
  
  // Add Icon States
  const [addMode, setAddMode] = useState<'url' | 'upload'>('upload');
  const [newIconName, setNewIconName] = useState('');
  const [newIconUrl, setNewIconUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    try {
        const stored = getStoredIcons();
        if (Array.isArray(stored)) {
            setIcons(stored);
        } else {
            console.error("Stored icons is not an array");
            setIcons([]);
        }
    } catch (e) {
        console.error("Failed to load icons in component", e);
        setIcons([]);
    }
  }, []);

  // Cleanup object URL when modal closes or preview changes
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleSeed = () => {
    setIsLoading(true);
    setTimeout(() => {
      const seeded = seedOpenMojiIcons();
      setIcons(seeded);
      setIsLoading(false);
    }, 500);
  };

  const confirmDelete = () => {
    if (iconToDelete) {
      const updated = icons.filter(icon => icon.id !== iconToDelete);
      setIcons(updated);
      saveStoredIcons(updated);
      setIconToDelete(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = [
        'image/png', 'image/gif', 'image/svg+xml', 'image/webp', 'image/avif'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        alert('Supported formats: PNG, GIF, SVG, WEBP, AVIF.');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        alert('File size too large. Please upload an image under 2MB.');
        return;
      }

      setUploadedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      
      if (!newIconName) {
        setNewIconName(file.name.split('.')[0]);
      }
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setNewIconUrl(url);
    setPreviewUrl(url);
  };

  const resetForm = () => {
    setNewIconName('');
    setNewIconUrl('');
    setUploadedFile(null);
    setPreviewUrl('');
    setIsAddModalOpen(false);
    setIsUploading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIconName) {
      alert("Please enter a name for the icon.");
      return;
    }

    if (addMode === 'url' && !newIconUrl) return;
    if (addMode === 'upload' && !uploadedFile) return;

    const saveIcon = (finalUrl: string) => {
      const newIcon: StickerIcon = {
        id: crypto.randomUUID(),
        name: newIconName,
        url: finalUrl,
        source: 'custom'
      };

      const updated = [newIcon, ...icons];
      setIcons(updated);
      saveStoredIcons(updated);
      resetForm();
    };

    if (addMode === 'upload' && uploadedFile) {
        setIsUploading(true);
        const uploadedUrl = await uploadAsset(uploadedFile);
        if (uploadedUrl) {
            saveIcon(uploadedUrl);
        } else {
            alert("Upload failed. Please try again.");
            setIsUploading(false);
        }
    } else {
      saveIcon(newIconUrl);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Asset Management</h2>
          <p className="text-sm text-gray-500">Manage Stickers and Images.</p>
        </div>
        <div className="flex gap-2">
           <button
            onClick={handleSeed}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            {icons.length === 0 ? "Load Defaults" : "Reset Defaults"}
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
          >
            <Plus size={16} />
            Add Asset
          </button>
        </div>
      </div>

      {icons.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500 mb-4">No assets found.</p>
          <button onClick={handleSeed} className="text-indigo-600 hover:underline">
            Load default library from OpenMoji
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[600px] overflow-y-auto p-2">
          {icons.map((icon) => (
            <div key={icon.id} className="group relative bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:shadow-md transition-shadow">
              <div className="w-16 h-16 flex items-center justify-center">
                <img 
                src={icon.url} 
                alt={icon.name} 
                className="max-w-full max-h-full object-contain" 
                loading="lazy"
                onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=Error';
                }}
                />
              </div>
              <span className="text-xs text-gray-500 truncate w-full text-center">{icon.name}</span>
              
              <button 
                onClick={() => setIconToDelete(icon.id)}
                className="absolute top-1 right-1 p-1 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200 shadow-sm"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in-up">
            <h3 className="text-lg font-bold mb-4">Add New Asset</h3>
            
            {/* Mode Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
              <button
                type="button"
                onClick={() => setAddMode('upload')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
                  addMode === 'upload' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Upload size={16} /> Upload File
              </button>
              <button
                type="button"
                onClick={() => setAddMode('url')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
                  addMode === 'url' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LinkIcon size={16} /> URL
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newIconName}
                  onChange={(e) => setNewIconName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="e.g., Party Hat"
                />
              </div>

              {addMode === 'upload' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Upload File</label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:bg-gray-50 transition-colors cursor-pointer relative">
                    <div className="space-y-1 text-center">
                      <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-600 justify-center">
                        <label className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                          <span>Upload a file</span>
                          <input 
                            type="file" 
                            className="sr-only" 
                            accept=".png, .gif, .svg, .webp, .avif"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                      <p className="text-xs text-gray-500">PNG, GIF, WEBP, AVIF, SVG</p>
                      {uploadedFile && (
                        <p className="text-xs text-green-600 font-semibold mt-2">
                           Selected: {uploadedFile.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                  <input
                    type="url"
                    required={addMode === 'url'}
                    value={newIconUrl}
                    onChange={handleUrlChange}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="https://example.com/image.png"
                  />
                  <p className="text-xs text-gray-400 mt-1">Direct link to image file.</p>
                </div>
              )}
              
              {/* Preview Area */}
              {previewUrl && (
                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="text-xs text-gray-400 mb-2 uppercase font-bold tracking-wider">Preview</span>
                    <img src={previewUrl} alt="Preview" className="h-20 w-20 object-contain" />
                </div>
              )}

              <div className="flex gap-3 justify-end mt-6">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isUploading && <Loader2 size={16} className="animate-spin" />}
                  {isUploading ? 'Uploading...' : 'Add Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {iconToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 transform transition-all scale-100 animate-fade-in-up">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Asset?</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this asset? This action cannot be undone.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIconToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
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