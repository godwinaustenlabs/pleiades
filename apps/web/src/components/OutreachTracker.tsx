import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format, addDays, subDays, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { API, token } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import {
  ChevronLeft, ChevronRight, MessageSquare, Mail, CornerDownRight, Share2,
  Calendar as CalendarIcon, Loader2, Download, BarChart3, CheckCircle2,
  AlertCircle, RefreshCw, TrendingUp, Target
} from 'lucide-react';


type OutreachRecord = {
  id: string;
  date: string;
  dmsSent: number;
  emailsSent: number;
  repliesReceived: number;
  forwards: number;
  meetingsBooked: number;
  notes: string;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function OutreachTracker() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [record, setRecord] = useState<OutreachRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [view, setView] = useState<'daily' | 'report'>('daily');

  // Report state
  const [reportStart, setReportStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [reportEnd, setReportEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportData, setReportData] = useState<OutreachRecord[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  // Form state — kept in sync with `record`
  const [dmsSent, setDmsSent] = useState(0);
  const [emailsSent, setEmailsSent] = useState(0);
  const [repliesReceived, setRepliesReceived] = useState(0);
  const [forwards, setForwards] = useState(0);
  const [meetingsBooked, setMeetingsBooked] = useState(0);
  const [notes, setNotes] = useState('');

  // Track whether we successfully loaded (prevents auto-save before first fetch)
  const loadedRef = useRef(false);
  const recordRef = useRef<OutreachRecord | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchOutreach = useCallback(async (date: Date) => {
    setLoading(true);
    setFetchError(null);
    loadedRef.current = false;
    const dateStr = format(date, 'yyyy-MM-dd');

    try {
      const res = await fetch(`${API}/acquisition/outreach?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const json = await res.json();

      if (json.data && Array.isArray(json.data) && json.data.length > 0) {
        const r: OutreachRecord = json.data[0];
        setRecord(r);
        recordRef.current = r;
        setDmsSent(r.dmsSent ?? 0);
        setEmailsSent(r.emailsSent ?? 0);
        setRepliesReceived(r.repliesReceived ?? 0);
        setForwards(r.forwards ?? 0);
        setMeetingsBooked(r.meetingsBooked ?? 0);
        setNotes(r.notes ?? '');
      } else {
        // No record for this date — reset form to zero WITHOUT overwriting DB
        setRecord(null);
        recordRef.current = null;
        setDmsSent(0);
        setEmailsSent(0);
        setRepliesReceived(0);
        setForwards(0);
        setMeetingsBooked(0);
        setNotes('');
      }

      setFetchError(null);
    } catch (e) {
      console.error('[OutreachTracker] Fetch error:', e);
      setFetchError(errorMessage(e, 'Failed to load data'));
      // Do NOT reset form fields on error — keep whatever was there
    } finally {
      setLoading(false);
      // Only allow auto-save after a successful fetch
      if (!fetchError) {
        loadedRef.current = true;
      }
    }
  }, []);

  useEffect(() => {
    fetchOutreach(selectedDate);
  }, [selectedDate, fetchOutreach]);

  // ─── Save ─────────────────────────────────────────────────────────────────
  const doSave = useCallback(async () => {
    if (!loadedRef.current) return; // guard: don't save before first successful load
    setSaveStatus('saving');
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const payload = { date: dateStr, dmsSent, emailsSent, repliesReceived, forwards, meetingsBooked, notes };

    try {
      if (recordRef.current?.id) {
        // UPDATE existing record
        const res = await fetch(`${API}/acquisition/outreach/${recordRef.current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`PATCH failed: HTTP ${res.status}`);
        setSaveStatus('saved');
      } else {
        // CREATE new record
        const res = await fetch(`${API}/acquisition/outreach`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`POST failed: HTTP ${res.status}`);
        const json = await res.json();
        if (json.data?.id) {
          const newRec: OutreachRecord = { ...payload, id: json.data.id };
          setRecord(newRec);
          recordRef.current = newRec;
        }
        setSaveStatus('saved');
      }
    } catch (e) {
      console.error('[OutreachTracker] Save error:', e);
      setSaveStatus('error');
    }
  }, [selectedDate, dmsSent, emailsSent, repliesReceived, forwards, meetingsBooked, notes]);

  // Debounced auto-save — fires 1.2s after last change
  useEffect(() => {
    if (!loadedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('idle');
    debounceRef.current = setTimeout(() => {
      doSave();
    }, 1200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [dmsSent, emailsSent, repliesReceived, forwards, meetingsBooked, notes]);

  // ─── Report ───────────────────────────────────────────────────────────────
  const fetchReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const res = await fetch(
        `${API}/acquisition/outreach?start_date=${reportStart}&end_date=${reportEnd}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      const json = await res.json();
      setReportData(json.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoadingReport(false);
  }, [reportStart, reportEnd]);

  useEffect(() => {
    if (view === 'report') fetchReport();
  }, [view, fetchReport]);

  const downloadCSV = () => {
    if (reportData.length === 0) return;
    const headers = ['Date', 'DMs Sent', 'Emails Sent', 'Replies Received', 'Forwards', 'Meetings Booked', 'Notes'];
    const csvContent = [
      headers.join(','),
      ...reportData.map(r => [
        r.date, r.dmsSent, r.emailsSent, r.repliesReceived, r.forwards, r.meetingsBooked,
        `"${(r.notes || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `outreach_report_${reportStart}_to_${reportEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ─── Week nav ─────────────────────────────────────────────────────────────
  const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(start, i));

  // ─── Stat Card ────────────────────────────────────────────────────────────
  const statCard = (
    icon: React.ElementType,
    title: string,
    value: number,
    setter: (val: number) => void,
    color: string
  ) => {
    const Icon = icon;
    const colors: Record<string, { bg: string; text: string; border: string; glow: string }> = {
      blue:    { bg: 'rgba(59,130,246,0.1)',   text: '#60a5fa', border: 'rgba(59,130,246,0.2)',   glow: 'rgba(59,130,246,0.15)' },
      purple:  { bg: 'rgba(168,85,247,0.1)',   text: '#c084fc', border: 'rgba(168,85,247,0.2)',   glow: 'rgba(168,85,247,0.15)' },
      emerald: { bg: 'rgba(16,185,129,0.1)',   text: '#34d399', border: 'rgba(16,185,129,0.2)',   glow: 'rgba(16,185,129,0.15)' },
      amber:   { bg: 'rgba(245,158,11,0.1)',   text: '#fbbf24', border: 'rgba(245,158,11,0.2)',   glow: 'rgba(245,158,11,0.15)' },
      rose:    { bg: 'rgba(244,63,94,0.1)',    text: '#fb7185', border: 'rgba(244,63,94,0.2)',    glow: 'rgba(244,63,94,0.15)' },
    };
    const c = colors[color] || colors.blue;
    return (
      <div
        key={title}
        className="glass-panel p-6 rounded-2xl relative overflow-hidden group transition-all duration-300"
        style={{ border: `1px solid ${c.border}`, boxShadow: `0 0 30px ${c.glow}` }}
      >
        <div
          className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none transition-all duration-300"
          style={{ background: c.glow }}
        />
        <div className="flex flex-col items-center">
          <div className="p-3 rounded-xl mb-4" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
            <Icon className="w-6 h-6" style={{ color: c.text }} />
          </div>
          <h3 className="text-textSecondary text-xs font-bold uppercase tracking-widest mb-5 text-center">{title}</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setter(Math.max(0, value - 1))}
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xl transition-all"
              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
            >
              −
            </button>
            <input
              type="number"
              value={value}
              onChange={(e) => setter(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 bg-transparent text-center text-3xl font-black focus:outline-none"
              style={{ color: c.text }}
            />
            <button
              onClick={() => setter(value + 1)}
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xl transition-all"
              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
            >
              +
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Save status badge ────────────────────────────────────────────────────
  // A render helper, not a component: defining a component inside render remounts
  // it (and resets its state) on every render.
  const renderSaveBadge = () => {
    if (loading) return null;
    if (saveStatus === 'saving') return (
      <span className="text-sm font-semibold text-textSecondary flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-rose-400" /> Saving…
      </span>
    );
    if (saveStatus === 'saved') return (
      <span className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4" /> Saved to database
      </span>
    );
    if (saveStatus === 'error') return (
      <span className="text-sm font-semibold text-rose-400 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" /> Save failed — retry?
        <button onClick={doSave} className="underline hover:no-underline ml-1">Retry</button>
      </span>
    );
    return null;
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
      {/* Tab bar */}
      <div className="flex gap-2">
        {(['daily', 'report'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
              view === v
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                : 'bg-white/5 text-textSecondary hover:bg-white/10'
            }`}
          >
            {v === 'daily' ? 'Daily Tracker' : 'Overview & Reports'}
          </button>
        ))}
      </div>

      {/* ── DAILY VIEW ─────────────────────────────────────────────────────── */}
      {view === 'daily' && (
        <>
          {/* Week Navigator */}
          <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6 border border-white/5">
            <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
              <button onClick={() => setSelectedDate(subWeeks(selectedDate, 1))} className="p-2 bg-white/5 hover:bg-white/10 rounded-full shrink-0 transition-all">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex gap-2 shrink-0">
                {weekDays.map((d, i) => {
                  const isSelected = format(d, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
                  const isToday = format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(d)}
                      className={`flex flex-col items-center justify-center w-12 h-16 md:w-14 md:h-16 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25 border border-rose-400'
                          : isToday
                          ? 'bg-white/10 text-textPrimary border border-rose-500/30'
                          : 'bg-white/5 hover:bg-white/10 text-textSecondary border border-transparent'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest">{format(d, 'EEE')}</span>
                      <span className={`text-lg font-black ${isSelected ? 'text-white' : 'text-textPrimary'}`}>{format(d, 'd')}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setSelectedDate(addWeeks(selectedDate, 1))} className="p-2 bg-white/5 hover:bg-white/10 rounded-full shrink-0 transition-all">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 text-sm font-bold">
                <CalendarIcon className="w-4 h-4 text-rose-400" />
                {format(selectedDate, 'MMMM yyyy')}
              </div>
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-4 py-2 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 rounded-full font-bold text-sm transition-all"
              >
                Today
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {fetchError && (
            <div className="glass-panel p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm font-semibold flex-1">Could not load data: {fetchError}</span>
              <button
                onClick={() => fetchOutreach(selectedDate)}
                className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 rounded-full text-xs font-bold transition-all"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            </div>
          )}

          {/* Stats grid */}
          {loading ? (
            <div className="glass-panel p-12 rounded-2xl flex justify-center items-center border border-white/5">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-rose-400 animate-spin" />
                <span className="text-textSecondary text-sm font-semibold">Loading outreach data…</span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {statCard(MessageSquare, 'DMs Sent',      dmsSent,          setDmsSent,          'blue')}
                {statCard(Mail,          'Emails Sent',    emailsSent,       setEmailsSent,       'purple')}
                {statCard(CornerDownRight,'Replies',       repliesReceived,  setRepliesReceived,  'emerald')}
                {statCard(Share2,        'Forwards',       forwards,         setForwards,         'amber')}
                {statCard(CalendarIcon,  'Meetings',       meetingsBooked,   setMeetingsBooked,   'rose')}
              </div>

              {/* Notes */}
              <div className="glass-panel p-6 rounded-2xl border border-white/5">
                <h3 className="text-textSecondary text-xs font-bold uppercase tracking-widest mb-4">Daily Notes</h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notable insights, wins, or objections today?"
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-rose-500/50 min-h-[120px] resize-none transition-all"
                />
              </div>

              {/* Status + Manual Save */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs text-textSecondary">
                  {record ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Record ID: {record.id}</>
                  ) : (
                    <><Target className="w-3.5 h-3.5 text-amber-400" /> New record for {format(selectedDate, 'MMM d, yyyy')}</>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {renderSaveBadge()}
                  <button
                    onClick={doSave}
                    disabled={saveStatus === 'saving'}
                    className="px-5 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-full font-bold text-sm transition-all shadow-lg shadow-rose-500/25"
                  >
                    Save Now
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── REPORT VIEW ────────────────────────────────────────────────────── */}
      {view === 'report' && (
        <div className="space-y-6">
          {/* Date range + export */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-end gap-4 justify-between">
            <div className="flex flex-col md:flex-row items-end gap-4 w-full md:w-auto">
              {[
                { label: 'Start Date', value: reportStart, setter: setReportStart },
                { label: 'End Date',   value: reportEnd,   setter: setReportEnd   },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <label className="block text-xs font-bold text-textSecondary uppercase tracking-widest mb-2">{label}</label>
                  <input
                    type="date"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-rose-500/50 transition-all"
                  />
                </div>
              ))}
              <button
                onClick={fetchReport}
                className="px-5 py-2 bg-white/10 hover:bg-white/20 rounded-full font-bold text-sm transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>
            <button
              onClick={downloadCSV}
              disabled={reportData.length === 0}
              className="px-6 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full font-bold text-sm transition-all shadow-lg shadow-rose-500/25 flex items-center gap-2 w-full md:w-auto justify-center"
            >
              <Download className="w-4 h-4" /> Download CSV
            </button>
          </div>

          {/* Summary cards */}
          {reportData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Total DMs',      value: reportData.reduce((a, r) => a + (r.dmsSent || 0), 0),          color: '#60a5fa' },
                { label: 'Total Emails',   value: reportData.reduce((a, r) => a + (r.emailsSent || 0), 0),        color: '#c084fc' },
                { label: 'Total Replies',  value: reportData.reduce((a, r) => a + (r.repliesReceived || 0), 0),   color: '#34d399' },
                { label: 'Total Forwards', value: reportData.reduce((a, r) => a + (r.forwards || 0), 0),          color: '#fbbf24' },
                { label: 'Meetings',       value: reportData.reduce((a, r) => a + (r.meetingsBooked || 0), 0),    color: '#fb7185' },
              ].map(({ label, value, color }) => (
                <div key={label} className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-textSecondary">{label}</span>
                  <span className="text-3xl font-black" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Data table */}
          <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-rose-400" />
              <h3 className="font-bold text-lg">Performance Overview</h3>
              {reportData.length > 0 && (
                <span className="ml-auto text-xs font-bold text-textSecondary bg-white/5 px-3 py-1 rounded-full">
                  {reportData.length} days
                </span>
              )}
            </div>

            {loadingReport ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="w-8 h-8 text-rose-400 animate-spin" />
              </div>
            ) : reportData.length === 0 ? (
              <div className="p-12 text-center text-textSecondary">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">No outreach logged for this time period.</p>
                <p className="text-xs mt-1">Start logging daily activity to see it here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      {['Date', 'DMs', 'Emails', 'Replies', 'Forwards', 'Meetings'].map(h => (
                        <th key={h} className="p-4 text-xs font-bold uppercase tracking-widest text-textSecondary">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((r, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4 text-sm font-bold">{r.date}</td>
                        <td className="p-4 text-sm font-bold text-blue-400">{r.dmsSent}</td>
                        <td className="p-4 text-sm font-bold text-purple-400">{r.emailsSent}</td>
                        <td className="p-4 text-sm font-bold text-emerald-400">{r.repliesReceived}</td>
                        <td className="p-4 text-sm font-bold text-amber-400">{r.forwards}</td>
                        <td className="p-4 text-sm font-bold text-rose-400">{r.meetingsBooked}</td>
                      </tr>
                    ))}
                    <tr className="bg-white/5 font-black border-t border-white/10">
                      <td className="p-4 text-sm text-textSecondary uppercase tracking-widest text-xs">TOTAL</td>
                      <td className="p-4 text-sm text-blue-400">{reportData.reduce((a, r) => a + (r.dmsSent || 0), 0)}</td>
                      <td className="p-4 text-sm text-purple-400">{reportData.reduce((a, r) => a + (r.emailsSent || 0), 0)}</td>
                      <td className="p-4 text-sm text-emerald-400">{reportData.reduce((a, r) => a + (r.repliesReceived || 0), 0)}</td>
                      <td className="p-4 text-sm text-amber-400">{reportData.reduce((a, r) => a + (r.forwards || 0), 0)}</td>
                      <td className="p-4 text-sm text-rose-400">{reportData.reduce((a, r) => a + (r.meetingsBooked || 0), 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
