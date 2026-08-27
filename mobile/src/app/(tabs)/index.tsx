import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppScreen, commonStyles } from '@/components/app-screen';
import { RequestCard } from '@/components/request-card';
import { AppColors, industryGroups } from '@/constants/app';
import type { RequestItem } from '@/data/demo';
import { apiFetch } from '@/lib/api';
import bannerRequest from '@/assets/givehub/top-request.webp';
import bannerIntroductions from '@/assets/givehub/top-introductions.webp';
import bannerRank from '@/assets/givehub/top-rank.webp';
import bannerCards from '@/assets/givehub/top-business-cards.webp';

const banners = [bannerRequest, bannerIntroductions, bannerRank, bannerCards];
const screenWidth = Dimensions.get('window').width;
export default function HomeScreen() {
  const [slide, setSlide] = useState(0); const [favorite, setFavorite] = useState(false); const [latest, setLatest] = useState<RequestItem | null>(null); const slider = useRef<ScrollView>(null); const bannerWidth = screenWidth - 32;
  useEffect(() => { apiFetch<{ requests: RequestItem[] }>('/api/board').then((result) => setLatest(result.requests[0] ?? null)).catch(() => undefined); }, []);
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) { setSlide(Math.round(event.nativeEvent.contentOffset.x / bannerWidth)); }
  return <AppScreen title="こんにちは" eyebrow="GIVE HUB"><View><ScrollView ref={slider} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll}>{banners.map((source, index) => <Pressable key={index} onPress={() => index === 3 ? router.push('/cards') : index === 2 ? router.push('/profile') : index === 0 ? router.push('/create') : router.push('/requests')}><Image source={source} style={[styles.banner, { width: bannerWidth }]} contentFit="cover" /></Pressable>)}</ScrollView><View style={styles.dots}>{banners.map((_, index) => <View key={index} style={[styles.dot, slide === index && styles.activeDot]} />)}</View></View><SectionTitle title="閲覧履歴" onMore={() => router.push('/requests')} />{latest ? <RequestCard item={latest} favorite={favorite} onFavorite={() => setFavorite((value) => !value)} onIntroduce={() => router.push('/requests')} /> : <View style={[commonStyles.card, styles.empty]}><Text style={commonStyles.secondary}>新しい探しごとを読み込んでいます。</Text></View>}<SectionTitle title="お気に入り" onMore={() => router.push('/requests')} /><View style={[commonStyles.card, styles.empty]}><Ionicons name="heart-outline" size={30} color={AppColors.blue} /><View style={{ flex: 1 }}><Text style={styles.emptyTitle}>{favorite ? '1件保存しています' : '気になる探しごとを保存'}</Text><Text style={commonStyles.secondary}>{favorite ? '閲覧履歴のカードを保存しました。' : 'ハートを押すとここにまとまります。'}</Text></View></View><SectionTitle title="ジャンルから探す" onMore={() => router.push('/requests')} /><View style={styles.grid}>{industryGroups.map(([name, icon]) => <Pressable key={name} style={styles.genre} onPress={() => router.push('/requests')}><View style={styles.genreIcon}><Ionicons name={icon} size={25} color={AppColors.blue} /></View><Text style={styles.genreName}>{name}</Text></Pressable>)}</View></AppScreen>;
}
function SectionTitle({ title, onMore }: { title: string; onMore: () => void }) { return <View style={styles.sectionTitle}><Text style={styles.sectionText}>{title}</Text><Pressable onPress={onMore}><Text style={styles.more}>もっと見る</Text></Pressable></View>; }
const styles = StyleSheet.create({ banner: { aspectRatio: 3 / 2, borderRadius: 20, backgroundColor: AppColors.blue }, dots: { height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, dot: { width: 7, height: 7, borderRadius: 8, backgroundColor: '#CAD4E2' }, activeDot: { width: 22, backgroundColor: AppColors.blue }, sectionTitle: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionText: { color: AppColors.ink, fontSize: 20, fontWeight: '900' }, more: { color: AppColors.blue, fontSize: 13, fontWeight: '900' }, empty: { flexDirection: 'row', alignItems: 'center', gap: 13 }, emptyTitle: { marginBottom: 3, color: AppColors.ink, fontSize: 14, fontWeight: '900' }, grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 }, genre: { width: '25%', alignItems: 'center', gap: 7 }, genreIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: AppColors.line, borderRadius: 17, backgroundColor: '#F9FCFF' }, genreName: { minHeight: 32, paddingHorizontal: 2, color: '#2A3952', fontSize: 10, lineHeight: 14, fontWeight: '900', textAlign: 'center' } });
