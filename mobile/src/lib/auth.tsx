import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, clearSessionToken, getSessionToken, saveSessionToken, type AppUser } from './api';
import { unregisterPushNotifications } from './notifications';
type AuthValue = { user: AppUser | null; loading: boolean; requestCode: (email: string) => Promise<void>; verifyCode: (email: string, code: string) => Promise<void>; signOut: () => Promise<void>; deleteAccount: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AppUser | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { getSessionToken().then((token) => token ? authApi.session().then((result) => setUser(result.user)).catch(clearSessionToken) : undefined).finally(() => setLoading(false)); }, []);
  const value = useMemo<AuthValue>(() => ({ user, loading, requestCode: async (email) => { await authApi.requestCode(email); }, verifyCode: async (email, code) => { const result = await authApi.verifyCode(email, code); await saveSessionToken(result.token); setUser(result.user); }, signOut: async () => { await unregisterPushNotifications().catch(() => undefined); await authApi.logout().catch(() => undefined); await clearSessionToken(); setUser(null); }, deleteAccount: async () => { await authApi.deleteAccount(); await clearSessionToken(); setUser(null); } }), [loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider is missing'); return value; }
