import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

export const RESUME_PREFIX = '@resume_';

export function normalizeResumeEntry(entry) {
  if (!entry) return null;

  const position = Number(entry.position ?? entry.positionSeconds ?? 0);
  if (!Number.isFinite(position) || position <= 0) return null;

  const rawTimestamp = entry.timestamp ?? entry.watchedAt ?? entry.updatedAt ?? Date.now();
  const timestamp = new Date(rawTimestamp).getTime();

  return {
    position,
    title: typeof entry.title === 'string' ? entry.title : '',
    ep:
      entry.ep !== undefined && entry.ep !== null
        ? Number(entry.ep)
        : entry.episodeNumber !== undefined && entry.episodeNumber !== null
          ? Number(entry.episodeNumber)
          : null,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

export function buildResumeEntry({ position, title, episodeNumber, timestamp = Date.now() }) {
  const normalized = normalizeResumeEntry({
    position,
    title,
    episodeNumber,
    timestamp,
  });

  return normalized;
}

export function mergeResumeMaps(...maps) {
  const merged = {};

  maps.forEach((map) => {
    if (!map) return;

    Object.entries(map).forEach(([videoId, rawEntry]) => {
      const entry = normalizeResumeEntry(rawEntry);
      if (!entry) return;

      if (!merged[videoId] || entry.timestamp > merged[videoId].timestamp) {
        merged[videoId] = entry;
      }
    });
  });

  return merged;
}

export async function loadLocalResumeData() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const resumeKeys = keys.filter((key) => key.startsWith(RESUME_PREFIX));

    if (resumeKeys.length === 0) {
      return {};
    }

    const pairs = await AsyncStorage.multiGet(resumeKeys);
    const data = {};

    pairs.forEach(([key, value]) => {
      if (!value) return;

      try {
        const normalized = normalizeResumeEntry(JSON.parse(value));
        if (normalized) {
          data[key.replace(RESUME_PREFIX, '')] = normalized;
        }
      } catch (e) {}
    });

    return data;
  } catch (err) {
    return {};
  }
}

export async function saveLocalResumeEntry(videoId, entry) {
  const normalized = normalizeResumeEntry(entry);
  if (!normalized) return;

  await AsyncStorage.setItem(
    RESUME_PREFIX + videoId,
    JSON.stringify(normalized)
  );
}

export async function saveLocalResumeMap(resumeMap) {
  const pairs = Object.entries(resumeMap || {})
    .map(([videoId, entry]) => {
      const normalized = normalizeResumeEntry(entry);
      if (!normalized) return null;
      return [RESUME_PREFIX + videoId, JSON.stringify(normalized)];
    })
    .filter(Boolean);

  if (pairs.length > 0) {
    await AsyncStorage.multiSet(pairs);
  }
}

export async function clearLocalResumeData() {
  const keys = await AsyncStorage.getAllKeys();
  const resumeKeys = keys.filter((key) => key.startsWith(RESUME_PREFIX));

  if (resumeKeys.length > 0) {
    await AsyncStorage.multiRemove(resumeKeys);
  }
}

export async function fetchRemoteResumeData(apiUrl, userId, sessionToken) {
  if (!userId || !sessionToken) return {};

  const res = await axios.get(`${apiUrl}/progress`, {
    params: { userId, sessionToken },
    timeout: 8000,
  });

  const list = Array.isArray(res.data?.progress) ? res.data.progress : [];
  return list.reduce((acc, item) => {
    const normalized = normalizeResumeEntry(item);
    if (normalized && item.googleDriveFileId) {
      acc[item.googleDriveFileId] = normalized;
    }
    return acc;
  }, {});
}

export async function syncRemoteResumeEntries(apiUrl, userId, sessionToken, entries) {
  if (!userId || !sessionToken || !Array.isArray(entries) || entries.length === 0) {
    return {};
  }

  const payloadEntries = entries
    .map((entry) => {
      const normalized = normalizeResumeEntry(entry);
      if (!normalized || !entry.googleDriveFileId) return null;

      return {
        googleDriveFileId: entry.googleDriveFileId,
        title: normalized.title,
        episodeNumber: normalized.ep,
        positionSeconds: normalized.position,
        watchedAt: new Date(normalized.timestamp).toISOString(),
      };
    })
    .filter(Boolean);

  if (payloadEntries.length === 0) {
    return {};
  }

  const res = await axios.post(
    `${apiUrl}/progress/sync`,
    {
      userId,
      sessionToken,
      entries: payloadEntries,
    },
    { timeout: 8000 }
  );

  const list = Array.isArray(res.data?.progress) ? res.data.progress : [];
  return list.reduce((acc, item) => {
    const normalized = normalizeResumeEntry(item);
    if (normalized && item.googleDriveFileId) {
      acc[item.googleDriveFileId] = normalized;
    }
    return acc;
  }, {});
}
