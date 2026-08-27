import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
const tokenKey = 'member-hub-session-token';
const apiBaseUrl = String(Constants.expoConfig?.extra?.apiBaseUrl || '').replace(/\/$/, '');
export async function getSessionToken() { return SecureStore.getItemAsync(tokenKey); }
export async function saveSessionToken(token: string) { await SecureStore.setItemAsync(tokenKey, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); }
export async function clearSessionToken() { await SecureStore.deleteItemAsync(tokenKey); }
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getSessionToken();
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { accept: 'application/json', ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '通信に失敗しました。');
  return data;
}
export const authApi = {
  requestCode: (email: string) => apiFetch<{ ok: true }>('/api/mobile/auth/request-code', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyCode: (email: string, code: string) => apiFetch<{ token: string; expiresAt: string; user: AppUser }>('/api/mobile/auth/verify-code', { method: 'POST', body: JSON.stringify({ email, code }) }),
  session: () => apiFetch<{ user: AppUser }>('/api/mobile/auth/session'),
  logout: () => apiFetch<{ ok: true }>('/api/mobile/auth/session', { method: 'DELETE' }),
  deleteAccount: () => apiFetch<{ ok: true }>('/api/mobile/account', { method: 'DELETE' }),
};
export const pushApi = {
  save: (token: string, platform: string) => apiFetch<{ ok: true }>('/api/mobile/push', { method: 'POST', body: JSON.stringify({ token, platform }) }),
  remove: (token: string) => apiFetch<{ ok: true }>('/api/mobile/push', { method: 'DELETE', body: JSON.stringify({ token }) }),
};
export type AppUser = { userId: string; email: string; displayName: string; fullName: string | null };
