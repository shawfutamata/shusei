import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen } from '@/components/app-screen';
import { RequestCard } from '@/components/request-card';
import { AppColors } from '@/constants/app';
import type { RequestItem } from '@/data/demo';
import { apiFetch } from '@/lib/api';

export default function RequestsScreen() {
  const [filter, setFilter] = useState('すべて'); const [favorites, setFavorites] = useState<string[]>([]); const [items, setItems] = useState<RequestItem[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { void apiFetch<{ requests: RequestItem[] }>('/api/board').then((result) => setItems(result.requests)).catch((error) => Alert.alert('読み込めませんでした', error instanceof Error ? error.message : '通信を確認してください。')).finally(() => setLoading(false)); }, []);
  const filtered = items.filter((item) => filter === 'すべて' || (filter === '案件' && item.category === 'project') || (filter === '協業先' && item.category === 'collaboration') || (filter === '相談' && item.category === 'consultation'));
  return <AppScreen title="みんなの困りごと" eyebrow="REQUESTS"><View style={styles.filters}>{['すべて', '案件', '協業先', '相談'].map((item) => <Pressable key={item} style={[styles.filter, filter === item && styles.selected]} onPress={() => setFilter(item)}><Text style={[styles.filterText, filter === item && styles.selectedText]}>{item}</Text></Pressable>)}</View>{loading ? <ActivityIndicator color={AppColors.blue} /> : filtered.length ? filtered.map((item) => <RequestCard key={item.id} item={item} favorite={favorites.includes(item.id)} onFavorite={() => setFavorites((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} onIntroduce={() => Alert.alert('紹介を届ける', `${item.authorName}さんへ紹介する人の情報を入力する画面へ進みます。`)} />) : <View><Text>該当する探しごとはありません。</Text></View>}</AppScreen>;
}
const styles = StyleSheet.create({ filters: { flexDirection: 'row', gap: 7 }, filter: { minHeight: 42, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: AppColors.line, borderRadius: 22, backgroundColor: '#fff' }, selected: { borderColor: AppColors.blue, backgroundColor: AppColors.blue }, filterText: { color: AppColors.muted, fontSize: 12, fontWeight: '900' }, selectedText: { color: '#fff' } });
