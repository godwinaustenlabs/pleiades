import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Manually specify the version
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`;

interface AssetPreviewModalProps {
  url: string | null;
  onClose: () => void;
  type?: 'image' | 'pdf';
}

export default function AssetPreviewModal({ url, onClose, type = 'image' }: AssetPreviewModalProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);

  if (!url) return null;

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setError(null);
  }

  function onDocumentLoadError(err: Error) {
    console.error('PDF Load Error:', err);
    setError('Failed to load PDF.');
  }

  const handleDownload = () => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = 'asset.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-10"
      >
        <X className="w-6 h-6" />
      </button>
      
      {/* Container to override potential dark mode inheritance */}
      <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden isolate" style={{ colorScheme: 'light' }}>
        {type === 'pdf' ? (
          <div className="flex flex-col items-center w-full h-full pt-16">
            {error && <div className="text-red-500 bg-white p-4 rounded mb-4 z-20">{error}</div>}
            
            {/* Enabled scrolling here */}
            <div className="flex-1 overflow-y-auto w-full flex justify-center items-start p-4">
              <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                className="!bg-white !text-black rounded-xl shadow-2xl p-4"
              >
                <Page pageNumber={pageNumber} width={800 * scale} />
              </Document>
            </div>
            
            {numPages && (
              <div className="flex items-center gap-4 mt-4 mb-4 bg-white/10 p-2 rounded-full text-white px-6">
                <button 
                  disabled={pageNumber <= 1} 
                  onClick={() => setPageNumber(pageNumber - 1)}
                  className="p-1 disabled:opacity-50"
                >
                  <ChevronLeft />
                </button>
                <span>Page {pageNumber} of {numPages}</span>
                <button 
                  disabled={pageNumber >= numPages} 
                  onClick={() => setPageNumber(pageNumber + 1)}
                  className="p-1 disabled:opacity-50"
                >
                  <ChevronRight />
                </button>
                <div className="h-6 w-px bg-white/20 mx-2" />
                <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-1">
                  <ZoomOut className="w-5 h-5" />
                </button>
                <button onClick={() => setScale(s => Math.min(2, s + 0.25))} className="p-1">
                  <ZoomIn className="w-5 h-5" />
                </button>
                <div className="h-6 w-px bg-white/20 mx-2" />
                <button onClick={handleDownload} className="p-1">
                  <Download className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <img src={url} alt="Preview" className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain" />
        )}
      </div>
    </div>
  );
}
