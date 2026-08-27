import * as SecureStore from 'expo-secure-store';

const maxHistory = 30;
const maxFavorites = 40;

function storageKey(userId: string, kind: 'history' | 'favorites') {
  return `member-hub-${kind}-${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

async function readIds(key: string) {
  const stored = await SecureStore.getItemAsync(key);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

async function writeIds(key: string, ids: string[]) {
  await SecureStore.setItemAsync(key, JSON.stringify(ids));
}

export async function getRequestPreferences(userId: string) {
  const [viewedIds, favoriteIds] = await Promise.all([
    readIds(storageKey(userId, 'history')),
    readIds(storageKey(userId, 'favorites')),
  ]);
  return { viewedIds, favoriteIds };
}

export async function recordViewedRequest(userId: string, requestId: string) {
  const key = storageKey(userId, 'history');
  const current = await readIds(key);
  const next = [requestId, ...current.filter((id) => id !== requestId)].slice(0, maxHistory);
  await writeIds(key, next);
  return next;
}

export async function toggleFavoriteRequest(userId: string, requestId: string) {
  const key = storageKey(userId, 'favorites');
  const current = await readIds(key);
  const next = current.includes(requestId)
    ? current.filter((id) => id !== requestId)
    : [requestId, ...current].slice(0, maxFavorites);
  await writeIds(key, next);
  return next;
}
