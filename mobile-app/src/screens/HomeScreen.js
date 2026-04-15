import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  RESUME_PREFIX,
  clearLocalResumeData,
  fetchRemoteResumeData,
  loadLocalResumeData,
  mergeResumeMaps,
  saveLocalResumeMap,
  syncRemoteResumeEntries,
} from '../utils/playbackProgress';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.10.100:5000/api';
const PAGE_SIZE = 30;

export default function HomeScreen({ navigation }) {
  const { user, sessionToken, logout } = useAuth();
  const { colors } = useTheme();

  // Video list state (paginated)
  const [videos, setVideos] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef(null);

  // Resume & watch info
  const [resumeData, setResumeData] = useState({});
  const [watchInfo, setWatchInfo] = useState({
    totalWatchedToday: user?.totalWatchedToday || 0,
    dailyLimit: 60,
  });

  const userIdRef = useRef(user?._id);
  useEffect(() => { userIdRef.current = user?._id; }, [user]);

  // ── Fetch videos (paginated, with search) ──
  const fetchVideos = useCallback(async (pageNum = 1, query = '', append = false) => {
    try {
      if (pageNum === 1 && !append) setLoading(true);
      else setLoadingMore(true);

      const params = new URLSearchParams({
        available: 'true',
        page: String(pageNum),
        limit: String(PAGE_SIZE),
      });
      if (query.trim()) params.append('q', query.trim());

      const res = await axios.get(`${API_URL}/videos?${params.toString()}`);
      const data = res.data;

      if (append) {
        setVideos(prev => [...prev, ...data.videos]);
      } else {
        setVideos(data.videos);
      }
      setPage(data.page);
      setHasMore(data.hasMore);
      setTotalCount(data.totalCount);
    } catch (err) {
      console.error('Error fetching videos:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchVideos(1, '');
    fetchWatchInfo();
    loadResumeData();
  }, []);

  // ── Debounced search — triggers server-side query ──
  const handleSearchChange = useCallback((text) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchVideos(1, text, false);
    }, 400);
  }, [fetchVideos]);

  // Cleanup search timer
  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, []);

  // ── Load more on scroll ──
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchVideos(page + 1, searchQuery, true);
  }, [hasMore, loadingMore, loading, page, searchQuery, fetchVideos]);

  // ── Watch time polling (30s instead of 15s — less aggressive) ──
  useEffect(() => {
    const interval = setInterval(fetchWatchInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchWatchInfo();
      loadResumeData();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchWatchInfo = async () => {
    try {
      const id = userIdRef.current;
      if (!id) return;
      const res = await axios.get(`${API_URL}/users/${id}`, { timeout: 5000 });
      const u = res.data;
      setWatchInfo({
        totalWatchedToday: u.totalWatchedToday || 0,
        dailyLimit: u.todayLimit || 60,
      });

      // Check if admin has reset stats
      if (u.lastStatsReset) {
        const serverReset = new Date(u.lastStatsReset).getTime();
        const localReset = await AsyncStorage.getItem('@lastStatsReset');
        const localResetTime = localReset ? Number(localReset) : 0;

        if (serverReset > localResetTime) {
          const allKeys = await AsyncStorage.getAllKeys();
          const resumeKeys = allKeys.filter((k) => k.startsWith(RESUME_PREFIX));
          if (resumeKeys.length > 0) {
            await clearLocalResumeData();
          }
          await AsyncStorage.setItem('@lastStatsReset', String(serverReset));
          setResumeData({});
        }
      }
    } catch (err) {
      // Watch info poll failed — silent
    }
  };

  const loadResumeData = useCallback(async () => {
    const localData = await loadLocalResumeData();

    if (!user?._id || !sessionToken) {
      setResumeData(localData);
      return localData;
    }

    let remoteData = {};
    try {
      remoteData = await fetchRemoteResumeData(API_URL, user._id, sessionToken);
    } catch (err) {
      setResumeData(localData);
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
          user._id,
          sessionToken,
          newerLocalEntries
        );
        Object.assign(mergedData, mergeResumeMaps(mergedData, syncedEntries));
      } catch (err) {
        // Keep merged local/server state even if upload fails
      }
    }

    setResumeData(mergedData);
    await saveLocalResumeMap(mergedData);
    return mergedData;
  }, [user, sessionToken]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchVideos(1, searchQuery, false),
      fetchWatchInfo(),
      loadResumeData(),
    ]);
    setRefreshing(false);
  }, [fetchVideos, searchQuery, loadResumeData]);

  // ── Memoized computations ──
  const progressPct = useMemo(() =>
    watchInfo.dailyLimit > 0
      ? Math.min((watchInfo.totalWatchedToday / watchInfo.dailyLimit) * 100, 100)
      : 0,
    [watchInfo.totalWatchedToday, watchInfo.dailyLimit]
  );

  const progressColor = useMemo(() =>
    progressPct < 50 ? colors.success : progressPct < 80 ? colors.warning : colors.danger,
    [progressPct, colors]
  );

  const continueVideo = useMemo(() =>
    videos.reduce((best, v) => {
      const data = resumeData[v.googleDriveFileId];
      if (!data) return best;
      if (!best) return v;
      const bestData = resumeData[best.googleDriveFileId];
      return (data.timestamp || 0) > (bestData.timestamp || 0) ? v : best;
    }, null),
    [videos, resumeData]
  );

  const continuePosition = useMemo(() =>
    continueVideo ? resumeData[continueVideo.googleDriveFileId]?.position : 0,
    [continueVideo, resumeData]
  );

  const formatTime = useCallback((seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  // ── Navigate to video (lightweight params — no full playlist) ──
  const navigateToVideo = useCallback((video) => {
    navigation.push('VideoPlayer', {
      video: {
        _id: video._id,
        googleDriveFileId: video.googleDriveFileId,
        title: video.title,
        episodeNumber: video.episodeNumber,
      },
      userId: user._id,
    });
  }, [navigation, user]);

  // ── Memoized render functions ──
  const renderHeader = useCallback(() => (
    <View>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.topBarLeft}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {(user?.username || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>Welcome back,</Text>
            <Text style={[styles.username, { color: colors.text }]}>{user?.username}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <Text style={{ fontSize: 18, color: colors.textMuted }}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search videos..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={handleSearchChange}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearchChange('')} style={{ padding: 4 }}>
            <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Watch Time Card */}
      <View style={[styles.watchCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.watchHeader}>
          <Text style={[styles.watchLabel, { color: colors.textSecondary }]}>Today's Watch Time</Text>
          <Text style={[styles.watchLimit, { color: colors.textMuted }]}>
            Limit: {watchInfo.dailyLimit} min
          </Text>
        </View>
        <View style={styles.watchRow}>
          <Text style={[styles.watchValue, { color: progressColor }]}>
            {watchInfo.totalWatchedToday.toFixed(1)}
          </Text>
          <Text style={[styles.watchUnit, { color: colors.textMuted }]}> min</Text>
        </View>
        <View style={[styles.progressBar, { backgroundColor: colors.progressBg }]}>
          <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: progressColor }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.textMuted }]}>
          {progressPct.toFixed(0)}% of daily limit used
        </Text>
      </View>

      {/* Continue Watching */}
      {continueVideo && (
        <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>▶ Continue Watching</Text>
          <TouchableOpacity
            style={[styles.continueCard, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => navigateToVideo(continueVideo)}
          >
            <View style={styles.continueLeft}>
              <Text style={styles.continueEp}>EP {continueVideo.episodeNumber}</Text>
              <Text style={styles.continueTitle} numberOfLines={1}>{continueVideo.title}</Text>
              <Text style={styles.continueTime}>Resume from {formatTime(continuePosition)}</Text>
            </View>
            <View style={styles.playCircle}>
              <Text style={{ fontSize: 20, color: '#fff' }}>▶</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Episodes Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginHorizontal: 16, marginTop: 8 }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Episodes
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>
          {totalCount} total
        </Text>
      </View>
    </View>
  ), [colors, user, searchQuery, watchInfo, progressPct, progressColor, continueVideo, continuePosition, totalCount, handleSearchChange, navigateToVideo, formatTime, logout]);

  const renderItem = useCallback(({ item }) => {
    const hasResume = resumeData[item.googleDriveFileId];
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        activeOpacity={0.7}
        onPress={() => navigateToVideo(item)}
      >
        <View style={[styles.epBadge, { backgroundColor: colors.primaryDark }]}>
          <Text style={styles.epNum}>{item.episodeNumber}</Text>
          <Text style={styles.epLabelText}>EP</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>
            {hasResume ? `Resume from ${formatTime(hasResume.position)}` : 'Tap to play'}
          </Text>
        </View>
        <View style={[styles.playIcon, { backgroundColor: colors.tabBg }]}>
          <Text style={{ color: colors.primary, fontSize: 14 }}>▶</Text>
        </View>
      </TouchableOpacity>
    );
  }, [colors, resumeData, navigateToVideo, formatTime]);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>Loading more episodes...</Text>
      </View>
    );
  }, [loadingMore, colors]);

  const keyExtractor = useCallback((item) => item._id, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <FlatList
        data={videos}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {searchQuery ? 'No videos match your search.' : 'No videos available at the moment.'}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 30 }}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  greeting: { fontSize: 12, fontWeight: '500' },
  username: { fontSize: 16, fontWeight: '700' },
  logoutBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  watchCard: {
    margin: 16,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  watchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  watchLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  watchLimit: { fontSize: 12 },
  watchRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  watchValue: { fontSize: 36, fontWeight: '800' },
  watchUnit: { fontSize: 16, fontWeight: '500' },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: { fontSize: 11, fontWeight: '500' },
  searchContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 0,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
  },
  continueLeft: { flex: 1 },
  continueEp: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  continueTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  continueTime: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  epBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  epNum: { color: '#fff', fontWeight: '800', fontSize: 18, lineHeight: 22 },
  epLabelText: { color: 'rgba(255,255,255,0.7)', fontWeight: '600', fontSize: 10 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 3 },
  cardSub: { fontSize: 12 },
  playIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15 },
});
