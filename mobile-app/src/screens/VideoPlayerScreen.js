import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, BackHandler,
  ActivityIndicator, FlatList, Dimensions, StatusBar,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ScreenCapture from 'expo-screen-capture';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.10.100:5000/api';
const RESUME_PREFIX = '@resume_';
const SCREEN_WIDTH = Dimensions.get('window').width;
const VIDEO_HEIGHT = (SCREEN_WIDTH * 9) / 16;

// Only values valid on Android: 'contain', 'cover', 'fill'
const ASPECT_MODES = [
  { label: 'Fit', contentFit: 'contain' },
  { label: 'Crop', contentFit: 'cover' },
  { label: 'Stretch', contentFit: 'fill' },
  { label: '16:9', contentFit: 'cover', ratio: 16 / 9 },
  { label: '18:9', contentFit: 'cover', ratio: 18 / 9 },
];

export default function VideoPlayerScreen({ route, navigation }) {
  const { video: initialVideo, userId, sessionToken, playlist = [] } = route.params;
  const { logout } = useAuth();
  const { colors } = useTheme();

  const [currentVideo, setCurrentVideo] = useState(initialVideo);
  const videoFileId = currentVideo.googleDriveFileId;

  const [limitReached, setLimitReached] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [videoSource, setVideoSource] = useState(null);
  const [hasResumed, setHasResumed] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [resumeData, setResumeData] = useState({});

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectModeIndex, setAspectModeIndex] = useState(0);
  const [contentFitValue, setContentFitValue] = useState('contain');

  const isPlayingRef = useRef(false);
  const resumePositionRef = useRef(0);
  const lastSavedPositionRef = useRef(0);
  const playerRef = useRef(null);
  const currentVideoRef = useRef(currentVideo);

  useEffect(() => { currentVideoRef.current = currentVideo; }, [currentVideo]);

  // ── Orientation: only restore portrait when leaving the screen entirely ──
  // Orientation changes are handled in enterFullscreen() / exitFullscreen() only.
  // This avoids useEffect cleanup racing with the lock calls.
  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      StatusBar.setHidden(false, 'fade');
    };
  }, []);

  // ── Back button ──
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFullscreen) {
        exitFullscreen();
        return true;
      }
      safeGoBack();
      return true;
    });
    return () => backHandler.remove();
  }, [isFullscreen, videoFileId]);

  // ── Resume data ──
  const loadResumeData = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const resumeKeys = keys.filter((k) => k.startsWith(RESUME_PREFIX));
      if (resumeKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(resumeKeys);
        const data = {};
        pairs.forEach(([key, val]) => {
          if (val) {
            const id = key.replace(RESUME_PREFIX, '');
            data[id] = JSON.parse(val);
          }
        });
        setResumeData(data);
      }
    } catch (err) {}
  }, []);

  useEffect(() => { loadResumeData(); }, [loadResumeData]);

  // 1. Fetch streaming token
  useEffect(() => {
    setVideoSource(null);
    setIsBuffering(true);
    setHasResumed(false);
    setErrorMsg('');
    resumePositionRef.current = 0;
    lastSavedPositionRef.current = 0;

    const fetchAuthToken = async () => {
      try {
        const endpoint = `${API_URL}/stream/${videoFileId}?userId=${userId}&sessionToken=${sessionToken}`;
        const res = await axios.get(endpoint);
        setVideoSource({
          uri: res.data.url,
          headers: { Authorization: `Bearer ${res.data.token}` },
        });
      } catch (err) {
        if (err.response?.status === 403) {
          if (err.response.data?.kicked) {
            Alert.alert('Session Expired', 'Another device has logged in.', [
              { text: 'OK', onPress: () => logout() },
            ]);
          } else {
            handleLimitReached();
          }
        } else {
          setErrorMsg('Failed to load video stream');
        }
      }
    };

    AsyncStorage.getItem(RESUME_PREFIX + videoFileId).then((val) => {
      if (val) {
        const parsed = JSON.parse(val);
        resumePositionRef.current = parsed.position || 0;
      }
    });

    if (!limitReached) fetchAuthToken();
  }, [videoFileId, userId, sessionToken, limitReached]);

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
  });

  useEffect(() => { playerRef.current = player; }, [player]);

  // 2. Prevent screen recording
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => { ScreenCapture.allowScreenCaptureAsync().catch(() => {}); };
  }, []);

  // 3. Player events + resume + auto-advance
  useEffect(() => {
    if (!player) return;

    const statusSub = player.addListener('statusChange', (payload) => {
      const playing = payload.status === 'readyToPlay' && player.playing;
      isPlayingRef.current = playing;

      if (payload.status === 'readyToPlay') {
        setIsBuffering(false);
        if (!hasResumed && resumePositionRef.current > 0) {
          try { player.currentTime = resumePositionRef.current; } catch (e) {}
          setHasResumed(true);
        }
      }
      if (payload.status === 'loading') {
        setIsBuffering(true);
      }
      if (payload.error) {
        const msg = payload.error.message || String(payload.error);
        if (msg.includes('403') || msg.includes('Forbidden')) {
          handleLimitReached();
        } else {
          setErrorMsg('Error loading video');
        }
      }
    });

    const playSub = player.addListener('playingChange', (payload) => {
      isPlayingRef.current = payload.isPlaying;
    });

    let endSub;
    try {
      endSub = player.addListener('playToEnd', () => {
        const cur = currentVideoRef.current;
        const idx = playlist.findIndex((v) => v.googleDriveFileId === cur.googleDriveFileId);
        if (idx >= 0 && idx < playlist.length - 1) {
          switchVideo(playlist[idx + 1]);
        }
      });
    } catch (e) {}

    return () => {
      statusSub.remove();
      playSub.remove();
      if (endSub) endSub.remove();
    };
  }, [player, hasResumed]);

  // 4. Save position every 5s
  useEffect(() => {
    if (!player) return;
    const saveInterval = setInterval(() => {
      try {
        if (player && player.currentTime > 0) {
          lastSavedPositionRef.current = player.currentTime;
          const cur = currentVideoRef.current;
          AsyncStorage.setItem(
            RESUME_PREFIX + cur.googleDriveFileId,
            JSON.stringify({ position: player.currentTime, title: cur.title, ep: cur.episodeNumber })
          );
        }
      } catch (e) {}
    }, 5000);
    return () => clearInterval(saveInterval);
  }, [player]);

  // 4b. Enforce 1.0x Speed
  useEffect(() => {
    if (!player) return;
    const speedEnforcer = setInterval(() => {
      try {
        if (player.playbackRate !== 1.0) player.playbackRate = 1.0;
      } catch (e) {}
    }, 500);
    return () => clearInterval(speedEnforcer);
  }, [player]);

  // 5. Heartbeat
  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (isPlayingRef.current && !limitReached) {
        try {
          const cur = currentVideoRef.current;
          const res = await axios.post(`${API_URL}/heartbeat`, {
            userId, duration: 10, sessionToken, videoId: cur.googleDriveFileId,
          }, { timeout: 8000 });
          if (res.data.limitReached) handleLimitReached();
        } catch (err) {
          if (err.response?.status === 403) {
            if (err.response.data?.kicked) {
              Alert.alert('Session Expired', 'Another device has logged in.', [
                { text: 'OK', onPress: () => logout() },
              ]);
            } else {
              handleLimitReached();
            }
          }
        }
      }
    }, 10000);
    return () => clearInterval(intervalId);
  }, [limitReached, userId, sessionToken]);

  // ──── Helpers ────

  const handleLimitReached = () => {
    setLimitReached(true);
    isPlayingRef.current = false;
    try { if (playerRef.current) playerRef.current.pause(); } catch (e) {}
  };

  const currentIndex = playlist.findIndex((v) => v.googleDriveFileId === videoFileId);
  const hasNext = currentIndex < playlist.length - 1;
  const hasPrev = currentIndex > 0;

  const playNext = () => { if (hasNext) switchVideo(playlist[currentIndex + 1]); };
  const playPrev = () => { if (hasPrev) switchVideo(playlist[currentIndex - 1]); };

  const safeGoBack = () => {
    if (lastSavedPositionRef.current > 0) {
      AsyncStorage.setItem(
        RESUME_PREFIX + videoFileId,
        JSON.stringify({ position: lastSavedPositionRef.current, title: currentVideo.title, ep: currentVideo.episodeNumber })
      );
    }
    navigation.goBack();
  };

  const switchVideo = (newVideo) => {
    if (lastSavedPositionRef.current > 0) {
      AsyncStorage.setItem(
        RESUME_PREFIX + videoFileId,
        JSON.stringify({ position: lastSavedPositionRef.current, title: currentVideo.title, ep: currentVideo.episodeNumber })
      );
    }
    try { if (playerRef.current) playerRef.current.pause(); } catch (e) {}
    setCurrentVideo(newVideo);
  };

  const enterFullscreen = () => {
    setIsFullscreen(true);
    setContentFitValue('contain');
    setAspectModeIndex(0);
    StatusBar.setHidden(true, 'fade');
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  };

  const exitFullscreen = () => {
    setIsFullscreen(false);
    setContentFitValue('contain');
    setAspectModeIndex(0);
    StatusBar.setHidden(false, 'fade');
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  };

  const cycleAspectMode = () => {
    const nextIndex = (aspectModeIndex + 1) % ASPECT_MODES.length;
    setAspectModeIndex(nextIndex);
    setContentFitValue(ASPECT_MODES[nextIndex].contentFit);
  };

  const formatTime = (seconds) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ──────────────────────────────────────────
  // RENDER — SINGLE VideoView, never changes position in tree
  // The video container is always the 1st child.
  // In portrait: fixed height. In fullscreen: flex:1 fills screen.
  // ──────────────────────────────────────────

  const renderPlaylistItem = ({ item }) => {
    const isCurrentlyPlaying = item.googleDriveFileId === videoFileId;
    const hasResume = resumeData[item.googleDriveFileId];
    return (
      <TouchableOpacity
        style={[
          styles.playlistItem,
          {
            backgroundColor: isCurrentlyPlaying ? colors.surfaceLight : colors.surface,
            borderColor: isCurrentlyPlaying ? colors.primary : colors.cardBorder,
          },
        ]}
        activeOpacity={0.7}
        onPress={() => { if (!isCurrentlyPlaying) switchVideo(item); }}
      >
        {isCurrentlyPlaying && (
          <View style={[styles.nowPlayingBar, { backgroundColor: colors.primary }]} />
        )}
        <View style={[styles.plEpBadge, { backgroundColor: isCurrentlyPlaying ? colors.primary : colors.primaryDark }]}>
          <Text style={styles.plEpNum}>{item.episodeNumber}</Text>
        </View>
        <View style={styles.plInfo}>
          <Text style={[styles.plTitle, { color: isCurrentlyPlaying ? colors.primary : colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.plSub, { color: colors.textMuted }]}>
            {isCurrentlyPlaying
              ? '▶  Now Playing'
              : hasResume
                ? `Resume from ${formatTime(hasResume.position)}`
                : 'Tap to play'}
          </Text>
        </View>
        {!isCurrentlyPlaying && (
          <View style={[styles.plPlayBtn, { backgroundColor: colors.tabBg }]}>
            <Text style={{ color: colors.primary, fontSize: 12 }}>▶</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderListHeader = () => (
    <View>
      <View style={[styles.videoInfoSection, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.videoInfoRow}>
          <View style={styles.videoInfoLeft}>
            <Text style={[styles.videoTitle, { color: colors.text }]} numberOfLines={2}>
              {currentVideo.title}
            </Text>
            <Text style={[styles.videoEp, { color: colors.textSecondary }]}>
              Episode {currentVideo.episodeNumber}
              {playlist.length > 0 && ` · ${currentIndex + 1} of ${playlist.length}`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={safeGoBack}
            style={[styles.backBtn, { backgroundColor: colors.tabBg }]}
            activeOpacity={0.7}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>✕ Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[styles.controlBtn, { backgroundColor: hasPrev ? colors.primaryDark : colors.tabBg }]}
            onPress={playPrev}
            disabled={!hasPrev}
            activeOpacity={0.7}
          >
            <Text style={[styles.controlBtnText, { opacity: hasPrev ? 1 : 0.3 }]}>⏮  Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, { backgroundColor: colors.primaryDark }]}
            onPress={enterFullscreen}
            activeOpacity={0.7}
          >
            <Text style={styles.controlBtnText}>⛶  Fullscreen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, { backgroundColor: hasNext ? colors.primaryDark : colors.tabBg }]}
            onPress={playNext}
            disabled={!hasNext}
            activeOpacity={0.7}
          >
            <Text style={[styles.controlBtnText, { opacity: hasNext ? 1 : 0.3 }]}>Next  ⏭</Text>
          </TouchableOpacity>
        </View>
      </View>

      {limitReached && (
        <View style={[styles.limitBanner, { backgroundColor: colors.dangerBg }]}>
          <Text style={{ fontSize: 22, marginRight: 10 }}>⏰</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.limitBannerTitle, { color: colors.danger }]}>Daily Limit Reached</Text>
            <Text style={[styles.limitBannerSub, { color: colors.textSecondary }]}>Come back tomorrow for more episodes.</Text>
          </View>
        </View>
      )}

      {errorMsg !== '' && !limitReached && (
        <View style={[styles.limitBanner, { backgroundColor: colors.dangerBg }]}>
          <Text style={{ fontSize: 22, marginRight: 10 }}>😔</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.limitBannerTitle, { color: colors.danger }]}>{errorMsg}</Text>
          </View>
        </View>
      )}

      {playlist.length > 0 && (
        <View style={styles.playlistHeader}>
          <Text style={[styles.playlistTitle, { color: colors.text }]}>Playlist</Text>
          <Text style={[styles.playlistCount, { color: colors.textMuted }]}>{playlist.length} episodes</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={{
      flex: 1,
      backgroundColor: isFullscreen ? '#000' : colors.background,
      paddingTop: isFullscreen ? 0 : (StatusBar.currentHeight || 0),
    }}>

      {/* ─── VIDEO CONTAINER ───
           Always the 1st child. Never moves in the tree.
           Portrait: fixed 16:9 height.
           Fullscreen: flex:1 fills the entire screen.
      */}
      <View style={{
        flex: isFullscreen ? 1 : 0,
        height: isFullscreen ? undefined : VIDEO_HEIGHT,
        width: '100%',
        backgroundColor: '#000',
      }}>
        {/* Loading overlay */}
        {(isBuffering || !videoSource) && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading video...</Text>
          </View>
        )}

        {/* THE SINGLE VideoView — same player, same tree position always */}
        <VideoView
          player={player}
          style={{ flex: 1, backgroundColor: '#000' }}
          nativeControls
          contentFit={contentFitValue}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />

        {/* Fullscreen overlay controls — rendered INSIDE the same container */}
        {isFullscreen && (
          <>
            <TouchableOpacity
              style={styles.fsExitBtn}
              onPress={exitFullscreen}
              activeOpacity={0.8}
            >
              <Text style={styles.fsExitBtnText}>✕</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fsAspectBtn}
              onPress={cycleAspectMode}
              activeOpacity={0.8}
            >
              <Text style={styles.fsAspectIcon}>⛶</Text>
              <Text style={styles.fsAspectLabel}>{ASPECT_MODES[aspectModeIndex].label}</Text>
            </TouchableOpacity>

            <View style={styles.fsBottomBar}>
              <TouchableOpacity
                style={[styles.fsNavBtn, !hasPrev && styles.fsNavBtnDisabled]}
                onPress={playPrev}
                disabled={!hasPrev}
                activeOpacity={0.7}
              >
                <Text style={[styles.fsNavBtnText, !hasPrev && { opacity: 0.3 }]}>⏮</Text>
              </TouchableOpacity>
              <View style={styles.fsEpInfo}>
                <Text style={styles.fsEpTitle} numberOfLines={1}>
                  EP {currentVideo.episodeNumber} · {currentVideo.title}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.fsNavBtn, !hasNext && styles.fsNavBtnDisabled]}
                onPress={playNext}
                disabled={!hasNext}
                activeOpacity={0.7}
              >
                <Text style={[styles.fsNavBtnText, !hasNext && { opacity: 0.3 }]}>⏭</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* ─── PLAYLIST — hidden when fullscreen ─── */}
      {!isFullscreen && (
        <FlatList
          data={playlist}
          keyExtractor={(item) => item._id}
          renderItem={renderPlaylistItem}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={{ paddingBottom: 30 }}
          ListEmptyComponent={
            <View style={styles.emptyPlaylist}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No other episodes in playlist</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },

  // Video info
  videoInfoSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  videoInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  videoInfoLeft: { flex: 1, marginRight: 12 },
  videoTitle: { fontSize: 17, fontWeight: '700', lineHeight: 22, marginBottom: 4 },
  videoEp: { fontSize: 13, fontWeight: '500' },
  backBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  controlRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  controlBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Banners
  limitBanner: {
    marginHorizontal: 16, marginTop: 12, padding: 14,
    borderRadius: 14, flexDirection: 'row', alignItems: 'center',
  },
  limitBannerTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  limitBannerSub: { fontSize: 12, fontWeight: '500' },

  // Playlist
  playlistHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10,
  },
  playlistTitle: { fontSize: 18, fontWeight: '700' },
  playlistCount: { fontSize: 13, fontWeight: '500' },
  playlistItem: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8, padding: 12,
    borderRadius: 14, borderWidth: 1, height: 64, overflow: 'hidden',
  },
  nowPlayingBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    borderTopLeftRadius: 14, borderBottomLeftRadius: 14,
  },
  plEpBadge: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  plEpNum: { color: '#fff', fontWeight: '800', fontSize: 16 },
  plInfo: { flex: 1 },
  plTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  plSub: { fontSize: 12, fontWeight: '500' },
  plPlayBtn: {
    width: 30, height: 30, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  emptyPlaylist: { paddingVertical: 30, alignItems: 'center' },
  emptyText: { fontSize: 14 },

  // Fullscreen overlay controls
  fsExitBtn: {
    position: 'absolute', top: 12, left: 12,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', zIndex: 50,
  },
  fsExitBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  fsAspectBtn: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 50,
  },
  fsAspectIcon: { color: '#fff', fontSize: 16, marginRight: 6 },
  fsAspectLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  fsBottomBar: {
    position: 'absolute', bottom: 14, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', zIndex: 50,
  },
  fsNavBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  fsNavBtnDisabled: { backgroundColor: 'rgba(0,0,0,0.25)' },
  fsNavBtnText: { color: '#fff', fontSize: 20 },
  fsEpInfo: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  fsEpTitle: {
    color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
});
