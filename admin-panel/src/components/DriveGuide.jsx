export default function DriveGuide() {
  return (
    <div>
      <div className="glass-card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
          📖 Google Drive Setup Guide
        </h2>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          Follow these steps to connect your Google Drive folder so videos can be streamed and imported.
        </p>
      </div>

      {/* Step 1 */}
      <div className="glass-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: 'linear-gradient(135deg, #818cf8, #6366f1)', color: 'white', width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>1</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            Create a Folder in Google Drive
          </h3>
        </div>
        <div style={{ paddingLeft: 44, color: '#c8d0e0', fontSize: 14, lineHeight: 1.8 }}>
          <p>Go to <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>drive.google.com</a> and create a new folder (e.g., <strong>"Kids Videos"</strong>).</p>
          <p>Upload all your video files into this folder.</p>
        </div>
      </div>

      {/* Step 2 */}
      <div className="glass-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: 'linear-gradient(135deg, #818cf8, #6366f1)', color: 'white', width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>2</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            Share the Folder with the Service Account
          </h3>
        </div>
        <div style={{ paddingLeft: 44, color: '#c8d0e0', fontSize: 14, lineHeight: 1.8 }}>
          <p>Right-click the folder → <strong>Share</strong> → <strong>Share with people and groups</strong></p>
          <p>Add this email as a <strong>Viewer</strong>:</p>
          <div style={{
            background: 'rgba(15, 15, 35, 0.8)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            borderRadius: 10,
            padding: '12px 16px',
            fontFamily: 'monospace',
            fontSize: 13,
            color: '#818cf8',
            marginTop: 8,
            marginBottom: 8,
            wordBreak: 'break-all',
            userSelect: 'all',
          }}>
            streamer@hobby-491420.iam.gserviceaccount.com
          </div>
          <p style={{ color: '#fbbf24', fontSize: 13 }}>
            ⚠️ Make sure to set the role to <strong>"Viewer"</strong> (not Editor or Commenter).
          </p>
        </div>
      </div>

      {/* Step 3 */}
      <div className="glass-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: 'linear-gradient(135deg, #818cf8, #6366f1)', color: 'white', width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>3</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            Get the Folder ID
          </h3>
        </div>
        <div style={{ paddingLeft: 44, color: '#c8d0e0', fontSize: 14, lineHeight: 1.8 }}>
          <p>Open the folder in Google Drive. The URL will look like:</p>
          <div style={{
            background: 'rgba(15, 15, 35, 0.8)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            borderRadius: 10,
            padding: '12px 16px',
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#94a3b8',
            marginTop: 8,
            marginBottom: 8,
            wordBreak: 'break-all',
          }}>
            https://drive.google.com/drive/folders/<span style={{ color: '#34d399', fontWeight: 700 }}>1AbC2dEf3GhI4jKl5MnO6pQr7StU8vWx</span>
          </div>
          <p>The highlighted part is the <strong>Folder ID</strong>. Copy it.</p>
        </div>
      </div>

      {/* Step 4 */}
      <div className="glass-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: 'linear-gradient(135deg, #818cf8, #6366f1)', color: 'white', width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>4</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            Import Videos in the Admin Panel
          </h3>
        </div>
        <div style={{ paddingLeft: 44, color: '#c8d0e0', fontSize: 14, lineHeight: 1.8 }}>
          <p>Go to the <strong>🎬 Videos</strong> tab in this dashboard.</p>
          <p>Paste the Folder ID into <strong>"Import from Google Drive Folder"</strong> and click <strong>"Scan Folder"</strong>.</p>
          <p>You'll see all the files listed. Set the starting episode number, then click <strong>"Import All"</strong>.</p>
          <p>Videos will be added as <strong>Pending</strong>. Click <strong>"Publish"</strong> to make them available in the app.</p>
        </div>
      </div>

      {/* Step 5 */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ background: 'linear-gradient(135deg, #34d399, #059669)', color: 'white', width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>✓</span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#34d399' }}>
            Done!
          </h3>
        </div>
        <div style={{ paddingLeft: 44, color: '#c8d0e0', fontSize: 14, lineHeight: 1.8 }}>
          <p>Published videos will appear in the mobile app. Users can stream them directly.</p>
          <p>To add more videos later, just upload them to the same Drive folder and run <strong>Scan → Import</strong> again. Duplicates are automatically skipped.</p>
        </div>
      </div>
    </div>
  );
}
