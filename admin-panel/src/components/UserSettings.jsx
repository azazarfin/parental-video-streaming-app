import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export default function UserSettings() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/users`);
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // Auto-refresh every 30s
    const interval = setInterval(fetchUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateSchedule = async (userId, field, value) => {
    try {
      const res = await fetch(`${API_URL}/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchSchedule: { [field]: Number(value) } }),
      });
      if (!res.ok) throw new Error('Update failed');
      fetchUsers();
    } catch (err) {
      console.error(err);
      alert('Failed to update schedule');
    }
  };

  const handleReset = async (userId) => {
    if (!confirm('Reset watch time to 0 for today?')) return;
    try {
      const res = await fetch(`${API_URL}/users/${userId}/reset`, { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      fetchUsers();
    } catch (err) {
      console.error(err);
      alert('Failed to reset');
    }
  };

  const handleResetAll = async (userId) => {
    const input = prompt('⚠️ This will DELETE all watch history, reset watch time, and clear the session for this user. Video publishing data will NOT be affected.\n\nType "confirm" to proceed:');
    if (!input || input.trim().toLowerCase() !== 'confirm') {
      if (input !== null) alert('Reset cancelled. You must type "confirm" to proceed.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/users/${userId}/reset-all`, { method: 'POST' });
      if (!res.ok) throw new Error('Full reset failed');
      const data = await res.json();
      alert(`✅ Stats reset! ${data.watchHistoryDeleted} watch history records deleted.`);
      fetchUsers();
    } catch (err) {
      console.error(err);
      alert('Failed to reset all stats');
    }
  };

  if (loading) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div className="pulse-dot" style={{ width: 12, height: 12, margin: '0 auto 16px' }} />
        <p style={{ color: '#94a3b8' }}>Loading users...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>
          👥 User Management
        </h2>
        <button className="btn btn-ghost btn-sm" onClick={fetchUsers}>
          ↻ Refresh
        </button>
      </div>

      {users.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: '#94a3b8', fontSize: 15 }}>No users found. Run <code style={{ color: '#818cf8' }}>node seed.js</code> to create one.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {users.map((user) => {
            const todayLimit = getTodayLimit(user.watchSchedule);
            const progress = todayLimit > 0 ? Math.min((user.totalWatchedToday / todayLimit) * 100, 100) : 0;
            const isOverLimit = user.totalWatchedToday >= todayLimit;

            return (
              <div key={user._id} className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>👤</span>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>{user.username}</h3>
                      {(() => {
                        const hasRecentHeartbeat = user.lastWatchedDate && (Date.now() - new Date(user.lastWatchedDate).getTime() < 5 * 60 * 1000);
                        const isActuallyOnline = !!user.activeSessionToken && hasRecentHeartbeat;
                        return isActuallyOnline ? (
                          <span className="badge badge-success"><span className="pulse-dot" /> Online</span>
                        ) : (
                          <span className="badge" style={{ background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' }}>Offline</span>
                        );
                      })()}
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>ID: {user._id}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleReset(user._id)}>
                      Reset Today
                    </button>
                    <button className="btn btn-sm" onClick={() => handleResetAll(user._id)} style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                      🗑 Reset All Stats
                    </button>
                  </div>
                </div>

                {/* Watch Progress */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>Watch Time Today</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isOverLimit ? '#f87171' : '#34d399' }}>
                      {Math.round(user.totalWatchedToday)} / {todayLimit} min
                    </span>
                  </div>
                  <div className="mini-bar" style={{ height: 10 }}>
                    <div className="mini-bar-fill" style={{
                      width: `${progress}%`,
                      background: isOverLimit
                        ? 'linear-gradient(90deg, #f87171, #dc2626)'
                        : progress > 75
                          ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                          : 'linear-gradient(90deg, #818cf8, #6366f1)',
                    }} />
                  </div>
                </div>

                {/* Watch Schedule */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      📅 Weekdays (Sun–Thu)
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        defaultValue={user.watchSchedule?.weekday || 60}
                        min="0"
                        style={{ width: '100%' }}
                        onBlur={(e) => handleUpdateSchedule(user._id, 'weekday', e.target.value)}
                      />
                      <span style={{ color: '#94a3b8', fontSize: 13, alignSelf: 'center', whiteSpace: 'nowrap' }}>min</span>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      🎉 Weekends (Fri–Sat)
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        defaultValue={user.watchSchedule?.weekend || 120}
                        min="0"
                        style={{ width: '100%' }}
                        onBlur={(e) => handleUpdateSchedule(user._id, 'weekend', e.target.value)}
                      />
                      <span style={{ color: '#94a3b8', fontSize: 13, alignSelf: 'center', whiteSpace: 'nowrap' }}>min</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Bangladesh weekday/weekend helper (matches backend logic)
function getTodayLimit(schedule) {
  if (!schedule) return 60;
  const now = new Date();
  const bdTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const day = bdTime.getUTCDay(); // 0=Sun ... 6=Sat
  const isWeekend = day === 5 || day === 6; // Fri or Sat
  return isWeekend ? (schedule.weekend || 120) : (schedule.weekday || 60);
}
