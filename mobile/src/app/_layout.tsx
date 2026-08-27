import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import { useAuth } from '@/lib/auth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <NotificationRouter />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F5F8FD' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile-edit" options={{ presentation: 'card' }} />
      </Stack>
    </AuthProvider>
  );
}

function NotificationRouter() {
  const { user, loading } = useAuth();
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  useEffect(() => {
    function capture(response: Notifications.NotificationResponse | null) {
      const requestId = response?.notification.request.content.data?.requestId;
      if (typeof requestId === 'string' && requestId) setPendingRequestId(requestId);
    }
    Notifications.getLastNotificationResponseAsync().then(capture).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(capture);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (loading || !user || !pendingRequestId) return;
    const requestId = pendingRequestId;
    router.push({ pathname: '/(tabs)/requests', params: { requestId } });
    const timeout = setTimeout(() => setPendingRequestId((current) => current === requestId ? null : current), 0);
    return () => clearTimeout(timeout);
  }, [loading, pendingRequestId, user]);

  return null;
}
