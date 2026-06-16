import React, { useState, useEffect } from 'react';
import { PhotoFilter } from '../types';
import { getStoredFilters, saveStoredFilters, seedDefaultFilters } from '../services/storageService';
import { Wand2, Plus, Trash2, RefreshCw } from 'lucide-react';

export const FilterManager: React.FC = () => {
  const [filters, setFilters] = useState<PhotoFilter[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterCss, setNewFilterCss] = useState('');

  // Unsplash ID for a portrait of a beautiful Chinese woman as requested
  // Using a stable direct URL from Unsplash source
  const PREVIEW_IMAGE = "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=600&auto=format&fit=crop";

  useEffect(() => {
    setFilters(getStoredFilters());
  }, []);

  const handleReset = () => {
    if (confirm("This will reset filters to the default list (20+ styles). Any custom filters will be lost. Continue?")) {
      const seeded = seedDefaultFilters();
      setFilters(seeded);
    }
  };

  const toggleFilter = (id: string) => {
    const updated = filters.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f);
    setFilters(updated);
    saveStoredFilters(updated);
  };

  const deleteFilter = (id: string) => {
    if (confirm("Delete this filter?")) {
      const updated = filters.filter(f => f.id !== id);
      setFilters(updated);
      saveStoredFilters(updated);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const newFilter: PhotoFilter = {
      id: crypto.randomUUID(),
      name: newFilterName,
      cssFilter: newFilterCss,
      enabled: true
    };
    const updated = [...filters, newFilter];
    setFilters(updated);
    saveStoredFilters(updated);
    setNewFilterName('');
    setNewFilterCss('');
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Manage Filters</h2>
          <p className="text-sm text-gray-500">Enable or create CSS-based photo filters.</p>
        </div>
        <div className="flex gap-2">
            <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <RefreshCw size={16} /> Load Defaults (20)
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
          >
            <Plus size={16} /> New Filter
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filters.map(filter => (
          <div key={filter.id} className={`bg-white border rounded-xl p-3 flex flex-col gap-2 transition-all ${filter.enabled ? 'border-gray-300 shadow-sm' : 'border-gray-100 opacity-70'}`}>
            <div className="relative w-full aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
               {/* Preview Image with Filter Applied */}
               <img 
                 src={PREVIEW_IMAGE} 
                 alt="Filter Preview" 
                 className="w-full h-full object-cover"
                 style={{ filter: filter.cssFilter }}
                 loading="lazy"
               />
               <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm">
                 {filter.name}
               </div>
            </div>

            <div className="flex items-center justify-between mt-1">
              <label className="relative inline-flex items-center cursor-pointer group" title={filter.enabled ? "Disable Filter" : "Enable Filter"}>
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={filter.enabled}
                  onChange={() => toggleFilter(filter.id)}
                />
                <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
              
              {!['normal'].includes(filter.id) && (
                 <button 
                  onClick={() => deleteFilter(filter.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1"
                  title="Delete Filter"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">Create New Filter</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filter Name</label>
                <input
                  type="text"
                  required
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="e.g., Midnight"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CSS Filter Value</label>
                <input
                  type="text"
                  required
                  value={newFilterCss}
                  onChange={(e) => setNewFilterCss(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-sm"
                  placeholder="e.g., contrast(1.2) brightness(0.8)"
                />
                <p className="text-xs text-gray-400 mt-1">Use standard CSS filter functions.</p>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};