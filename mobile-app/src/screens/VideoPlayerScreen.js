import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Animated,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ScreenCapture from 'expo-screen-capture';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  buildResumeEntry,
  fetchRemoteResumeData,
  loadLocalResumeData,
  mergeResumeMaps,
  saveLocalResumeEntry,
  saveLocalResumeMap,
  syncRemoteResumeEntries,
} from '../utils/playbackProgress';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.10.100:5000/api';
const SCREEN_WIDTH = Dimensions.get('window').width;
const VIDEO_HEIGHT = (SCREEN_WIDTH * 9) / 16;
const PLAYLIST_PAGE_SIZE = 30;
const ASPECT_MODES = [
  { label: 'Fit', contentFit: 'contain' },
  { label: 'Original', contentFit: 'contain' },
  { label: 'Stretch', contentFit: 'fill' },
  { label: 'Crop', contentFit: 'cover' },
];

export default function VideoPlayerScreen({ route, navigation }) {
  const { video: initialVideo, userId } = route.params;
  const { logout, sessionToken } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [currentVideo, setCurrentVideo] = useState(initialVideo);
  const videoFileId = currentVideo.googleDriveFileId;

  const [playlist, setPlaylist] = useState([]);
  const [playlistPage, setPlaylistPage] = useState(1);
  const [playlistHasMore, setPlaylistHasMore] = useState(true);
  const [playlistTotal, setPlaylistTotal] = useState(0);
  const [playlistLoading, setPlaylistLoading] = useState(false);

  const [limitReached, setLimitReached] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [videoSource, setVideoSource] = useState(null);
  const [hasResumed, setHasResumed] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectModeIndex, setAspectModeIndex] = useState(0);
  const [contentFitValue, setContentFitValue] = useState(ASPECT_MODES[0].contentFit);
  const [controlsVisible, setControlsVisible] = useState(true);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef(null);
  const playlistRequestRef = useRef(false);
  const isPlayingRef = useRef(false);
  const resumePositionRef = useRef(0);
  const lastSavedPositionRef = useRef(0);
  const playerRef = useRef(null);
  const currentVideoRef = useRef(currentVideo);
  const [resumeDataState, setResumeDataState] = useState({});

  useEffect(() => {
    currentVideoRef.current = currentVideo;
  }, [currentVideo]);

  const persistResume = useCallback((videoItem, position, timestamp = Date.now()) => {
    if (!videoItem) return;

    const payload = buildResumeEntry({
      position,
      title: videoItem.title,
      episodeNumber: videoItem.episodeNumber,
      timestamp,
    });
    if (!payload) return;

    lastSavedPositionRef.current = payload.position;
    setResumeDataState((prev) => ({
      ...prev,
      [videoItem.googleDriveFileId]: payload,
    }));

    saveLocalResumeEntry(videoItem.googleDriveFileId, payload).catch(() => {});

    if (userId && sessionToken) {
      syncRemoteResumeEntries(API_URL, userId, sessionToken, [
        {
          googleDriveFileId: videoItem.googleDriveFileId,
          ...payload,
        },
      ])
        .then((syncedEntries) => {
          const syncedEntry = syncedEntries[videoItem.googleDriveFileId];
          if (!syncedEntry) return;

          setResumeDataState((prev) => ({
            ...prev,
            [videoItem.googleDriveFileId]: syncedEntry,
          }));
          saveLocalResumeEntry(videoItem.googleDriveFileId, syncedEntry).catch(() => {});
        })
        .catch(() => {});
    }
  }, [userId, sessionToken]);

  const handleLimitReached = useCallback(() => {
    setLimitReached(true);
    isPlayingRef.current = false;
    setIsBuffering(false);
    try {
      if (playerRef.current) {
        playerRef.current.pause();
      }
    } catch (e) {}
  }, []);

  const safeGoBack = useCallback(() => {
    const currentPlayerTime = playerRef.current?.currentTime || lastSavedPositionRef.current || 0;
    persistResume(currentVideoRef.current, currentPlayerTime);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    StatusBar.setHidden(false, 'fade');
    NavigationBar.setVisibilityAsync('visible').catch(() => {});
    navigation.goBack();
  }, [navigation, persistResume]);

  const showControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    setControlsVisible(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    hideTimerRef.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setControlsVisible(false));
    }, 3000);
  }, [controlsOpacity]);

  const exitFullscreen = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    controlsOpacity.setValue(1);
    setControlsVisible(true);
    setIsFullscreen(false);
    setContentFitValue(ASPECT_MODES[0].contentFit);
    setAspectModeIndex(0);
    StatusBar.setHidden(false, 'fade');
    NavigationBar.setVisibilityAsync('visible').catch(() => {});
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, [controlsOpacity]);

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true);
    setContentFitValue(ASPECT_MODES[0].contentFit);
    setAspectModeIndex(0);
    StatusBar.setHidden(true, 'fade');
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    showControls();
  }, [showControls]);

  const cycleAspectMode = useCallback(() => {
    const nextIndex = (aspectModeIndex + 1) % ASPECT_MODES.length;
    setAspectModeIndex(nextIndex);
    setContentFitValue(ASPECT_MODES[nextIndex].contentFit);
  }, [aspectModeIndex]);

  const fetchPlaylist = useCallback(async (pageNum = 1, append = false) => {
    if (playlistRequestRef.current) return;

    playlistRequestRef.current = true;
    setPlaylistLoading(true);

    try {
      const res = await axios.get(`${API_URL}/videos`, {
        params: { available: 'true', page: pageNum, limit: PLAYLIST_PAGE_SIZE },
        timeout: 8000,
      });

      const data = res.data;
      setPlaylist((prev) => {
        if (!append) return data.videos;

        const seen = new Set(prev.map((item) => item._id));
        const nextItems = data.videos.filter((item) => !seen.has(item._id));
        return [...prev, ...nextItems];
      });
      setPlaylistPage(data.page);
      setPlaylistHasMore(data.hasMore);
      setPlaylistTotal(data.totalCount);
    } catch (err) {
      console.error('Failed to fetch playlist:', err.message);
    } finally {
      playlistRequestRef.current = false;
      setPlaylistLoading(false);
    }
  }, []);

  const loadMorePlaylist = useCallback(() => {
    if (!playlistHasMore || playlistLoading) return;
    fetchPlaylist(playlistPage + 1, true);
  }, [playlistHasMore, playlistLoading, playlistPage, fetchPlaylist]);

  const loadResumeData = useCallback(async () => {
    const localData = await loadLocalResumeData();

    if (!userId || !sessionToken) {
      setResumeDataState(localData);
      return localData;
    }

    let remoteData = {};
    try {
      remoteData = await fetchRemoteResumeData(API_URL, userId, sessionToken);
    } catch (err) {
      setResumeDataState(localData);
      return localData;
    }

    const mergedData = mergeResumeMaps(remoteData, localData);
    const newerLocalEntries = Object.entries(localData)
      .filter(([videoId, entry]) => {
        const remoteEntry = remoteData[videoId];
        return !remoteEntry || entry.timestamp > remoteEntry.timestamp;
      })
      .map(([googleDriveFileId, entry]) => ({
        googleDriveFileId,
        ...entry,
      }));

    if (newerLocalEntries.length > 0) {
      try {
        const syncedEntries = await syncRemoteResumeEntries(
          API_URL,
          userId,
          sessionToken,
          newerLocalEntries
        );
        Object.assign(mergedData, mergeResumeMaps(mergedData, syncedEntries));
      } catch (err) {
        // Keep merged local/server state even if upload fails
      }
    }

    setResumeDataState(mergedData);
    await saveLocalResumeMap(mergedData);
    return mergedData;
  }, [userId, sessionToken]);

  const switchVideo = useCallback((newVideo) => {
    if (!newVideo || newVideo.googleDriveFileId === currentVideoRef.current.googleDriveFileId) return;

    const currentPlayerTime = playerRef.current?.currentTime || lastSavedPositionRef.current || 0;
    persistResume(currentVideoRef.current, currentPlayerTime);

    try {
      if (playerRef.current) {
        playerRef.current.pause();
      }
    } catch (e) {}

    setCurrentVideo(newVideo);
  }, [persistResume]);

  useEffect(() => {
    fetchPlaylist(1, false);
    loadResumeData();
  }, [fetchPlaylist, loadResumeData]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      StatusBar.setHidden(false, 'fade');
      NavigationBar.setVisibilityAsync('visible').catch(() => {});
    };
  }, []);

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
  }, [isFullscreen, exitFullscreen, safeGoBack]);

  useEffect(() => {
    setVideoSource(null);
    setIsBuffering(true);
    setErrorMsg('');
    setHasResumed(false);
    resumePositionRef.current = 0;
    lastSavedPositionRef.current = 0;

    const fetchStreamSource = async () => {
      try {
        if (!sessionToken) {
          setErrorMsg('Your session has expired. Please log in again.');
          setIsBuffering(false);
          return;
        }

        const mergedResumeData = await loadResumeData();
        const existingResume = mergedResumeData[videoFileId];
        if (existingResume) {
          resumePositionRef.current = existingResume.position || 0;
        }

        const endpoint =
          `${API_URL}/stream/${encodeURIComponent(videoFileId)}` +
          `?userId=${encodeURIComponent(userId)}` +
          `&sessionToken=${encodeURIComponent(sessionToken)}`;
        const res = await axios.get(endpoint, { timeout: 10000 });

        setVideoSource({
          uri: res.data.url,
          headers: res.data.token ? { Authorization: `Bearer ${res.data.token}` } : undefined,
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
          setIsBuffering(false);
        } else {
          setErrorMsg('Failed to load video stream');
          setIsBuffering(false);
        }
      }
    };

    if (!limitReached) {
      fetchStreamSource();
    }
  }, [videoFileId, userId, sessionToken, limitReached, logout, handleLimitReached, loadResumeData]);

  const player = useVideoPlayer(videoSource, (instance) => {
    instance.loop = false;
  });

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!player) return;

    const statusSub = player.addListener('statusChange', (payload) => {
      const playing = payload.status === 'readyToPlay' && player.playing;
      isPlayingRef.current = playing;

      if (payload.status === 'loading') {
        setIsBuffering(true);
      }

      if (payload.status === 'readyToPlay') {
        setIsBuffering(false);

        if (!hasResumed && resumePositionRef.current > 0) {
          try {
            player.currentTime = resumePositionRef.current;
          } catch (e) {}
          setHasResumed(true);
        }
      }

      if (payload.status === 'error' || payload.error) {
        const message = payload.error?.message || String(payload.error || 'Unknown error');
        setErrorMsg(`Error loading video${message ? `: ${message}` : ''}`);
        setIsBuffering(false);
      }
    });

    const playSub = player.addListener('playingChange', (payload) => {
      isPlayingRef.current = payload.isPlaying;
    });

    let endSub;
    try {
      endSub = player.addListener('playToEnd', () => {
        try {
          if (!player || player.currentTime <= 0) return;
        } catch (e) {
          return;
        }

        const current = currentVideoRef.current;
        const index = playlist.findIndex((item) => item.googleDriveFileId === current.googleDriveFileId);
        if (index >= 0 && index < playlist.length - 1) {
          switchVideo(playlist[index + 1]);
        }
      });
    } catch (e) {}

    return () => {
      statusSub.remove();
      playSub.remove();
      if (endSub) endSub.remove();
    };
  }, [player, hasResumed, playlist, switchVideo]);

  useEffect(() => {
    if (!player) return;

    const saveInterval = setInterval(() => {
      try {
        if (player.currentTime > 0) {
          persistResume(currentVideoRef.current, player.currentTime);
        }
      } catch (e) {}
    }, 5000);

    return () => clearInterval(saveInterval);
  }, [player, persistResume]);

  useEffect(() => {
    if (!player) return;

    const speedEnforcer = setInterval(() => {
      try {
        if (player.playbackRate !== 1.0) {
          player.playbackRate = 1.0;
        }
      } catch (e) {}
    }, 3000);

    return () => clearInterval(speedEnforcer);
  }, [player]);

  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (isPlayingRef.current && !limitReached && sessionToken) {
        try {
          const current = currentVideoRef.current;
          const res = await axios.post(
            `${API_URL}/heartbeat`,
            {
              userId,
              duration: 10,
              sessionToken,
              videoId: current.googleDriveFileId,
            },
            { timeout: 8000 }
          );

          if (res.data.limitReached) {
            handleLimitReached();
          }
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
  }, [limitReached, userId, sessionToken, logout, handleLimitReached]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const currentIndex = useMemo(
    () => playlist.findIndex((item) => item.googleDriveFileId === videoFileId),
    [playlist, videoFileId]
  );
  const hasNext = currentIndex >= 0 && currentIndex < playlist.length - 1;
  const hasPrev = currentIndex > 0;

  const playNext = useCallback(() => {
    if (hasNext) {
      switchVideo(playlist[currentIndex + 1]);
    }
  }, [hasNext, playlist, currentIndex, switchVideo]);

  const playPrev = useCallback(() => {
    if (hasPrev) {
      switchVideo(playlist[currentIndex - 1]);
    }
  }, [hasPrev, playlist, currentIndex, switchVideo]);

  const formatTime = useCallback((seconds) => {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const renderPlaylistItem = useCallback(
    ({ item }) => {
      const isCurrent = item.googleDriveFileId === videoFileId;
      const resume = resumeDataState[item.googleDriveFileId];

      return (
        <TouchableOpacity
          style={[
            styles.playlistItem,
            {
              backgroundColor: isCurrent ? colors.surfaceLight : colors.surface,
              borderColor: isCurrent ? colors.primary : colors.cardBorder,
            },
          ]}
          activeOpacity={0.7}
          onPress={() => {
            if (!isCurrent) switchVideo(item);
          }}
        >
          {isCurrent && <View style={[styles.nowPlayingBar, { backgroundColor: colors.primary }]} />}

          <View
            style={[
              styles.episodeBadge,
              { backgroundColor: isCurrent ? colors.primary : colors.primaryDark },
            ]}
          >
            <Text style={styles.episodeBadgeText}>{item.episodeNumber}</Text>
          </View>

          <View style={styles.playlistInfo}>
            <Text
              style={[styles.playlistTitle, { color: isCurrent ? colors.primary : colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={[styles.playlistSub, { color: colors.textMuted }]}>
              {isCurrent
                ? 'Now Playing'
                : resume
                  ? `Resume from ${formatTime(resume.position)}`
                  : 'Tap to play'}
            </Text>
          </View>

          {!isCurrent && (
            <View style={[styles.playButton, { backgroundColor: colors.tabBg }]}>
              <Text style={{ color: colors.primary, fontSize: 12 }}>Play</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [videoFileId, resumeDataState, colors, formatTime, switchVideo]
  );

  const renderListHeader = useCallback(() => {
    const episodeMeta =
      playlistTotal > 0 && currentIndex >= 0
        ? `Episode ${currentVideo.episodeNumber}  ${currentIndex + 1} of ${playlistTotal}`
        : `Episode ${currentVideo.episodeNumber}`;

    return (
      <View>
        <View
          style={[
            styles.videoInfoSection,
            { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder },
          ]}
        >
          <View style={styles.videoInfoRow}>
            <View style={styles.videoInfoLeft}>
              <Text style={[styles.videoTitle, { color: colors.text }]} numberOfLines={2}>
                {currentVideo.title}
              </Text>
              <Text style={[styles.videoMeta, { color: colors.textSecondary }]}>{episodeMeta}</Text>
            </View>

            <TouchableOpacity
              onPress={safeGoBack}
              style={[styles.backButton, { backgroundColor: colors.tabBg }]}
              activeOpacity={0.7}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[
                styles.controlButton,
                { backgroundColor: hasPrev ? colors.primaryDark : colors.tabBg },
              ]}
              onPress={playPrev}
              disabled={!hasPrev}
              activeOpacity={0.7}
            >
              <Text style={[styles.controlButtonText, { opacity: hasPrev ? 1 : 0.3 }]}>Prev</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: colors.primaryDark }]}
              onPress={enterFullscreen}
              activeOpacity={0.7}
            >
              <Text style={styles.controlButtonText}>Fullscreen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.controlButton,
                { backgroundColor: hasNext ? colors.primaryDark : colors.tabBg },
              ]}
              onPress={playNext}
              disabled={!hasNext}
              activeOpacity={0.7}
            >
              <Text style={[styles.controlButtonText, { opacity: hasNext ? 1 : 0.3 }]}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>

        {limitReached && (
          <View style={[styles.banner, { backgroundColor: colors.dangerBg }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: colors.danger }]}>Daily Limit Reached</Text>
              <Text style={[styles.bannerSub, { color: colors.textSecondary }]}>
                Come back tomorrow for more episodes.
              </Text>
            </View>
          </View>
        )}

        {errorMsg !== '' && !limitReached && (
          <View style={[styles.banner, { backgroundColor: colors.dangerBg }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: colors.danger }]}>{errorMsg}</Text>
            </View>
          </View>
        )}

        {playlist.length > 0 && (
          <View style={styles.playlistHeader}>
            <Text style={[styles.playlistHeaderTitle, { color: colors.text }]}>Playlist</Text>
            <Text style={[styles.playlistHeaderCount, { color: colors.textMuted }]}>
              {playlistTotal} episodes
            </Text>
          </View>
        )}
      </View>
    );
  }, [
    currentVideo,
    colors,
    currentIndex,
    playlistTotal,
    hasPrev,
    hasNext,
    limitReached,
    errorMsg,
    playlist.length,
    safeGoBack,
    playPrev,
    playNext,
    enterFullscreen,
  ]);

  const renderPlaylistFooter = useCallback(() => {
    if (!playlistLoading) return null;

    return (
      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [playlistLoading, colors]);

  const keyExtractor = useCallback((item) => item._id, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: isFullscreen ? '#000' : colors.background,
        paddingTop: isFullscreen ? 0 : insets.top,
      }}
    >
      <View
        style={{
          flex: isFullscreen ? 1 : 0,
          height: isFullscreen ? undefined : VIDEO_HEIGHT,
          width: '100%',
          backgroundColor: '#000',
        }}
        onTouchStart={
          isFullscreen
            ? () => {
                if (!controlsVisible) showControls();
              }
            : undefined
        }
      >
        {(isBuffering || !videoSource) && !limitReached && !errorMsg && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading video...</Text>
          </View>
        )}

        <VideoView
          player={player}
          style={{ flex: 1, backgroundColor: '#000' }}
          nativeControls
          contentFit={contentFitValue}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />

        {isFullscreen && (
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: controlsOpacity }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={styles.fullscreenExitButton}
              onPress={() => {
                showControls();
                exitFullscreen();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.fullscreenExitText}>X</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fullscreenAspectButton}
              onPress={() => {
                showControls();
                cycleAspectMode();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.fullscreenAspectLabel}>
                {ASPECT_MODES[aspectModeIndex].label}
              </Text>
            </TouchableOpacity>

            <View style={styles.fullscreenBottomBar} pointerEvents="box-none">
              <TouchableOpacity
                style={[styles.fullscreenNavButton, !hasPrev && styles.fullscreenNavButtonDisabled]}
                onPress={() => {
                  showControls();
                  playPrev();
                }}
                disabled={!hasPrev}
                activeOpacity={0.7}
              >
                <Text style={[styles.fullscreenNavText, !hasPrev && { opacity: 0.3 }]}>Prev</Text>
              </TouchableOpacity>

              <View style={styles.fullscreenTitleWrap} pointerEvents="none">
                <Text style={styles.fullscreenTitle} numberOfLines={1}>
                  EP {currentVideo.episodeNumber}  {currentVideo.title}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.fullscreenNavButton, !hasNext && styles.fullscreenNavButtonDisabled]}
                onPress={() => {
                  showControls();
                  playNext();
                }}
                disabled={!hasNext}
                activeOpacity={0.7}
              >
                <Text style={[styles.fullscreenNavText, !hasNext && { opacity: 0.3 }]}>Next</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>

      {!isFullscreen && (
        <FlatList
          data={playlist}
          keyExtractor={keyExtractor}
          renderItem={renderPlaylistItem}
          ListHeaderComponent={renderListHeader}
          ListFooterComponent={renderPlaylistFooter}
          contentContainerStyle={{ paddingBottom: 30 }}
          onEndReached={loadMorePlaylist}
          onEndReachedThreshold={0.5}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.emptyPlaylist}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No other episodes in playlist
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
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
  videoInfoLeft: {
    flex: 1,
    marginRight: 12,
  },
  videoTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 4,
  },
  videoMeta: {
    fontSize: 13,
    fontWeight: '500',
  },
  backButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  controlButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  bannerSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  playlistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
  playlistHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  playlistHeaderCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    height: 64,
    overflow: 'hidden',
  },
  nowPlayingBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  episodeBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  episodeBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  playlistSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  playButton: {
    width: 44,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  emptyPlaylist: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  fullscreenExitButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  fullscreenExitText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  fullscreenAspectButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 50,
  },
  fullscreenAspectLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  fullscreenBottomBar: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 50,
  },
  fullscreenNavButton: {
    minWidth: 60,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenNavButtonDisabled: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  fullscreenNavText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  fullscreenTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  fullscreenTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
