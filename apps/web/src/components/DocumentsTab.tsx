import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Trash2, Loader2, Eye, Book } from 'lucide-react';
import AssetPreviewModal from './AssetPreviewModal';
import { API, token } from '../lib/auth';
import { errorMessage } from '../lib/errors';

export interface DocumentRecord {
	id: string;
	title: string;
	documentType: string;
	url: string;
	uploadedBy: string | null;
	createdAt: string;
}

interface DocumentsTabProps {
	/** API path for the department's documents, e.g. `/finance/documents`. */
	endpoint: string;
	/** R2 key prefix for uploads, e.g. `finance-docs`. */
	uploadPrefix: string;
	heading: string;
	description: string;
	/** Document categories offered in the upload form. */
	documentTypes: readonly string[];
	accentClass?: string;
	canEdit?: boolean;
	canDelete?: boolean;
}

/**
 * Department document store: upload to R2, list, preview, delete.
 *
 * Shared by HR and Finance — the department is decided by `endpoint`, and the
 * server scopes reads/writes to it, so this component never chooses which
 * department's documents it is touching.
 */
export default function DocumentsTab({
	endpoint,
	uploadPrefix,
	heading,
	description,
	documentTypes,
	accentClass = 'text-primary',
	canEdit = true,
	canDelete = true,
}: DocumentsTabProps) {
	const [documents, setDocuments] = useState<DocumentRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [showWizard, setShowWizard] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	const [formData, setFormData] = useState({
		title: '',
		documentType: documentTypes[0] ?? 'Other',
		file: null as File | null,
	});

	const fetchDocuments = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(`${API}${endpoint}`, { headers: { Authorization: `Bearer ${token()}` } });
			const d = await res.json();
			setDocuments(d.data || []);
		} catch (err) {
			console.error(err);
		} finally {
			setLoading(false);
		}
	}, [endpoint]);

	useEffect(() => {
		fetchDocuments();
	}, [fetchDocuments]);

	const handleUpload = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData.title.trim() || !formData.file) {
			setError('Title and file are required');
			return;
		}

		setUploading(true);
		setError(null);
		try {
			const file = formData.file;
			// Encode the name so spaces/# in filenames don't corrupt the R2 key.
			const r2Key = `${uploadPrefix}/${Date.now()}-${encodeURIComponent(file.name)}`;

			const uploadRes = await fetch(`${API}/assets/upload/${r2Key}`, {
				method: 'PUT',
				headers: {
					'Content-Type': file.type || 'application/octet-stream',
					Authorization: `Bearer ${token()}`,
				},
				body: file,
			});
			if (!uploadRes.ok) throw new Error('File upload to storage failed');
			const uploadData = await uploadRes.json();
			const fileUrl = uploadData.data?.url || `/api/assets/download/${r2Key}`;

			const metaRes = await fetch(`${API}${endpoint}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
				body: JSON.stringify({
					title: formData.title,
					documentType: formData.documentType,
					url: fileUrl,
				}),
			});
			if (!metaRes.ok) throw new Error('Failed to save document record');

			setFormData({ title: '', documentType: documentTypes[0] ?? 'Other', file: null });
			setShowWizard(false);
			fetchDocuments();
		} catch (err) {
			setError(errorMessage(err, 'Upload failed'));
		} finally {
			setUploading(false);
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm('Are you sure you want to delete this document?')) return;
		try {
			const res = await fetch(`${API}${endpoint}/${id}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token()}` },
			});
			if (!res.ok) throw new Error('Delete failed');
			setDocuments(prev => prev.filter(d => d.id !== id));
		} catch (err) {
			setError(errorMessage(err, 'Could not delete document'));
		}
	};

	const fileIcon = (url: string) => {
		if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)) return '🖼️';
		if (/\.pdf(\?|$)/i.test(url)) return '📄';
		if (/\.(doc|docx)(\?|$)/i.test(url)) return '📝';
		if (/\.(xls|xlsx|csv)(\?|$)/i.test(url)) return '📊';
		return '📎';
	};

	if (loading) {
		return <div className="flex justify-center p-12"><Loader2 className={`w-8 h-8 animate-spin ${accentClass}`} /></div>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
						<Book className={`w-6 h-6 ${accentClass}`} /> {heading}
					</h2>
					<p className="text-sm text-textSecondary mt-1">{description}</p>
				</div>
				{canEdit && (
					<button
						onClick={() => setShowWizard(true)}
						className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
					>
						<Plus className="w-4 h-4" /> Upload Document
					</button>
				)}
			</div>

			{error && (
				<div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold flex items-center justify-between">
					<span>{error}</span>
					<button onClick={() => setError(null)} className="text-xs underline hover:no-underline">Dismiss</button>
				</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{documents.map(doc => (
					<div key={doc.id} className="glass-panel p-6 rounded-3xl group border border-white/5 hover:border-primary/30 transition-all">
						<div className="flex items-start justify-between mb-4">
							<div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl group-hover:bg-primary/10 transition-colors">
								{fileIcon(doc.url)}
							</div>
							<span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-white/5 text-textSecondary rounded-lg">
								{doc.documentType}
							</span>
						</div>
						<h3 className="font-bold text-lg text-white mb-1 line-clamp-1" title={doc.title}>{doc.title}</h3>
						<p className="text-xs text-textSecondary mb-6">Added {new Date(doc.createdAt).toLocaleDateString()}</p>

						<div className="flex gap-2">
							<button
								onClick={() => setPreviewUrl(`${doc.url}${doc.url.includes('?') ? '&' : '?'}token=${token()}`)}
								className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary/10 text-primary rounded-xl font-bold text-xs hover:bg-primary/20 transition-all"
							>
								<Eye className="w-3.5 h-3.5" /> View
							</button>
							{canDelete && (
								<button
									onClick={() => handleDelete(doc.id)}
									className="p-2 bg-white/5 text-textSecondary rounded-xl hover:bg-red-500/20 hover:text-red-400 transition-all"
								>
									<Trash2 className="w-4 h-4" />
								</button>
							)}
						</div>
					</div>
				))}
				{documents.length === 0 && (
					<div className="col-span-full p-12 text-center border border-dashed border-white/10 rounded-3xl bg-white/5">
						<FileText className="w-12 h-12 text-white opacity-20 mx-auto mb-4" />
						<p className="text-textSecondary font-bold">
							{canEdit ? 'No documents yet. Upload one to get started.' : 'No documents available.'}
						</p>
					</div>
				)}
			</div>

			{showWizard && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
					<div className="w-full max-w-lg bg-surface border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
						<h3 className="text-xl font-bold text-white mb-6">Upload Document</h3>
						<form onSubmit={handleUpload} className="space-y-6">
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase tracking-widest text-textSecondary ml-1">Document Title</label>
								<input
									type="text"
									value={formData.title}
									onChange={e => setFormData({ ...formData, title: e.target.value })}
									placeholder="e.g. FY26 Audited Statements"
									className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-white"
									required
								/>
							</div>
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase tracking-widest text-textSecondary ml-1">Document Type</label>
								<select
									value={formData.documentType}
									onChange={e => setFormData({ ...formData, documentType: e.target.value })}
									className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-white"
								>
									{documentTypes.map(t => <option key={t} value={t}>{t}</option>)}
								</select>
							</div>
							<div className="space-y-2">
								<label className="text-[10px] font-black uppercase tracking-widest text-textSecondary ml-1">File</label>
								<input
									type="file"
									onChange={e => setFormData({ ...formData, file: e.target.files?.[0] || null })}
									className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 text-textSecondary"
									required
								/>
							</div>

							<div className="flex gap-4 pt-4">
								<button
									type="button"
									onClick={() => { setShowWizard(false); setError(null); }}
									className="flex-1 py-3 px-4 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-all text-sm"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={uploading}
									className="flex-1 py-3 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
								>
									{uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : 'Upload'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{previewUrl && (
				<AssetPreviewModal
					url={previewUrl}
					onClose={() => setPreviewUrl(null)}
					type={/\.pdf(\?|$)/i.test(previewUrl) ? 'pdf' : 'image'}
				/>
			)}
		</div>
	);
}
