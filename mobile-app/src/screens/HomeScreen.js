import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.10.100:5000/api';
const RESUME_PREFIX = '@resume_';

export default function HomeScreen({ navigation }) {
  const { user, sessionToken, logout, updateUser } = useAuth();
  const { colors } = useTheme();
  const [videos, setVideos] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resumeData, setResumeData] = useState({});
  const [watchInfo, setWatchInfo] = useState({
    totalWatchedToday: user?.totalWatchedToday || 0,
    dailyLimit: 60,
  });

  // Use ref to always have the latest user._id inside intervals
  const userIdRef = useRef(user?._id);
  useEffect(() => { userIdRef.current = user?._id; }, [user]);

  useEffect(() => {
    fetchVideos();
    fetchWatchInfo();
    loadResumeData();
  }, []);

  // Real-time watch time polling every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWatchInfo();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Refresh on focus (coming back from video player)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchWatchInfo();
      loadResumeData();
    });
    return unsubscribe;
  }, [navigation]);

  const fetchVideos = async () => {
    try {
      const videoRes = await axios.get(`${API_URL}/videos?available=true`);
      setVideos(videoRes.data);
    } catch (err) {
      console.error('Error fetching videos:', err);
    } finally {
      setLoading(false);
    }
  };

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
    } catch (err) {
      console.log('Watch info poll failed:', err.message);
    }
  };

  const loadResumeData = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const resumeKeys = keys.filter((k) => k.startsWith(RESUME_PREFIX));
      if (resumeKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(resumeKeys);
        const data = {};
        pairs.forEach(([key, val]) => {
          if (val) {
            const videoId = key.replace(RESUME_PREFIX, '');
            data[videoId] = JSON.parse(val);
          }
        });
        setResumeData(data);
      }
    } catch (err) {
      // silent
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchVideos(), fetchWatchInfo(), loadResumeData()]);
    setRefreshing(false);
  }, []);

  const progressPct = watchInfo.dailyLimit > 0
    ? Math.min((watchInfo.totalWatchedToday / watchInfo.dailyLimit) * 100, 100)
    : 0;

  const progressColor = progressPct < 50
    ? colors.success
    : progressPct < 80
      ? colors.warning
      : colors.danger;

  // Find "continue watching" video — the one with the most recent timestamp
  const continueVideo = videos.reduce((best, v) => {
    const data = resumeData[v.googleDriveFileId];
    if (!data) return best;
    if (!best) return v;
    const bestData = resumeData[best.googleDriveFileId];
    return (data.timestamp || 0) > (bestData.timestamp || 0) ? v : best;
  }, null);
  const continuePosition = continueVideo
    ? resumeData[continueVideo.googleDriveFileId]?.position
    : 0;

  const filteredVideos = videos.filter((v) => 
    (v.title && v.title.toLowerCase().includes(searchQuery.toLowerCase())) || 
    (v.episodeNumber && String(v.episodeNumber).includes(searchQuery))
  );

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderHeader = () => (
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
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
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
            onPress={() => navigation.push('VideoPlayer', {
              video: continueVideo, userId: user._id, sessionToken, playlist: videos
            })}
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
      <Text style={[styles.sectionTitle, { color: colors.text, marginHorizontal: 16, marginTop: 8 }]}>
        Episodes
      </Text>
    </View>
  );

  const renderItem = ({ item }) => {
    const hasResume = resumeData[item.googleDriveFileId];
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        activeOpacity={0.7}
        onPress={() => navigation.push('VideoPlayer', {
          video: item, userId: user._id, sessionToken, playlist: videos,
        })}
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
  };

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
        data={filteredVideos}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader()}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {searchQuery ? 'No videos match your search.' : 'No videos available at the moment.'}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 30 }}
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
