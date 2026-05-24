import React, { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, Loader2 } from 'lucide-react';

interface CropModalProps {
  image: string;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void>;
}

export default function CropModal({ image, onClose, onSave }: CropModalProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const img = new Image();
    img.src = image;
    img.onload = () => {
        setImgSize({ width: img.naturalWidth, height: img.naturalHeight });
        const scale = Math.max(320 / img.naturalWidth, 320 / img.naturalHeight);
        setZoom(scale);
    };
  }, [image]);

  const handleSave = async () => {
    setUploading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;

      const img = new Image();
      img.src = image;
      await new Promise(resolve => img.onload = resolve);

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 400, 400);
      
      const scaledW = img.naturalWidth * zoom;
      const scaledH = img.naturalHeight * zoom;
      
      // Calculate draw coordinates for canvas
      // The visible crop area is 320x320 at center of container
      const dx = (400 / 2) - (scaledW / 2) + offset.x;
      const dy = (400 / 2) - (scaledH / 2) + offset.y;

      ctx.drawImage(img, dx, dy, scaledW, scaledH);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (blob) await onSave(blob);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-lg space-y-6">
        <div 
          className="relative aspect-square w-full max-w-[320px] mx-auto rounded-3xl border border-white/10 bg-black overflow-hidden cursor-move"
          onMouseDown={(e) => { 
              setIsDragging(true); 
              setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); 
          }}
          onMouseMove={(e) => { 
              if (isDragging) {
                  setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
              }
          }}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          <div 
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                width: imgSize.width,
                height: imgSize.height,
                backgroundImage: `url(${image})`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center'
            }}
          />
          <div className="absolute inset-0 pointer-events-none ring-[100px] ring-black/60 rounded-full border-2 border-primary" />
        </div>

        <input 
            type="range" 
            min="0.5" max="3" step="0.01" 
            value={zoom} 
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-primary h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
        />
        <div className="flex gap-4">
            <button onClick={onClose} className="flex-1 py-3 bg-white/5 rounded-2xl text-sm font-bold text-textSecondary">Cancel</button>
            <button onClick={handleSave} disabled={uploading} className="flex-1 py-3 bg-primary text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Save
            </button>
        </div>
      </div>
    </div>
  );
}
