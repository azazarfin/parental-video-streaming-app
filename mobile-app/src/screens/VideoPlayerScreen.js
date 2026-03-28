import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, BackHandler } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ScreenCapture from 'expo-screen-capture';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.10.100:5000/api';
const RESUME_PREFIX = '@resume_';

export default function VideoPlayerScreen({ route, navigation }) {
  const { video, userId, sessionToken } = route.params;
  const { logout } = useAuth();
  const { colors } = useTheme();
  const videoFileId = video.googleDriveFileId;

  const [limitReached, setLimitReached] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [videoSource, setVideoSource] = useState(null);
  const [hasResumed, setHasResumed] = useState(false);

  const isPlayingRef = useRef(false);
  const resumePositionRef = useRef(0);
  const lastSavedPositionRef = useRef(0);
  const playerRef = useRef(null);

  // Lock to landscape on mount, restore portrait on unmount
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // Handle Android hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      safeGoBack();
      return true;
    });
    return () => backHandler.remove();
  }, []);

  // 1. Fetch streaming token
  useEffect(() => {
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

    // Load saved resume position
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

  // 3. Player event listeners + resume seek
  useEffect(() => {
    if (!player) return;

    const statusSub = player.addListener('statusChange', (payload) => {
      const playing = payload.status === 'readyToPlay' && player.playing;
      isPlayingRef.current = playing;

      if (payload.status === 'readyToPlay' && !hasResumed && resumePositionRef.current > 0) {
        try { player.currentTime = resumePositionRef.current; } catch (e) {}
        setHasResumed(true);
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

    return () => {
      statusSub.remove();
      playSub.remove();
    };
  }, [player, hasResumed]);

  // 4. Save position every 5s
  useEffect(() => {
    if (!player) return;
    const saveInterval = setInterval(() => {
      try {
        if (player && player.currentTime > 0) {
          lastSavedPositionRef.current = player.currentTime;
          AsyncStorage.setItem(
            RESUME_PREFIX + videoFileId,
            JSON.stringify({ position: player.currentTime, title: video.title, ep: video.episodeNumber })
          );
        }
      } catch (e) {}
    }, 5000);
    return () => clearInterval(saveInterval);
  }, [player, videoFileId]);

  // 4b. Enforce 1.0x Speed (Prevent brother's 2x habit)
  useEffect(() => {
    if (!player) return;
    const speedEnforcer = setInterval(() => {
      try {
        if (player.playbackRate !== 1.0) {
          player.playbackRate = 1.0;
        }
      } catch (e) {}
    }, 500);
    return () => clearInterval(speedEnforcer);
  }, [player]);

  // 5. Heartbeat
  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (isPlayingRef.current && !limitReached) {
        try {
          const res = await axios.post(`${API_URL}/heartbeat`, {
            userId, duration: 10, sessionToken, videoId: videoFileId,
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
  }, [limitReached, userId, sessionToken, videoFileId]);

  const handleLimitReached = () => {
    setLimitReached(true);
    isPlayingRef.current = false;
    try { if (playerRef.current) playerRef.current.pause(); } catch (e) {}
  };

  const safeGoBack = () => {
    if (lastSavedPositionRef.current > 0) {
      AsyncStorage.setItem(
        RESUME_PREFIX + videoFileId,
        JSON.stringify({ position: lastSavedPositionRef.current, title: video.title, ep: video.episodeNumber })
      );
    }
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    navigation.goBack();
  };

  if (limitReached) {
    return (
      <View style={[styles.limitContainer, { backgroundColor: colors.background }]}>
        <Text style={styles.limitEmoji}>⏰</Text>
        <Text style={[styles.limitTitle, { color: colors.danger }]}>Daily Limit Reached</Text>
        <Text style={[styles.limitSub, { color: colors.textSecondary }]}>
          You've watched enough for today!{'\n'}Come back tomorrow for more episodes.
        </Text>
        <TouchableOpacity
          style={[styles.goBackBtn, { backgroundColor: colors.primary }]}
          onPress={safeGoBack}
          activeOpacity={0.8}
        >
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={[styles.limitContainer, { backgroundColor: colors.background }]}>
        <Text style={styles.limitEmoji}>😔</Text>
        <Text style={[styles.limitTitle, { color: colors.danger }]}>{errorMsg}</Text>
        <TouchableOpacity
          style={[styles.goBackBtn, { backgroundColor: colors.primary, marginTop: 20 }]}
          onPress={safeGoBack}
          activeOpacity={0.8}
        >
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Episode info overlay — no back button */}
      <View style={styles.infoOverlay}>
        <Text style={styles.infoText}>EP {video.episodeNumber} · {video.title}</Text>
      </View>

      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
    backgroundColor: '#000',
  },
  infoOverlay: {
    position: 'absolute',
    top: 44,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  infoText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  limitContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  limitEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  limitTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  limitSub: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  goBackBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
  },
  goBackText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
