import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { pushApi } from './api';

const pushTokenKey = 'member-hub-expo-push-token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) throw new Error('通知の確認には実機が必要です。');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('requests', {
      name: '関連する探しごと',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
    });
  }
  let permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') permissions = await Notifications.requestPermissionsAsync();
  if (permissions.status !== 'granted') throw new Error('端末の設定から通知を許可してください。');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('通知用のアプリ設定が未完了です。');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await pushApi.save(token, Platform.OS);
  await SecureStore.setItemAsync(pushTokenKey, token);
  return token;
}

export async function hasRegisteredPushToken() {
  return Boolean(await SecureStore.getItemAsync(pushTokenKey));
}

export async function unregisterPushNotifications() {
  const token = await SecureStore.getItemAsync(pushTokenKey);
  try {
    if (token) await pushApi.remove(token);
  } finally {
    await SecureStore.deleteItemAsync(pushTokenKey);
  }
}
