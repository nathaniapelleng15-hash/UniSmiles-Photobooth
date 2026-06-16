import React, { useState, useRef, useEffect } from 'react';
import { FrameStyle, FrameElement, FrameBackground, FrameGradientStop, StickerIcon } from '../types';
import { getStoredIcons, getLayoutConfig } from '../services/storageService';
import { 
  X, Save, Type, Image as ImageIcon, Palette, Move, 
  Trash2, Copy, AlignLeft, Bold, Italic, Underline, 
  RotateCw, Plus, Minus, ZoomIn, ZoomOut
} from 'lucide-react';

interface FrameEditorProps {
  styleData: FrameStyle;
  layoutLabel: string;
  layoutId: string;
  onSave: (updatedStyle: FrameStyle) => void;
  onClose: () => void;
}

const FONTS = [
  'Inter', 'Roboto', 'Oswald', 'Lobster', 'Dancing Script', 'Pacifico', 
  'Anton', 'Bangers', 'Fredoka One', 'Great Vibes', 'Monoton', 
  'Permanent Marker', 'Righteous', 'Sacramento', 'Shadows Into Light', 
  'Satisfy', 'Creepster', 'Gloria Hallelujah', 'Indie Flower', 
  'Orbitron', 'Press Start 2P', 'Russo One', 'Special Elite', 'Ultra', 'Yellowtail'
];

export const FrameEditor: React.FC<FrameEditorProps> = ({ styleData, layoutLabel, layoutId, onSave, onClose }) => {
  // State
  const [activeTab, setActiveTab] = useState<'background' | 'text' | 'stickers'>('background');
  
  const [background, setBackground] = useState<FrameBackground>(styleData.backgroundConfig || { 
    type: 'transparent', 
    color: '#ffffff', 
    gradientType: 'linear', 
    gradientAngle: 90, 
    gradientStops: [{color: '#ff0000', offset: 0}, {color: '#0000ff', offset: 100}] 
  });
  
  const [elements, setElements] = useState<FrameElement[]>(styleData.elements || []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stickers, setStickers] = useState<StickerIcon[]>([]);
  const [zoom, setZoom] = useState(0.4); // Initial zoom for large frames
  
  // Layout Config
  const layoutConfig = getLayoutConfig(layoutId);

  // Dragging State
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const elementStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setStickers(getStoredIcons());
    // Adjust initial zoom based on height
    if (layoutConfig.height > 1000) {
        setZoom(0.35);
    } else {
        setZoom(0.55);
    }
  }, [layoutId]);

  // --- Helpers ---

  const getSelectedElement = () => elements.find(el => el.id === selectedId);

  const updateSelectedElement = (updates: Partial<FrameElement>) => {
    if (!selectedId) return;
    setElements(prev => prev.map(el => el.id === selectedId ? { ...el, ...updates } : el));
  };

  const addElement = (type: 'text' | 'sticker', content: string) => {
    const newEl: FrameElement = {
      id: crypto.randomUUID(),
      type,
      content,
      x: 50, // Center approx
      y: 50,
      width: type === 'text' ? 0 : 20, // Text width is auto usually, stickers fixed
      height: 0,
      rotation: 0,
      opacity: 1,
      zIndex: elements.length + 1,
      fontSize: 60, // Larger default font for high res
      fontFamily: 'Inter',
      color: '#000000',
      fontWeight: 'normal',
      effect: 'none'
    };
    setElements([...elements, newEl]);
    setSelectedId(newEl.id);
  };

  const deleteElement = () => {
    if (selectedId) {
      setElements(elements.filter(el => el.id !== selectedId));
      setSelectedId(null);
    }
  };

  // --- Background Logic ---
  
  const changeBackgroundType = (newType: 'transparent' | 'solid' | 'gradient') => {
      setBackground(prev => {
          const updated = { ...prev, type: newType };
          
          // Ensure gradient properties exist if switching to gradient
          if (newType === 'gradient') {
              if (!updated.gradientStops || updated.gradientStops.length === 0) {
                  updated.gradientStops = [{color: '#ff0000', offset: 0}, {color: '#0000ff', offset: 100}];
              }
              if (!updated.gradientType) updated.gradientType = 'linear';
              if (updated.gradientAngle === undefined) updated.gradientAngle = 90;
          }
          
          return updated;
      });
  };

  const getBackgroundStyle = () => {
    if (background.type === 'transparent') return { background: 'transparent' };
    if (background.type === 'solid') return { backgroundColor: background.color };
    if (background.type === 'gradient') {
      // Safety check for stops
      const stopsData = background.gradientStops || [{color: '#fff', offset: 0}, {color: '#000', offset: 100}];
      
      const stops = stopsData
        .sort((a, b) => a.offset - b.offset)
        .map(s => `${s.color} ${s.offset}%`)
        .join(', ');
      
      if (background.gradientType === 'radial') {
        return { background: `radial-gradient(circle, ${stops})` };
      }
      return { background: `linear-gradient(${background.gradientAngle || 90}deg, ${stops})` };
    }
    return {};
  };

  const addGradientStop = () => {
    const newStop: FrameGradientStop = { color: '#00ff00', offset: 50 };
    setBackground(prev => ({
      ...prev,
      gradientStops: [...(prev.gradientStops || []), newStop]
    }));
  };

  const updateGradientStop = (index: number, field: keyof FrameGradientStop, value: any) => {
    const newStops = [...(background.gradientStops || [])];
    newStops[index] = { ...newStops[index], [field]: value };
    setBackground(prev => ({ ...prev, gradientStops: newStops }));
  };

  const removeGradientStop = (index: number) => {
    if ((background.gradientStops || []).length <= 2) return; // Min 2 stops
    const newStops = background.gradientStops!.filter((_, i) => i !== index);
    setBackground(prev => ({ ...prev, gradientStops: newStops }));
  };

  // --- Drag & Drop Logic ---

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    setIsDragging(true);
    const el = elements.find(item => item.id === id);
    if (el) {
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      elementStartPos.current = { x: el.x, y: el.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedId) return;
    
    // Calculate delta taking zoom into account
    // We want delta relative to the canvas size
    // e.clientX is screen pixels. 
    // canvas width on screen = layoutConfig.width * zoom
    
    const deltaXPx = (e.clientX - dragStartPos.current.x) / zoom;
    const deltaYPx = (e.clientY - dragStartPos.current.y) / zoom;

    const deltaXPercent = (deltaXPx / layoutConfig.width) * 100;
    const deltaYPercent = (deltaYPx / layoutConfig.height) * 100;

    updateSelectedElement({
      x: elementStartPos.current.x + deltaXPercent,
      y: elementStartPos.current.y + deltaYPercent
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // --- Rendering Elements ---

  const renderElement = (el: FrameElement) => {
    const isSelected = el.id === selectedId;
    
    // Robust Width Fallback
    const widthVal = el.width && !isNaN(Number(el.width)) && Number(el.width) > 0 ? Number(el.width) : 20;

    // Styles
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${el.x}%`,
      top: `${el.y}%`,
      transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
      zIndex: el.zIndex + 10, // Ensure above slots
      opacity: el.opacity,
      cursor: isDragging && isSelected ? 'grabbing' : 'grab',
      border: isSelected ? '2px dashed #4f46e5' : '1px solid transparent',
    };

    if (el.type === 'text') {
      const textShadow = 
        el.effect === 'shadow' ? '4px 4px 8px rgba(0,0,0,0.5)' :
        el.effect === 'neon' ? `0 0 10px ${el.color}, 0 0 20px ${el.color}` :
        'none';
      
      const webkitTextStroke = el.effect === 'outline' ? '2px black' : 'none';

      return (
        <div 
          key={el.id}
          onMouseDown={(e) => handleMouseDown(e, el.id)}
          onClick={(e) => e.stopPropagation()} // Prevent deselection
          style={{
            ...baseStyle,
            fontFamily: el.fontFamily,
            fontSize: `${el.fontSize}px`,
            fontWeight: el.fontWeight,
            fontStyle: el.fontStyle,
            textDecoration: el.textDecoration,
            color: el.color,
            textShadow,
            WebkitTextStroke: webkitTextStroke,
            whiteSpace: 'nowrap',
            padding: '4px'
          }}
        >
          {el.content}
        </div>
      );
    } else {
      return (
        <div 
          key={el.id}
          onMouseDown={(e) => handleMouseDown(e, el.id)}
          onClick={(e) => e.stopPropagation()} // Prevent deselection
          style={{
            ...baseStyle,
            width: `${widthVal}%`,
          }}
        >
            <img 
                src={el.content} 
                alt="sticker" 
                className="w-full h-auto pointer-events-none" 
                // Removed crossOrigin to fix visibility issues
            />
        </div>
      );
    }
  };

  // --- Save ---
  const handleSave = () => {
    onSave({
      ...styleData,
      backgroundConfig: background,
      elements: elements,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-gray-900 text-white flex overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* --- Sidebar Controls --- */}
      <div className="w-80 flex flex-col bg-gray-800 border-r border-gray-700">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <div>
              <h3 className="font-bold text-lg">Frame Editor</h3>
              <p className="text-xs text-gray-400">Layout: {layoutLabel}</p>
              <p className="text-[10px] text-gray-500">{layoutConfig.width}x{layoutConfig.height}px</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button onClick={() => setActiveTab('background')} className={`flex-1 py-3 text-sm font-medium flex justify-center gap-2 ${activeTab === 'background' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-750'}`}>
            <Palette size={16} /> BG
          </button>
          <button onClick={() => setActiveTab('text')} className={`flex-1 py-3 text-sm font-medium flex justify-center gap-2 ${activeTab === 'text' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-750'}`}>
            <Type size={16} /> Text
          </button>
          <button onClick={() => setActiveTab('stickers')} className={`flex-1 py-3 text-sm font-medium flex justify-center gap-2 ${activeTab === 'stickers' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-750'}`}>
            <ImageIcon size={16} /> Asset
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* BACKGROUND TAB */}
          {activeTab === 'background' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase font-bold">Type</label>
                <div className="flex gap-2 mt-2">
                  {['transparent', 'solid', 'gradient'].map(t => (
                    <button 
                      key={t} 
                      onClick={() => changeBackgroundType(t as any)}
                      className={`px-3 py-1 text-xs rounded border ${background.type === t ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600 hover:border-gray-500'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {background.type === 'solid' && (
                <div>
                   <label className="text-xs text-gray-400 uppercase font-bold">Color</label>
                   <div className="flex items-center gap-2 mt-1">
                     <input type="color" value={background.color} onChange={(e) => setBackground(prev => ({...prev, color: e.target.value}))} className="h-8 w-8 rounded cursor-pointer bg-transparent" />
                     <span className="text-sm font-mono">{background.color}</span>
                   </div>
                </div>
              )}

              {background.type === 'gradient' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Style</label>
                    <div className="flex gap-2">
                       <button onClick={() => setBackground(p => ({...p, gradientType: 'linear'}))} className={`px-2 py-1 text-xs rounded border ${background.gradientType === 'linear' ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'}`}>Linear</button>
                       <button onClick={() => setBackground(p => ({...p, gradientType: 'radial'}))} className={`px-2 py-1 text-xs rounded border ${background.gradientType === 'radial' ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'}`}>Radial</button>
                    </div>
                  </div>
                  
                  {background.gradientType === 'linear' && (
                    <div>
                      <label className="text-xs text-gray-400 uppercase font-bold">Angle: {background.gradientAngle}°</label>
                      <input 
                        type="range" min="0" max="360" 
                        value={background.gradientAngle} 
                        onChange={(e) => setBackground(p => ({...p, gradientAngle: parseInt(e.target.value)}))}
                        className="w-full mt-1 accent-indigo-500"
                      />
                    </div>
                  )}

                  <div>
                     <div className="flex justify-between items-center mb-2">
                        <label className="text-xs text-gray-400 uppercase font-bold">Stops</label>
                        <button onClick={addGradientStop} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus size={12}/> Add</button>
                     </div>
                     <div className="space-y-2">
                        {background.gradientStops?.map((stop, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-gray-700 p-2 rounded">
                             <input type="color" value={stop.color} onChange={(e) => updateGradientStop(idx, 'color', e.target.value)} className="h-6 w-6 rounded bg-transparent cursor-pointer" />
                             <input type="range" min="0" max="100" value={stop.offset} onChange={(e) => updateGradientStop(idx, 'offset', parseInt(e.target.value))} className="flex-1 accent-indigo-500 h-2" />
                             <button onClick={() => removeGradientStop(idx)} className="text-gray-400 hover:text-red-400"><X size={14} /></button>
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TEXT TAB */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <button 
                onClick={() => addElement('text', 'Edit Text')}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm font-medium flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Add Text
              </button>

              {selectedId && getSelectedElement()?.type === 'text' ? (
                <div className="space-y-3 bg-gray-750 p-3 rounded border border-gray-600 animate-fade-in">
                  <div>
                    <label className="text-xs text-gray-400 uppercase font-bold">Content</label>
                    <input 
                      type="text" 
                      value={getSelectedElement()!.content} 
                      onChange={(e) => updateSelectedElement({ content: e.target.value })}
                      className="w-full mt-1 bg-white border border-gray-600 rounded px-2 py-1 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                       <label className="text-xs text-gray-400 uppercase font-bold">Font</label>
                       <select 
                         value={getSelectedElement()!.fontFamily} 
                         onChange={(e) => updateSelectedElement({ fontFamily: e.target.value })}
                         className="w-full mt-1 bg-white border border-gray-600 rounded px-1 py-1 text-xs text-gray-900"
                       >
                         {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                       </select>
                    </div>
                    <div>
                       <label className="text-xs text-gray-400 uppercase font-bold">Size</label>
                       <input 
                         type="number" 
                         value={getSelectedElement()!.fontSize}
                         onChange={(e) => updateSelectedElement({ fontSize: parseInt(e.target.value) })}
                         className="w-full mt-1 bg-white border border-gray-600 rounded px-2 py-1 text-xs text-gray-900"
                       />
                    </div>
                  </div>

                  <div>
                     <label className="text-xs text-gray-400 uppercase font-bold">Style</label>
                     <div className="flex gap-1 mt-1">
                        <button onClick={() => updateSelectedElement({ fontWeight: getSelectedElement()!.fontWeight === 'bold' ? 'normal' : 'bold' })} className={`p-1 rounded ${getSelectedElement()!.fontWeight === 'bold' ? 'bg-indigo-600' : 'bg-gray-600'}`}><Bold size={14}/></button>
                        <button onClick={() => updateSelectedElement({ fontStyle: getSelectedElement()!.fontStyle === 'italic' ? 'normal' : 'italic' })} className={`p-1 rounded ${getSelectedElement()!.fontStyle === 'italic' ? 'bg-indigo-600' : 'bg-gray-600'}`}><Italic size={14}/></button>
                        <button onClick={() => updateSelectedElement({ textDecoration: getSelectedElement()!.textDecoration === 'underline' ? 'none' : 'underline' })} className={`p-1 rounded ${getSelectedElement()!.textDecoration === 'underline' ? 'bg-indigo-600' : 'bg-gray-600'}`}><Underline size={14}/></button>
                         <input type="color" value={getSelectedElement()!.color} onChange={(e) => updateSelectedElement({color: e.target.value})} className="h-6 w-6 rounded cursor-pointer bg-transparent border-0" />
                     </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 uppercase font-bold">Effect</label>
                    <div className="grid grid-cols-4 gap-1 mt-1">
                      {['none', 'shadow', 'outline', 'neon'].map(ef => (
                        <button 
                          key={ef} 
                          onClick={() => updateSelectedElement({ effect: ef as any })}
                          className={`text-[10px] py-1 rounded border ${getSelectedElement()!.effect === ef ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600 hover:border-gray-500'}`}
                        >
                          {ef}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 text-sm py-4">Select text to edit</div>
              )}
            </div>
          )}

           {/* STICKERS TAB */}
           {activeTab === 'stickers' && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {stickers.map(icon => (
                  <button 
                    key={icon.id} 
                    onClick={() => addElement('sticker', icon.url)}
                    className="aspect-square bg-white rounded p-1 hover:bg-gray-200 transition-colors flex items-center justify-center overflow-hidden"
                  >
                    <img src={icon.url} className="w-full h-full object-contain" alt={icon.name} />
                  </button>
                ))}
              </div>
            </div>
           )}

           {/* COMMON CONTROLS */}
           {selectedId && (
             <div className="mt-6 pt-4 border-t border-gray-700">
                <label className="text-xs text-gray-400 uppercase font-bold mb-2 block">Transform Selected</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                   <div className="flex items-center gap-2">
                      <RotateCw size={14} className="text-gray-400" />
                      <input type="number" value={getSelectedElement()!.rotation} onChange={(e) => updateSelectedElement({rotation: parseInt(e.target.value)})} className="w-16 bg-white border-gray-600 rounded text-xs px-1 py-1 text-gray-900" />
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Opac</span>
                      <input type="number" step="0.1" max="1" min="0" value={getSelectedElement()!.opacity} onChange={(e) => updateSelectedElement({opacity: parseFloat(e.target.value)})} className="w-16 bg-white border-gray-600 rounded text-xs px-1 py-1 text-gray-900" />
                   </div>
                </div>
                 {getSelectedElement()?.type === 'sticker' && (
                   <div className="mb-2">
                      <label className="text-xs text-gray-400 block mb-1">Scale</label>
                      <input type="range" min="5" max="50" value={getSelectedElement()!.width} onChange={(e) => updateSelectedElement({width: parseInt(e.target.value)})} className="w-full accent-indigo-500" />
                   </div>
                 )}
                <button onClick={deleteElement} className="w-full py-2 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs rounded flex items-center justify-center gap-2">
                  <Trash2 size={14} /> Remove Element
                </button>
             </div>
           )}
        </div>
      </div>

      {/* --- Main Canvas Area --- */}
      <div className="flex-1 bg-gray-950 flex flex-col relative overflow-hidden">
        
        {/* Toolbar */}
        <div className="absolute top-4 right-4 flex gap-2 z-[70]">
           <div className="flex bg-gray-800 rounded mr-4">
              <button onClick={() => setZoom(z => Math.max(0.1, z - 0.05))} className="p-2 hover:bg-gray-700 rounded-l border-r border-gray-700"><ZoomOut size={16} /></button>
              <span className="px-3 py-2 text-xs font-mono min-w-[3rem] text-center">{(zoom * 100).toFixed(0)}%</span>
              <button onClick={() => setZoom(z => Math.min(1.5, z + 0.05))} className="p-2 hover:bg-gray-700 rounded-r border-l border-gray-700"><ZoomIn size={16} /></button>
           </div>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-bold flex items-center gap-2">
            <Save size={16} /> Save Frame
          </button>
        </div>

        {/* Scrollable Canvas Container */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-20">
            <div 
              className="relative bg-white shadow-2xl transition-transform origin-center"
              style={{
                width: `${layoutConfig.width}px`,
                height: `${layoutConfig.height}px`,
                transform: `scale(${zoom})`,
                ...getBackgroundStyle()
              }}
              onClick={(e) => {
                 if (e.target === e.currentTarget) {
                   setSelectedId(null);
                 }
              }}
            >
              {/* Photo Guide Grid (Bottom Layer) */}
              {layoutConfig.slots.map((slot, i) => (
                  <div 
                    key={`slot-${i}`}
                    className="absolute bg-gray-200/50 border-2 border-dashed border-gray-400 flex items-center justify-center pointer-events-none"
                    style={{
                        left: slot.x,
                        top: slot.y,
                        width: slot.width,
                        height: slot.height,
                        zIndex: 1
                    }}
                  >
                      <div className="text-gray-400 text-2xl font-bold opacity-50 flex flex-col items-center">
                          <ImageIcon size={48} />
                          <span>Photo {i + 1}</span>
                      </div>
                  </div>
              ))}

              {/* Elements Layer */}
              {elements.map(el => renderElement(el))}
            </div>
        </div>
        
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-gray-500 text-xs bg-gray-900/80 px-4 py-2 rounded-full pointer-events-none">
           Click element to edit. Drag to move. Use sidebar for styling. Zoom to adjust view.
        </div>
      </div>
    </div>
  );
};