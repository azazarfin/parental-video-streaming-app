import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export default function VideoManager() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [googleDriveFileId, setGoogleDriveFileId] = useState('');
  const [episodeNumber, setEpisodeNumber] = useState('');

  // Drive folder import
  const [folderId, setFolderId] = useState('');
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [startEpisode, setStartEpisode] = useState(1);
  const [importing, setImporting] = useState(false);

  // Bulk actions
  const [selectedVideos, setSelectedVideos] = useState([]);

  const fetchVideos = async () => {
    try {
      const res = await fetch(`${API_URL}/videos?limit=1000`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setVideos(data.videos || []);
      setSelectedVideos([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVideos(); }, []);

  const handleAddVideo = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, googleDriveFileId, episodeNumber: Number(episodeNumber) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setTitle(''); setGoogleDriveFileId(''); setEpisodeNumber('');
      fetchVideos();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleTogglePublish = async (id) => {
    try {
      const res = await fetch(`${API_URL}/videos/${id}/publish`, { method: 'PUT' });
      if (!res.ok) throw new Error('Failed');
      fetchVideos();
    } catch (err) {
      alert('Failed to toggle publish status');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this video permanently?')) return;
    try {
      const res = await fetch(`${API_URL}/videos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      fetchVideos();
    } catch (err) {
      alert('Failed to delete video');
    }
  };

  const handleScanFolder = async () => {
    if (!folderId.trim()) return alert('Enter a folder ID');
    setFolderLoading(true);
    setFolderFiles([]);
    try {
      const res = await fetch(`${API_URL}/drive/folder/${folderId.trim()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to scan folder');
      }
      const data = await res.json();
      setFolderFiles(data.files);
      if (data.files.length === 0) alert('No files found in this folder.');
    } catch (err) {
      alert(err.message);
    } finally {
      setFolderLoading(false);
    }
  };

  const handleImportAll = async () => {
    if (folderFiles.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`${API_URL}/videos/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: folderFiles.map(f => ({ fileId: f.fileId, name: f.name })),
          startEpisode,
        }),
      });
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      alert(data.message);
      setFolderFiles([]);
      setFolderId('');
      fetchVideos();
    } catch (err) {
      alert(`Import error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedVideos(videos.map(v => v._id));
    else setSelectedVideos([]);
  };

  const handleSelectOne = (id) => {
    if (selectedVideos.includes(id)) setSelectedVideos(selectedVideos.filter(v => v !== id));
    else setSelectedVideos([...selectedVideos, id]);
  };

  const handleBulkAction = async (action) => {
    if (selectedVideos.length === 0) return;
    if (action === 'delete' && !confirm(`Delete ${selectedVideos.length} videos permanently?`)) return;

    try {
      const res = await fetch(`${API_URL}/videos/bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, videoIds: selectedVideos }),
      });
      if (!res.ok) throw new Error('Bulk action failed');
      fetchVideos();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      {/* Manual Add */}
      <div className="glass-card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
          ➕ Add Single Video
        </h3>
        <form onSubmit={handleAddVideo}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Episode name" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={labelStyle}>Drive File ID</label>
              <input type="text" required value={googleDriveFileId} onChange={e => setGoogleDriveFileId(e.target.value)} placeholder="1A2B3C4D5E..." style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div>
              <label style={labelStyle}>Episode #</label>
              <input type="number" required value={episodeNumber} onChange={e => setEpisodeNumber(e.target.value)} placeholder="1" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary">Add to Queue</button>
          </div>
        </form>
      </div>

      {/* Drive Folder Import */}
      <div className="glass-card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>
          📁 Import from Google Drive Folder
        </h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>Folder ID</label>
            <input type="text" value={folderId} onChange={e => setFolderId(e.target.value)} placeholder="Paste folder ID from Drive URL" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ width: 100 }}>
            <label style={labelStyle}>Start Ep#</label>
            <input type="number" value={startEpisode} onChange={e => setStartEpisode(Number(e.target.value))} min="1" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <button type="button" className="btn btn-primary" onClick={handleScanFolder} disabled={folderLoading}>
            {folderLoading ? '⏳ Scanning...' : '🔍 Scan Folder'}
          </button>
        </div>

        {folderFiles.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Found {folderFiles.length} file(s):</span>
              <button 
                className="btn btn-success btn-sm" 
                onClick={handleImportAll} 
                disabled={importing}
              >
                {importing ? '⏳ Importing...' : '⬇️ Import All'}
              </button>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 10, border: '1px solid rgba(129,140,248,0.1)' }}>
              <table className="data-table">
                <thead><tr><th>#</th><th>Name</th><th>Size</th></tr></thead>
                <tbody>
                  {folderFiles.map((f, i) => (
                    <tr key={f.fileId}>
                      <td style={{ fontWeight: 600 }}>{startEpisode + i}</td>
                      <td>{f.name}</td>
                      <td style={{ color: '#94a3b8', fontSize: 12 }}>{f.size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Current Videos */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            🎞️ All Videos ({videos.length})
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={fetchVideos}>↻ Refresh</button>
        </div>

        {selectedVideos.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, padding: '10px 14px', background: 'rgba(129, 140, 248, 0.1)', borderRadius: 8 }}>
            <span style={{ color: '#818cf8', fontWeight: 600, fontSize: 13, alignSelf: 'center' }}>
              {selectedVideos.length} selected
            </span>
            <button className="btn btn-success btn-sm" onClick={() => handleBulkAction('publish')}>Publish</button>
            <button className="btn btn-warning btn-sm" onClick={() => handleBulkAction('unpublish')} style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>Unpublish</button>
            <button className="btn btn-danger btn-sm" onClick={() => handleBulkAction('delete')}>🗑️ Delete</button>
          </div>
        )}

        {loading ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: 30 }}>Loading...</p>
        ) : videos.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: 30, fontStyle: 'italic' }}>
            No videos yet. Add one above or import from a Drive folder.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input 
                      type="checkbox" 
                      checked={videos.length > 0 && selectedVideos.length === videos.length}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th>Ep</th>
                  <th>Title</th>
                  <th>File ID</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((vid) => (
                  <tr key={vid._id} style={selectedVideos.includes(vid._id) ? { background: 'rgba(129, 140, 248, 0.05)' } : {}}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedVideos.includes(vid._id)}
                        onChange={() => handleSelectOne(vid._id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ fontWeight: 700, color: '#818cf8' }}>{vid.episodeNumber}</td>
                    <td style={{ fontWeight: 500 }}>{vid.title}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>
                      {vid.googleDriveFileId.substring(0, 12)}...
                    </td>
                    <td>
                      {vid.isAvailable ? (
                        <span className="badge badge-success">Published</span>
                      ) : (
                        <span className="badge badge-warning">Pending</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          className={`btn btn-sm ${vid.isAvailable ? 'btn-ghost' : 'btn-success'}`}
                          onClick={() => handleTogglePublish(vid._id)}
                        >
                          {vid.isAvailable ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(vid._id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};
