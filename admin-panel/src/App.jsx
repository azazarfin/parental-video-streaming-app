import React, { useState } from 'react';
import './App.css';
import UserSettings from './components/UserSettings';
import VideoManager from './components/VideoManager';
import Analytics from './components/Analytics';
import DriveGuide from './components/DriveGuide';

const TABS = [
  { key: 'dashboard', label: '📊 Dashboard', icon: '📊' },
  { key: 'videos', label: '🎬 Videos', icon: '🎬' },
  { key: 'analytics', label: '📈 Analytics', icon: '📈' },
  { key: 'guide', label: '📖 Guide', icon: '📖' },
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-dark-900)' }}>
      {/* Header */}
      <header className="relative overflow-hidden" style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1e3f 100%)',
        borderBottom: '1px solid rgba(129, 140, 248, 0.15)',
      }}>
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at top right, rgba(129, 140, 248, 0.15), transparent 50%)',
        }} />
        <div className="relative max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">🎬</span>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: '#e2e8f0' }}>
              Streaming Admin
            </h1>
          </div>
          <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
            Manage videos, watch limits, and analytics — Bangladesh Time (GMT+6)
          </p>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="tab-container">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 pb-12">
        <div className="animate-in" key={activeTab}>
          {activeTab === 'dashboard' && <UserSettings />}
          {activeTab === 'videos' && <VideoManager />}
          {activeTab === 'analytics' && <Analytics />}
          {activeTab === 'guide' && <DriveGuide />}
        </div>
      </main>
    </div>
  );
}

export default App;
