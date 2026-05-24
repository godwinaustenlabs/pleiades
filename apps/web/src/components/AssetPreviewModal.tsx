import React from 'react';
import { X } from 'lucide-react';

interface AssetPreviewModalProps {
  url: string | null;
  onClose: () => void;
  type?: 'image' | 'pdf';
}

export default function AssetPreviewModal({ url, onClose, type = 'image' }: AssetPreviewModalProps) {
  if (!url) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all"
      >
        <X className="w-6 h-6" />
      </button>
      
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        {type === 'pdf' ? (
          <iframe src={url} className="w-full h-full max-w-5xl max-h-[90vh] rounded-xl shadow-2xl" title="Asset Preview" />
        ) : (
          <img src={url} alt="Preview" className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain" />
        )}
      </div>
    </div>
  );
}
