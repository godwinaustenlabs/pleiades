import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CheckCircle, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

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
  const [containerSize] = useState(320); // Fixed crop area size
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = new Image();
    img.src = image;
    img.onload = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      setImgSize({ width: naturalWidth, height: naturalHeight });
      
      // Calculate initial zoom to cover the 320x320 area
      const minScale = Math.max(containerSize / naturalWidth, containerSize / naturalHeight);
      setZoom(minScale);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => {
      console.error("Failed to load image for cropping");
      onClose();
    };
  }, [image, containerSize, onClose]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - offset.x, y: clientY - offset.y });
  };

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setOffset({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleSave = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d', { alpha: false })!;

      const img = new Image();
      img.src = image;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Fill background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 400, 400);
      
      // Scaling factor between preview (320px) and export (400px)
      const exportScale = 400 / containerSize;
      
      const scaledW = img.naturalWidth * zoom * exportScale;
      const scaledH = img.naturalHeight * zoom * exportScale;
      
      // Calculate draw coordinates for canvas
      // In preview, image center is at 320/2 + offset.x
      // In export, image center is at 400/2 + offset.x * exportScale
      const dx = (400 / 2) - (scaledW / 2) + (offset.x * exportScale);
      const dy = (400 / 2) - (scaledH / 2) + (offset.y * exportScale);

      ctx.drawImage(img, dx, dy, scaledW, scaledH);

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (blob) {
        await onSave(blob);
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to process image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4 animate-in fade-in duration-300" onClick={e => e.stopPropagation()}>
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-white">Crop Profile Photo</h3>
          <p className="text-sm text-textSecondary">Drag to position, use slider to zoom</p>
        </div>

        <div 
          className="relative aspect-square w-full max-w-[320px] mx-auto rounded-3xl border border-white/20 bg-black overflow-hidden cursor-move shadow-2xl"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          {imgSize.width > 0 && (
            <img 
              ref={imgRef}
              src={image} 
              className="absolute top-1/2 left-1/2 select-none pointer-events-none"
              style={{ 
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transformOrigin: 'center',
                  width: imgSize.width,
                  height: imgSize.height,
                  maxWidth: 'none'
              }}
              draggable={false}
            />
          )}
          {/* Circular Overlay Mask */}
          <div className="absolute inset-0 pointer-events-none ring-[100px] ring-black/70 rounded-full border-2 border-primary/50 shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]" />
          
          {/* Guide lines */}
          <div className="absolute inset-0 pointer-events-none border border-white/10 rounded-3xl" />
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
            <ZoomOut className="w-4 h-4 text-textSecondary" />
            <input 
                type="range" 
                min={Math.max(0.1, (containerSize / Math.max(imgSize.width, imgSize.height)) * 0.5)} 
                max="3" 
                step="0.001" 
                value={zoom} 
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-primary h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-textSecondary" />
          </div>

          <div className="flex gap-4">
              <button 
                onClick={onClose} 
                disabled={uploading}
                className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-bold text-textSecondary transition-all border border-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                disabled={uploading || imgSize.width === 0} 
                className="flex-1 py-4 bg-primary hover:bg-primary/90 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Apply Crop
                  </>
                )}
              </button>
          </div>
        </div>
      </div>
    </div>
  );
}
