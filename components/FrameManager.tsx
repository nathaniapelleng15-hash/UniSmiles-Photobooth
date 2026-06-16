import React, { useState, useEffect } from 'react';
import { FrameLayout, FrameStyle, GridLayoutId, FrameElement, FrameBackground } from '../types';
import { getStoredFrames, saveStoredFrames, getLayoutConfig } from '../services/storageService';
import { Trash2, Plus, AlertTriangle, LayoutTemplate, Edit2 } from 'lucide-react';
import { FrameEditor } from './FrameEditor';

export const FrameManager: React.FC = () => {
  const [frames, setFrames] = useState<FrameLayout[]>([]);
  const [activeTab, setActiveTab] = useState<GridLayoutId>('1x1');
  
  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  // Data States
  const [editingStyle, setEditingStyle] = useState<FrameStyle | null>(null);
  const [styleToDelete, setStyleToDelete] = useState<{layoutId: GridLayoutId, styleId: string} | null>(null);
  const [newStyleName, setNewStyleName] = useState('');

  useEffect(() => {
    setFrames(getStoredFrames());
  }, []);

  const activeLayout = frames.find(f => f.id === activeTab);

  const toggleLayout = (id: GridLayoutId) => {
    const updated = frames.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f);
    setFrames(updated);
    saveStoredFrames(updated);
  };

  const confirmDelete = () => {
    if (styleToDelete) {
      const { layoutId, styleId } = styleToDelete;
      const updated = frames.map(f => {
        if (f.id === layoutId) {
          return { ...f, styles: f.styles.filter(s => s.id !== styleId) };
        }
        return f;
      });
      setFrames(updated);
      saveStoredFrames(updated);
      setStyleToDelete(null);
    }
  };

  const handleCreateStyle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStyleName) return;

    // Default configuration for a new style
    const defaultBg: FrameBackground = { type: 'solid', color: '#ffffff' };
    const newStyle: FrameStyle = {
      id: crypto.randomUUID(),
      name: newStyleName,
      backgroundConfig: defaultBg,
      elements: [],
      // Placeholder preview until edited
      previewUrl: '' 
    };

    const updated = frames.map(f => {
      if (f.id === activeTab) {
        return { ...f, styles: [...f.styles, newStyle] };
      }
      return f;
    });
    
    setFrames(updated);
    saveStoredFrames(updated);
    setNewStyleName('');
    setIsAddModalOpen(false);
  };

  const handleEditStyle = (style: FrameStyle) => {
    setEditingStyle(style);
    setIsEditorOpen(true);
  };

  const saveEditedStyle = (updatedStyle: FrameStyle) => {
    const updated = frames.map(f => {
       if (f.id === activeTab) {
         return {
           ...f,
           styles: f.styles.map(s => s.id === updatedStyle.id ? updatedStyle : s)
         };
       }
       return f;
    });
    setFrames(updated);
    saveStoredFrames(updated);
    setIsEditorOpen(false);
    setEditingStyle(null);
  };

  const updateLayoutPrice = (id: GridLayoutId, price: number) => {
    const updated = frames.map(f => f.id === id ? { ...f, price } : f);
    setFrames(updated);
    saveStoredFrames(updated);
  };

  // --- Render Preview Helper ---
  // Renders a mini version of the frame using the config, instead of a static image
  const RenderPreview = ({ style, layoutId }: { style: FrameStyle, layoutId: string }) => {
    const config = getLayoutConfig(layoutId);
    
    const bgStyle: React.CSSProperties = {
        aspectRatio: `${config.width}/${config.height}`
    };
    if (style.backgroundConfig.type === 'solid') bgStyle.backgroundColor = style.backgroundConfig.color;
    else if (style.backgroundConfig.type === 'gradient') {
      const stops = style.backgroundConfig.gradientStops?.map(s => `${s.color} ${s.offset}%`).join(', ');
      if (style.backgroundConfig.gradientType === 'radial') bgStyle.background = `radial-gradient(circle, ${stops})`;
      else bgStyle.background = `linear-gradient(${style.backgroundConfig.gradientAngle}deg, ${stops})`;
    } else {
        bgStyle.background = 'transparent'; 
    }

    return (
      <div className="w-full relative overflow-hidden" style={bgStyle}>
        {/* Render simple placeholders to mimic structure */}
        {config.slots.map((slot, i) => (
             <div 
               key={i}
               className="absolute bg-gray-200/50 border border-gray-300"
               style={{
                   left: `${(slot.x / config.width) * 100}%`,
                   top: `${(slot.y / config.height) * 100}%`,
                   width: `${(slot.width / config.width) * 100}%`,
                   height: `${(slot.height / config.height) * 100}%`,
               }}
             />
        ))}

        {style.elements?.map(el => {
           // Ensure width is treated as a number and fallback to 20 if 0 or NaN
           const widthVal = el.width && !isNaN(Number(el.width)) && Number(el.width) > 0 ? Number(el.width) : 20;
           
           return (
             <div 
              key={el.id}
              style={{
                position: 'absolute',
                left: `${el.x}%`,
                top: `${el.y}%`,
                transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
                width: el.type === 'text' ? 'auto' : `${widthVal}%`,
                zIndex: el.zIndex + 10,
                opacity: el.opacity,
                fontSize: el.type === 'text' ? `${Math.max(8, (el.fontSize || 40) / 4)}px` : undefined, // Scale down text for preview
                fontFamily: el.fontFamily,
                fontWeight: el.fontWeight,
                fontStyle: el.fontStyle,
                textDecoration: el.textDecoration,
                color: el.color,
                whiteSpace: 'nowrap',
                textShadow: el.effect === 'shadow' ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none',
                WebkitTextStroke: el.effect === 'outline' ? '0.5px black' : 'none',
              }}
             >
                {el.type === 'text' ? el.content : (
                  <img 
                    src={el.content} 
                    className="w-full h-auto block" 
                    // Removed crossOrigin to ensure visibility in standard DOM
                    alt="asset"
                  />
                )}
             </div>
           );
        })}
      </div>
    );
  };

  if (isEditorOpen && editingStyle) {
    return (
        <FrameEditor 
            styleData={editingStyle} 
            layoutLabel={activeLayout?.label || ''} 
            layoutId={activeTab}
            onSave={saveEditedStyle} 
            onClose={() => setIsEditorOpen(false)} 
        />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Manage Frames</h2>
          <p className="text-sm text-gray-500">Enable layouts and customize styles.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto pb-2 gap-2 border-b border-gray-200">
        {frames.map(layout => (
          <button
            key={layout.id}
            onClick={() => setActiveTab(layout.id)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === layout.id 
                ? 'bg-indigo-600 text-white' 
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <LayoutTemplate size={16} />
            {layout.label}
            {layout.enabled && <div className="w-1.5 h-1.5 rounded-full bg-green-400" />}
          </button>
        ))}
      </div>

      {/* Active Layout Content */}
      {activeLayout && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-fade-in">

          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={activeLayout.enabled}
                    onChange={() => toggleLayout(activeLayout.id)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
                <span className="font-medium text-gray-700">
                  {activeLayout.enabled ? 'Layout Enabled' : 'Layout Disabled'}
                </span>
              </div>
              <div className="flex items-center gap-2 border-l border-gray-300 pl-6">
                <label className="text-sm font-medium text-gray-600">Price:</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rp</span>
                  <input
                    type="number"
                    value={activeLayout.price || 0}
                    onChange={(e) => updateLayoutPrice(activeLayout.id, Number(e.target.value))}
                    className="w-32 pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
            >
              <Plus size={16} /> Create Style
            </button>
          </div>

          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">
            Available Styles ({activeLayout.styles.length})
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {activeLayout.styles.map(style => (
              <div key={style.id} className="group relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50 shadow-sm hover:shadow-md transition-shadow">
                
                {/* Custom Preview Renderer */}
                <RenderPreview style={style} layoutId={activeLayout.id} />
                
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center flex-col gap-2">
                  <span className="text-white text-xs font-bold px-2 text-center drop-shadow-md">{style.name}</span>
                  <div className="flex gap-2">
                     <button 
                      onClick={() => handleEditStyle(style)}
                      className="p-2 bg-white text-indigo-600 rounded-full hover:bg-gray-100"
                      title="Edit Style"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => setStyleToDelete({ layoutId: activeLayout.id, styleId: style.id })}
                      className="p-2 bg-white text-red-600 rounded-full hover:bg-gray-100"
                      title="Delete Style"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Style Modal (Name Only) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-4">Create New Style</h3>
            <form onSubmit={handleCreateStyle} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Style Name</label>
                <input
                  type="text"
                  required
                  value={newStyleName}
                  onChange={(e) => setNewStyleName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="e.g., Summer Vibes"
                />
              </div>
              <div className="flex gap-3 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
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

      {/* Delete Confirmation Modal */}
      {styleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Style?</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this frame style?
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setStyleToDelete(null)}
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