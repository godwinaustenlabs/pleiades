import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, FileText, Loader2, Code2, BookOpen } from 'lucide-react';
import { filenameOf, type PreviewKind } from '../lib/preview';
import MarkdownView from './MarkdownView';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Manually specify the version
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`;

interface AssetPreviewModalProps {
  url: string | null;
  onClose: () => void;
  /**
   * How to render the asset. Use `previewTypeFor()` rather than guessing:
   * every call site used to pass `isPdf ? 'pdf' : 'image'`, so a .md or .docx
   * was fed to an <img> tag and displayed as nothing.
   */
  type?: PreviewKind;
}

export default function AssetPreviewModal({ url, onClose, type = 'image' }: AssetPreviewModalProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [text, setText] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  // An image that fails to decode falls back to the download card rather than
  // leaving a broken-image icon on screen.
  const [imageBroken, setImageBroken] = useState(false);
  // Markdown renders formatted by default; the toggle shows the raw source,
  // which matters for documents where the markup itself is the content.
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    setImageBroken(false);
    setShowSource(false);
    if (!url || (type !== 'text' && type !== 'markdown')) {
      setText(null);
      setTextError(null);
      return;
    }
    let cancelled = false;
    setText(null);
    setTextError(null);
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Could not load file (${r.status})`))))
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch((e) => {
        if (!cancelled) setTextError(e instanceof Error ? e.message : 'Could not load file');
      });
    return () => {
      cancelled = true;
    };
  }, [url, type]);

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
    // Was hard-coded to 'asset.pdf', so every download arrived misnamed.
    link.download = filenameOf(url);
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
        ) : type === 'text' || type === 'markdown' ? (
          <div className="w-full h-full flex flex-col items-center pt-16 pb-4">
            <div className="flex items-center gap-3 mb-3 text-white/80 text-xs font-black uppercase tracking-widest">
              <FileText className="w-4 h-4" />
              <span className="truncate max-w-[50vw]">{filenameOf(url)}</span>
              {type === 'markdown' && (
                <button
                  onClick={() => setShowSource((v) => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  title={showSource ? 'Show formatted' : 'Show source'}
                >
                  {showSource ? <BookOpen className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
                  {showSource ? 'Formatted' : 'Source'}
                </button>
              )}
              <button onClick={handleDownload} className="p-1 hover:text-white" title="Download">
                <Download className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto w-full max-w-4xl bg-white text-black rounded-xl shadow-2xl px-8 py-7">
              {textError ? (
                <div className="text-red-600 text-sm">{textError}</div>
              ) : text === null ? (
                <div className="flex items-center gap-2 text-sm text-black/60">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : type === 'markdown' && !showSource ? (
                <MarkdownView source={text} />
              ) : (
                <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-mono">{text}</pre>
              )}
            </div>
          </div>
        ) : type === 'image' && !imageBroken ? (
          <img
            src={url}
            alt="Preview"
            onError={() => setImageBroken(true)}
            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain"
          />
        ) : (
          // Anything the browser cannot render inline — .docx, .pages, .zip and
          // friends. Offer the file rather than a blank frame.
          <div className="flex flex-col items-center gap-4 bg-white text-black rounded-2xl shadow-2xl px-10 py-12 max-w-md text-center">
            <FileText className="w-10 h-10 text-black/40" />
            <div className="text-sm font-bold break-all">{filenameOf(url)}</div>
            <p className="text-xs text-black/60">
              This file type cannot be previewed in the browser. Download it to open in the
              appropriate application.
            </p>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-black text-white text-xs font-black uppercase tracking-widest"
            >
              <Download className="w-4 h-4" /> Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
