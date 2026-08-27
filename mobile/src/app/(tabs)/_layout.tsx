import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { AppColors } from '@/constants/app';
import { useAuth } from '@/lib/auth';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = { index: 'home-outline', requests: 'search-outline', create: 'add-circle-outline', cards: 'id-card-outline', profile: 'person-outline' };
export default function TabsLayout() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={AppColors.blue} /></View>;
  if (!user) return <Redirect href="/" />;
  return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: AppColors.blue, tabBarInactiveTintColor: '#8693A7', tabBarLabelStyle: { fontSize: 11, fontWeight: '800' }, tabBarStyle: { height: 82, paddingTop: 7, paddingBottom: 18, borderTopColor: AppColors.line, backgroundColor: '#fff' }, tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name]} size={route.name === 'create' ? size + 7 : size} color={color} /> })}>
    <Tabs.Screen name="index" options={{ title: 'ホーム' }} /><Tabs.Screen name="requests" options={{ title: '困りごと' }} /><Tabs.Screen name="create" options={{ title: '投稿' }} /><Tabs.Screen name="cards" options={{ title: '名刺' }} /><Tabs.Screen name="profile" options={{ title: 'マイページ' }} />
  </Tabs>;
}
