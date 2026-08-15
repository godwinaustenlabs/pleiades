import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface CalendarViewProps {
  tasks: any[];
  appointments: any[];
  onEditTask?: (task: any) => void;
  onUpdateTask?: (taskId: string, updates: any) => Promise<void>;
}

export default function CalendarView({ tasks, appointments, onEditTask, onUpdateTask }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  
  // side can be 'start' (stretch left), 'end' (stretch right), or 'both' (drag whole task)
  const [isDragging, setIsDragging] = useState<{
    id: string;
    side: 'start' | 'end' | 'both';
    originalX: number;
    originalY: number;
    originalWeekIndex: number;
    originalColIndex: number;
    originalDateStart: string;
    originalDateEnd: string;
    currentDeltaDays: number;
  } | null>(null);
  const [wasDragged, setWasDragged] = useState(false);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const monthData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    
    // Pad previous month
    const prevMonthYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevMonthDays = daysInMonth(prevMonthYear, prevMonth);
    const prevMonthPadding = Array.from({ length: startDay }, (_, i) => ({
      day: prevMonthDays - startDay + i + 1,
      month: prevMonth,
      year: prevMonthYear,
      currentMonth: false
    }));

    const currentMonthDays = Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      month,
      year,
      currentMonth: true
    }));

    // Total 42 cells (6 rows)
    const nextMonthYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextMonthPadding = Array.from({ length: 42 - prevMonthPadding.length - currentMonthDays.length }, (_, i) => ({
      day: i + 1,
      month: nextMonth,
      year: nextMonthYear,
      currentMonth: false
    }));

    const allDays = [...prevMonthPadding, ...currentMonthDays, ...nextMonthPadding];
    // Chunk into weeks
    const weeks = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }
    return weeks;
  }, [currentDate]);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const getEventsForWeek = (week: any[]) => {
    const weekStart = new Date(week[0].year, week[0].month, week[0].day);
    weekStart.setHours(0,0,0,0);
    const weekEnd = new Date(week[6].year, week[6].month, week[6].day);
    weekEnd.setHours(23,59,59,999);

    const weekEvents: any[] = [];

    tasks.forEach(t => {
      let start = new Date(t.startDate || t.createdAt);
      let end = t.dueDate ? new Date(t.dueDate) : new Date(start);

      // Apply drag preview offset dynamically in real time
      const isDraggingThis = isDragging && isDragging.id === t.id;
      if (isDraggingThis && isDragging.currentDeltaDays !== 0) {
        const daysMoved = isDragging.currentDeltaDays;
        if (isDragging.side === 'start' || isDragging.side === 'both') {
          start.setDate(start.getDate() + daysMoved);
        }
        if (isDragging.side === 'end' || isDragging.side === 'both') {
          end.setDate(end.getDate() + daysMoved);
        }
      }

      start.setHours(0,0,0,0);
      end.setHours(0,0,0,0);

      if (start <= weekEnd && end >= weekStart) {
        // Calculate segment within this week
        const segmentStart = start < weekStart ? 0 : start.getDay();
        const segmentEnd = end > weekEnd ? 6 : end.getDay();
        weekEvents.push({
          ...t,
          type: 'task',
          segmentStart,
          segmentEnd,
          isStart: start >= weekStart,
          isEnd: end <= weekEnd,
          isPreview: isDraggingThis && isDragging.currentDeltaDays !== 0
        });
      }
    });

    appointments.forEach(a => {
      const date = new Date(a.appointmentDate);
      date.setHours(0,0,0,0);
      if (date >= weekStart && date <= weekEnd) {
        weekEvents.push({
          ...a,
          type: 'appt',
          segmentStart: date.getDay(),
          segmentEnd: date.getDay(),
          isStart: true,
          isEnd: true
        });
      }
    });

    return weekEvents;
  };

  const getCoordinatesFromClient = (clientX: number, clientY: number) => {
    const weekElements = containerRef.current?.querySelectorAll('.week-row');
    if (!weekElements || weekElements.length === 0) return { weekIndex: 0, colIndex: 0 };
    
    let weekIndex = 0;
    let found = false;
    
    for (let i = 0; i < weekElements.length; i++) {
      const rect = weekElements[i].getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        weekIndex = i;
        found = true;
        break;
      }
    }
    
    if (!found) {
      const firstRect = weekElements[0].getBoundingClientRect();
      const lastRect = weekElements[weekElements.length - 1].getBoundingClientRect();
      if (clientY < firstRect.top) weekIndex = 0;
      else weekIndex = weekElements.length - 1;
    }
    
    const activeRowRect = weekElements[weekIndex].getBoundingClientRect();
    const colWidth = activeRowRect.width / 7;
    const relativeX = clientX - activeRowRect.left;
    const colIndex = Math.max(0, Math.min(6, Math.floor(relativeX / colWidth)));
    
    return { weekIndex, colIndex };
  };

  const handleMouseDown = (e: React.MouseEvent, event: any, side: 'start' | 'end' | 'both') => {
    e.stopPropagation();
    const { weekIndex, colIndex } = getCoordinatesFromClient(e.clientX, e.clientY);
    setIsDragging({
      id: event.id,
      side,
      originalX: e.clientX,
      originalY: e.clientY,
      originalWeekIndex: weekIndex,
      originalColIndex: colIndex,
      originalDateStart: event.startDate || event.createdAt,
      originalDateEnd: event.dueDate || event.startDate || event.createdAt,
      currentDeltaDays: 0
    });
  };

  const handleMouseMove = (e: globalThis.MouseEvent) => {
    if (!isDragging) return;
    
    const { weekIndex, colIndex } = getCoordinatesFromClient(e.clientX, e.clientY);
    const weeksMoved = weekIndex - isDragging.originalWeekIndex;
    const colsMoved = colIndex - isDragging.originalColIndex;
    const totalDaysMoved = weeksMoved * 7 + colsMoved;
    
    if (totalDaysMoved !== isDragging.currentDeltaDays) {
      setIsDragging(prev => prev ? { ...prev, currentDeltaDays: totalDaysMoved } : null);
      setWasDragged(true);
    }
  };

  const handleMouseUp = async () => {
    if (!isDragging) return;
    
    const daysMoved = isDragging.currentDeltaDays;

    if (daysMoved !== 0 && onUpdateTask) {
      const start = new Date(isDragging.originalDateStart);
      const end = isDragging.originalDateEnd ? new Date(isDragging.originalDateEnd) : new Date(start);
      
      const updates: any = {};
      
      if (isDragging.side === 'start' || isDragging.side === 'both') {
        start.setDate(start.getDate() + daysMoved);
        updates.startDate = formatDate(start);
      }
      if (isDragging.side === 'end' || isDragging.side === 'both') {
        end.setDate(end.getDate() + daysMoved);
        updates.dueDate = formatDate(end);
      }

      if (start <= end) {
        await onUpdateTask(isDragging.id, updates);
      }
    }
    
    setIsDragging(null);
    setTimeout(() => setWasDragged(false), 100);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isDragging.side === 'both' ? 'grabbing' : 'ew-resize';
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  // Chronological Monthly Agenda Events for Mobile Agenda timeline
  const monthEvents = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const list: any[] = [];

    tasks.forEach(t => {
      const start = new Date(t.startDate || t.createdAt);
      const end = t.dueDate ? new Date(t.dueDate) : new Date(start);
      const firstOfMonth = new Date(year, month, 1);
      const lastOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
      if (start <= lastOfMonth && end >= firstOfMonth) {
        list.push({ ...t, type: 'task', sortDate: start });
      }
    });

    appointments.forEach(a => {
      const date = new Date(a.appointmentDate);
      if (date.getFullYear() === year && date.getMonth() === month) {
        list.push({ ...a, type: 'appt', sortDate: date });
      }
    });

    return list.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
  }, [tasks, appointments, currentDate]);

  return (
    <div ref={containerRef} className="glass-panel md:rounded-[2.5rem] overflow-hidden border border-white/10 animate-in fade-in duration-700 shadow-2xl">
      {/* Header */}
      <div className="p-5 md:p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 bg-white/[0.03] backdrop-blur-3xl">
        <div className="flex items-center gap-4 md:gap-5">
          <div className="w-10 h-10 md:w-14 md:h-14 bg-primary/20 rounded-xl md:rounded-2xl flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
            <CalendarIcon className="w-5 h-5 md:w-7 md:h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl md:text-3xl font-black tracking-tight text-white">{monthName} <span className="text-white/40">{currentDate.getFullYear()}</span></h2>
            <div className="flex items-center gap-2 mt-0.5 md:mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-textSecondary">Unified Production Timeline</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 p-1 rounded-xl md:rounded-2xl border border-white/10 w-full md:w-auto justify-between">
            <button onClick={prevMonth} className="p-2 md:p-2.5 hover:bg-white/10 rounded-lg md:rounded-xl transition-all text-textSecondary hover:text-white"><ChevronLeft className="w-5 h-5 md:w-6 h-6" /></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-4 md:px-6 py-2 md:py-2.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:text-primary transition-all">Today</button>
            <button onClick={nextMonth} className="p-2 md:p-2.5 hover:bg-white/10 rounded-lg md:rounded-xl transition-all text-textSecondary hover:text-white"><ChevronRight className="w-5 h-5 md:w-6 h-6" /></button>
          </div>
        </div>
      </div>

      {/* Desktop Calendar Grid */}
      <div className="hidden md:block overflow-x-auto no-scrollbar">
        <div className="min-w-[800px] md:min-w-0">
          {/* Days Header */}
          <div className="grid grid-cols-7 border-b border-white/5 bg-white/[0.01]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-4 text-center text-[10px] font-black uppercase tracking-[0.3em] text-textSecondary/50">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex flex-col divide-y divide-white/5 border-l border-t border-white/5">
            {monthData.map((week, wi) => {
              const weekEvents = getEventsForWeek(week);
              
              return (
                <div key={wi} className="week-row relative min-h-[100px] md:min-h-[140px] flex flex-col">
                  {/* Day Numbers Row */}
                  <div className="grid grid-cols-7 flex-shrink-0">
                    {week.map((d, di) => {
                      const isToday = new Date().toDateString() === new Date(d.year, d.month, d.day).toDateString();
                      return (
                        <div key={di} className={`p-2 md:p-3 border-r border-white/5 h-10 md:h-12 ${!d.currentMonth ? 'bg-black/20' : ''}`}>
                          <span className={`text-[10px] md:text-[11px] font-black w-6 h-6 md:w-7 md:h-7 inline-flex items-center justify-center transition-all ${
                            isToday 
                              ? 'bg-primary text-white rounded-lg shadow-lg shadow-primary/30 scale-110' 
                              : d.currentMonth ? 'text-white/80' : 'text-white/20'
                          }`}>
                            {d.day}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Events Row(s) */}
                  <div className="flex-1 relative pb-4">
                    {/* Background lines for days */}
                    <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                      {week.map((_, di) => (
                        <div key={di} className="border-r border-white/5 h-full" />
                      ))}
                    </div>

                    {/* Event Bars */}
                    <div className="relative z-10 space-y-1 mt-1">
                      {weekEvents.map((event, ei) => {
                        const startCol = event.segmentStart;
                        const endCol = event.segmentEnd;
                        const isTask = event.type === 'task';
                        const isPreview = event.isPreview;

                        const span = Math.max(1, endCol - startCol + 1);

                        return (
                          <div 
                            key={`${event.id}-${ei}`}
                            className="grid grid-cols-7 w-full px-1 relative"
                          >
                            <div 
                              style={{ gridColumn: `${startCol + 1} / span ${span}` }}
                              className={`relative group/item px-3 py-1.5 rounded-lg text-[9px] font-bold leading-tight cursor-pointer transition-colors border shadow-sm ${
                                isPreview ? 'opacity-50 scale-[0.98] z-50 shadow-xl' : ''
                              } ${
                                event.type === 'appt' 
                                  ? 'bg-accent/20 text-accent border-accent/30 hover:bg-accent/30' 
                                  : event.status === 'completed' 
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                                    : event.status === 'blocked'
                                      ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                                      : event.status === 'in_progress'
                                        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30'
                                        : 'bg-primary/20 text-primary border-primary/30 hover:bg-primary/30'
                              } ${!event.isStart && !isPreview ? 'rounded-l-none border-l-transparent' : ''} ${!event.isEnd && !isPreview ? 'rounded-r-none border-r-transparent' : ''}`}
                              onClick={() => {
                                if (isTask && !wasDragged) onEditTask?.(event);
                              }}
                              onMouseDown={(e) => {
                                if (isTask && !isDragging) handleMouseDown(e, event, 'both');
                              }}
                            >
                              <div className="flex items-center gap-1.5 overflow-hidden select-none pointer-events-none">
                                {event.isStart && (
                                  <div className={`w-1 h-1 rounded-full flex-shrink-0 ${
                                    event.type === 'appt' ? 'bg-accent' : event.status === 'completed' ? 'bg-emerald-400' : event.status === 'blocked' ? 'bg-red-400' : event.status === 'in_progress' ? 'bg-yellow-400' : 'bg-primary'
                                  }`} />
                                )}
                                <span className="truncate">{event.title || event.roleOrTitle}</span>
                              </div>

                              {/* Resize Handles */}
                              {isTask && event.isStart && (
                                <div 
                                  onMouseDown={(e) => handleMouseDown(e, event, 'start')}
                                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 transition-colors z-20" 
                                />
                              )}
                              {isTask && event.isEnd && (
                                <div 
                                  onMouseDown={(e) => handleMouseDown(e, event, 'end')}
                                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 transition-colors z-20" 
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile Agenda View */}
      <div className="block md:hidden p-4 space-y-4 bg-white/[0.01]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-textSecondary">Monthly Agenda Timeline</h3>
          <span className="text-[10px] font-bold bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full text-textSecondary">
            {monthEvents.length} Event{monthEvents.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="space-y-3">
          {monthEvents.map((event, idx) => {
            const eventDate = new Date(event.sortDate);
            const dayStr = eventDate.getDate();
            const weekdayStr = eventDate.toLocaleDateString('default', { weekday: 'short' });
            const isTask = event.type === 'task';

            return (
              <div 
                key={`${event.id}-${idx}`}
                onClick={() => {
                  if (isTask) onEditTask?.(event);
                }}
                className={`glass-panel p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all active:scale-[0.98] cursor-pointer ${
                  event.type === 'appt' 
                    ? 'bg-accent/5 border-accent/20 hover:bg-accent/10' 
                    : event.status === 'completed' 
                      ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                      : event.status === 'blocked'
                        ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
                        : event.status === 'in_progress'
                          ? 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10'
                          : 'bg-primary/5 border-primary/20 hover:bg-primary/10'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Date Block */}
                  <div className="flex-shrink-0 text-center w-12 py-1.5 bg-white/5 border border-white/10 rounded-xl">
                    <p className="text-[9px] font-black text-textSecondary uppercase tracking-widest leading-none">{weekdayStr}</p>
                    <p className="text-lg font-black text-white leading-none mt-1">{dayStr}</p>
                  </div>

                  {/* Content Block */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        event.type === 'appt'
                          ? 'bg-accent/10 text-accent border border-accent/20'
                          : 'bg-primary/10 text-primary border border-primary/20'
                      }`}>
                        {event.type === 'appt' ? 'Appointment' : 'Task'}
                      </span>
                      
                      {isTask && (
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          event.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          event.status === 'blocked' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                        }`}>
                          {event.status}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-white truncate max-w-[200px]" title={event.title || event.roleOrTitle}>
                      {event.title || event.roleOrTitle}
                    </h4>
                    <p className="text-[10px] text-textSecondary truncate mt-0.5">
                      {isTask 
                        ? `Due: ${event.dueDate || 'No due date'}` 
                        : `${event.termType || 'Special'} • ${event.appointmentDate}`
                      }
                    </p>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <div className={`w-2 h-2 rounded-full ${
                    event.type === 'appt' 
                      ? 'bg-accent' 
                      : event.status === 'completed' 
                        ? 'bg-emerald-400' 
                        : event.status === 'blocked' 
                          ? 'bg-red-400' 
                          : event.status === 'in_progress'
                            ? 'bg-yellow-400'
                            : 'bg-primary'
                  }`} />
                </div>
              </div>
            );
          })}

          {monthEvents.length === 0 && (
            <div className="p-12 text-center text-textSecondary">
              <p className="text-sm italic">No tasks or appointments scheduled for this month.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
