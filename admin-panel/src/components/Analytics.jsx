import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export default function Analytics() {
  const [data, setData] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef(null);

  // Hourly Analytics State
  const [selectedDate, setSelectedDate] = useState(null);
  const [hourlyData, setHourlyData] = useState(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const hourlyChartRef = useRef(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, title: '', content: '' });

  const fetchHourlyData = async (dateStr) => {
    setHourlyLoading(true);
    try {
      const res = await fetch(`${API_URL}/analytics/hourly?date=${dateStr}`);
      if (res.ok) setHourlyData(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setHourlyLoading(false);
    }
  };

  const handleDailyChartClick = (e) => {
    if (!data?.dailyTotals?.length || !chartRef.current) return;
    const canvas = chartRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = canvas.offsetWidth;
    const height = 200;
    const totals = data.dailyTotals.slice(-14);
    const barWidth = Math.min(30, (width - 60) / totals.length - 4);
    const chartLeft = 40;
    const chartBottom = height - 30;

    totals.forEach((d, i) => {
      const barX = chartLeft + i * (barWidth + 4) + 2;
      if (x >= barX - 2 && x <= barX + barWidth + 2 && y <= chartBottom + 10) {
        setSelectedDate(d.date);
        fetchHourlyData(d.date);
      }
    });
  };

  const handleDailyChartMouseMove = (e) => {
    if (!data?.dailyTotals?.length || !chartRef.current) {
      if (tooltip.visible) setTooltip(t => ({ ...t, visible: false }));
      return;
    }
    const canvas = chartRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = canvas.offsetWidth;
    const height = 200;
    const totals = data.dailyTotals.slice(-14);
    const maxVal = Math.max(...totals.map(d => d.totalMinutes), 1);
    const barWidth = Math.min(30, (width - 60) / totals.length - 4);
    const chartLeft = 40;
    const chartBottom = height - 30;
    const chartHeight = chartBottom - 10;

    let found = false;
    totals.forEach((d, i) => {
      const barH = (d.totalMinutes / maxVal) * chartHeight;
      const barX = chartLeft + i * (barWidth + 4) + 2;
      const barY = chartBottom - barH;
      // Hover over the drawn bar area
      if (x >= barX && x <= barX + barWidth && y >= barY && y <= chartBottom) {
        setTooltip({
          visible: true,
          x: e.clientX,
          y: e.clientY - 50,
          title: d.date,
          content: `${d.totalMinutes.toFixed(1)} mins (${d.sessions} sessions)`
        });
        found = true;
      }
    });

    if (!found && tooltip.visible) setTooltip(t => ({ ...t, visible: false }));
  };

  const handleHourlyChartMouseMove = (e) => {
    if (!hourlyData || !hourlyChartRef.current) {
      if (tooltip.visible) setTooltip(t => ({ ...t, visible: false }));
      return;
    }
    const canvas = hourlyChartRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = canvas.offsetWidth;
    const height = 180;
    const maxVal = Math.max(...hourlyData.map(d => d.minutes), 1);
    const barWidth = Math.min(20, (width - 60) / 24 - 2);
    const chartLeft = 40;
    const chartBottom = height - 30;
    const chartHeight = chartBottom - 10;

    let found = false;
    hourlyData.forEach((d, i) => {
      const barH = (d.minutes / maxVal) * chartHeight;
      const barX = chartLeft + i * (barWidth + 2) + 2;
      const barY = chartBottom - barH;
      if (barH > 0 && x >= barX && x <= barX + barWidth && y >= barY && y <= chartBottom) {
        let nextHour = d.hour === 23 ? '00:00' : `${(d.hour + 1).toString().padStart(2, '0')}:00`;
        setTooltip({
          visible: true,
          x: e.clientX,
          y: e.clientY - 50,
          title: `${d.label} - ${nextHour}`,
          content: `${d.minutes.toFixed(1)} mins (${d.sessions} sessions)`
        });
        found = true;
      }
    });

    if (!found && tooltip.visible) setTooltip(t => ({ ...t, visible: false }));
  };

  useEffect(() => {
    fetchAnalytics();
    const intervalId = setInterval(fetchAnalytics, 10000); // Poll every 10s
    return () => clearInterval(intervalId);
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [analyticsRes, sessionsRes] = await Promise.all([
        fetch(`${API_URL}/analytics`),
        fetch(`${API_URL}/analytics/sessions?limit=50`),
      ]);
      if (analyticsRes.ok) setData(await analyticsRes.json());
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      if (loading) setLoading(false);
    }
  };

  // Draw simple bar chart on canvas
  useEffect(() => {
    if (!data?.dailyTotals?.length || !chartRef.current) return;

    const canvas = chartRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.parentElement.offsetWidth;
    const height = 200;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    const totals = data.dailyTotals.slice(-14); // last 14 days
    const maxVal = Math.max(...totals.map(d => d.totalMinutes), 1);
    const barWidth = Math.min(30, (width - 60) / totals.length - 4);
    const chartLeft = 40;
    const chartBottom = height - 30;
    const chartHeight = chartBottom - 10;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = chartBottom - (chartHeight * i / 4);
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * i / 4) + 'm', chartLeft - 5, y + 3);
    }

    // Bars
    totals.forEach((d, i) => {
      const barH = (d.totalMinutes / maxVal) * chartHeight;
      const x = chartLeft + i * (barWidth + 4) + 2;
      const y = chartBottom - barH;

      // Gradient bar
      const gradient = ctx.createLinearGradient(x, y, x, chartBottom);
      gradient.addColorStop(0, '#818cf8');
      gradient.addColorStop(1, '#4f46e5');
      // Determine context color: hover/selected effects could be added later, for now solid
      if (selectedDate === d.date) {
        gradient.addColorStop(0, '#f59e0b');
        gradient.addColorStop(1, '#d97706');
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
      ctx.fill();

      // Date label
      ctx.fillStyle = selectedDate === d.date ? '#f59e0b' : '#64748b';
      ctx.font = selectedDate === d.date ? 'bold 9px Inter, sans-serif' : '9px Inter, sans-serif';
      ctx.textAlign = 'center';
      const dateLabel = d.date.slice(5); // MM-DD
      ctx.fillText(dateLabel, x + barWidth / 2, chartBottom + 14);
    });
  }, [data, selectedDate]);

  // Draw hourly chart
  useEffect(() => {
    if (!hourlyData || !hourlyChartRef.current) return;

    const canvas = hourlyChartRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.parentElement.offsetWidth;
    const height = 180;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    const maxVal = Math.max(...hourlyData.map(d => d.minutes), 1);
    const barWidth = Math.min(20, (width - 60) / 24 - 2);
    const chartLeft = 40;
    const chartBottom = height - 30;
    const chartHeight = chartBottom - 10;

    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = chartBottom - (chartHeight * i / 3);
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * i / 3) + 'm', chartLeft - 5, y + 3);
    }

    // Bars
    hourlyData.forEach((d, i) => {
      const barH = (d.minutes / maxVal) * chartHeight;
      const x = chartLeft + i * (barWidth + 2) + 2;
      const y = chartBottom - barH;

      const gradient = ctx.createLinearGradient(x, y, x, chartBottom);
      gradient.addColorStop(0, '#f59e0b');
      gradient.addColorStop(1, '#d97706');
      ctx.fillStyle = gradient;
      
      if (barH > 0) {
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
        ctx.fill();
      }

      // X-axis label (every 3 hours to save space)
      if (i % 3 === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.label, x + barWidth / 2, chartBottom + 14);
      }
    });
  }, [hourlyData]);

  if (loading) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div className="pulse-dot" style={{ width: 12, height: 12, margin: '0 auto 16px' }} />
        <p style={{ color: '#94a3b8' }}>Loading analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: '#94a3b8' }}>No analytics data available yet. Start streaming to collect data.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Tooltip */}
      {tooltip.visible && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 15,
          top: tooltip.y,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(129, 140, 248, 0.3)',
          padding: '8px 12px',
          borderRadius: 6,
          pointerEvents: 'none',
          zIndex: 1000,
          color: '#e2e8f0',
          fontSize: 12,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: '#f59e0b' }}>{tooltip.title}</div>
          <div style={{ color: '#94a3b8' }}>{tooltip.content}</div>
        </div>
      )}

      {/* Current Status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Today</p>
          <p style={{ fontSize: 28, fontWeight: 800, color: '#818cf8' }}>{data.dayName}</p>
          <p style={{ fontSize: 12, color: '#64748b' }}>{data.today} (GMT+6)</p>
        </div>
        {data.currentStatus.map((u) => (
          <div key={u.username} className="glass-card" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{u.username}</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: u.totalWatchedToday >= u.todayLimit ? '#f87171' : '#34d399' }}>
              {u.totalWatchedToday.toFixed(1)}
              <span style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8' }}> / {u.todayLimit} min</span>
            </p>
            <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
              {u.isOnline ? <><span className="pulse-dot" /> <span style={{ fontSize: 12, color: '#34d399' }}>Online</span></> : <span style={{ fontSize: 12, color: '#94a3b8' }}>Offline</span>}
            </p>
          </div>
        ))}
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Total Sessions</p>
          <p style={{ fontSize: 28, fontWeight: 800, color: '#e2e8f0' }}>{sessions.length}</p>
          <p style={{ fontSize: 12, color: '#64748b' }}>Last 50 recorded</p>
        </div>
      </div>

      {/* Daily Chart */}
      <div className="glass-card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <span>📊 Daily Watch Time (Last 14 Days)</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8' }}>Click a bar for hourly breakdown</span>
        </h3>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <canvas 
            ref={chartRef} 
            onClick={handleDailyChartClick} 
            onMouseMove={handleDailyChartMouseMove}
            onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
            style={{ cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Hourly Chart (Conditional) */}
      {selectedDate && (
        <div className="glass-card" style={{ marginBottom: 20, background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b', margin: 0 }}>
              ⏰ Hourly Breakdown: {selectedDate}
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(null)}>✕ Close</button>
          </div>
          {hourlyLoading ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Loading hourly data...</p>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <canvas 
                ref={hourlyChartRef} 
                onMouseMove={handleHourlyChartMouseMove}
                onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
              />
            </div>
          )}
        </div>
      )}

      {/* Day of Week & Per Video */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Day of Week */}
        <div className="glass-card">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
            📅 By Day of Week
          </h3>
          {Object.entries(data.dayOfWeekTotals).map(([day, mins]) => {
            const maxMins = Math.max(...Object.values(data.dayOfWeekTotals), 1);
            const pct = (mins / maxMins) * 100;
            const isBDWeekend = day === 'Friday' || day === 'Saturday';
            return (
              <div key={day} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
                    {day} {isBDWeekend ? '🎉' : ''}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{mins.toFixed(1)} min</span>
                </div>
                <div className="mini-bar">
                  <div className="mini-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Per Video */}
        <div className="glass-card">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
            🎬 By Video
          </h3>
          {data.perVideo.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>No video data yet.</p>
          ) : (
            data.perVideo.slice(0, 10).map((v) => {
              const maxMins = Math.max(...data.perVideo.map(x => x.totalMinutes), 1);
              return (
                <div key={v.title} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{v.title}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{v.totalMinutes.toFixed(1)} min</span>
                  </div>
                  <div className="mini-bar">
                    <div className="mini-bar-fill" style={{ width: `${(v.totalMinutes / maxMins) * 100}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Session Log */}
      <div className="glass-card">
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
          📝 Recent Sessions
        </h3>
        {sessions.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 20 }}>No session data yet.</p>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 300 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time (GMT+6)</th>
                  <th>User</th>
                  <th>Video</th>
                  <th>Duration</th>
                  <th>Day</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const bdTime = new Date(new Date(s.watchedAt).getTime() + 6 * 60 * 60 * 1000);
                  return (
                    <tr key={s._id}>
                      <td style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {bdTime.toISOString().slice(0, 16).replace('T', ' ')}
                      </td>
                      <td style={{ fontWeight: 500 }}>{s.username}</td>
                      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.videoTitle}</td>
                      <td style={{ color: '#818cf8', fontWeight: 600 }}>{s.durationSeconds}s</td>
                      <td>
                        <span className="badge" style={{
                          background: (s.dayOfWeek === 'Friday' || s.dayOfWeek === 'Saturday') ? 'rgba(251,191,36,0.15)' : 'rgba(129,140,248,0.15)',
                          color: (s.dayOfWeek === 'Friday' || s.dayOfWeek === 'Saturday') ? '#fbbf24' : '#818cf8',
                          border: 'none',
                        }}>
                          {s.dayOfWeek?.slice(0, 3)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
