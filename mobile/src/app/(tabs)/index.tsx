import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Linking, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppScreen, commonStyles } from '@/components/app-screen';
import { RequestCard } from '@/components/request-card';
import { AppColors, industryGroups } from '@/constants/app';
import type { RequestItem } from '@/data/demo';
import { adApi, apiFetch, apiImageSource, type AdSlot, type ApiImageSource } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getRequestPreferences, recordViewedRequest, toggleFavoriteRequest } from '@/lib/request-preferences';
import bannerRequest from '@/assets/givehub/top-request.webp';
import bannerIntroductions from '@/assets/givehub/top-introductions.webp';
import bannerRank from '@/assets/givehub/top-rank.webp';
import { serviceName } from '@/constants/brand';

const banners = [bannerRequest, bannerIntroductions, bannerRank];
const screenWidth = Dimensions.get('window').width;
export default function HomeScreen() {
  const { user } = useAuth();
  const [slide, setSlide] = useState(0); const [requests, setRequests] = useState<RequestItem[]>([]); const [viewedIds, setViewedIds] = useState<string[]>([]); const [favoriteIds, setFavoriteIds] = useState<string[]>([]); const slider = useRef<ScrollView>(null); const bannerWidth = screenWidth - 32;
  // 掲載中の広告。お金をいただいている枠なので、案内のバナーより先に置く。
  const [ads, setAds] = useState<{ ad: AdSlot; source: ApiImageSource | null }[]>([]);
  const seenAds = useRef<Set<string>>(new Set());
  useFocusEffect(useCallback(() => {
    if (!user) return;
    let active = true;
    Promise.all([apiFetch<{ requests: RequestItem[]; ads?: AdSlot[] }>('/api/board'), getRequestPreferences(user.userId)]).then(async ([board, preferences]) => {
      if (!active) return;
      setRequests(board.requests);
      setViewedIds(preferences.viewedIds);
      setFavoriteIds(preferences.favoriteIds);
      const shown = board.ads ?? [];
      const sources = await Promise.all(shown.map(async (ad) => ({ ad, source: await apiImageSource(ad.imageUrl) })));
      if (!active) return;
      setAds(sources);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user]));
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) { setSlide(Math.round(event.nativeEvent.contentOffset.x / bannerWidth)); }
  // 広告は自分から送らないと見てもらえない。一定の間隔で次へ送る。
  useEffect(() => {
    const total = ads.length + banners.length;
    if (total < 2) return;
    const timer = setInterval(() => {
      setSlide((current) => {
        const next = (current + 1) % total;
        slider.current?.scrollTo({ x: next * bannerWidth, animated: true });
        return next;
      });
    }, 5200);
    return () => clearInterval(timer);
  }, [ads.length, bannerWidth]);
  // 見られた数は、同じ広告につきこの起動で1回だけ数える。書き込みを増やさないため。
  useEffect(() => {
    const shown = ads[slide]?.ad;
    if (!shown || seenAds.current.has(shown.id)) return;
    seenAds.current.add(shown.id);
    adApi.track({ views: [shown.id] }).catch(() => undefined);
  }, [slide, ads]);
  function openAd(ad: AdSlot) {
    adApi.track({ clicks: [ad.id] }).catch(() => undefined);
    if (ad.linkUrl) Linking.openURL(ad.linkUrl).catch(() => undefined);
  }
  const viewed = viewedIds.map((id) => requests.find((item) => item.id === id)).filter((item): item is RequestItem => Boolean(item)).slice(0, 2);
  const favorites = favoriteIds.map((id) => requests.find((item) => item.id === id)).filter((item): item is RequestItem => Boolean(item)).slice(0, 2);
  async function openRequest(item: RequestItem) { if (user) setViewedIds(await recordViewedRequest(user.userId, item.id)); router.push({ pathname: '/(tabs)/requests', params: { requestId: item.id } }); }
  async function toggleFavorite(item: RequestItem) { if (user) setFavoriteIds(await toggleFavoriteRequest(user.userId, item.id)); }
  return <AppScreen title="こんにちは" eyebrow={serviceName}><View><ScrollView ref={slider} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll}>{ads.map(({ ad, source }) => <Pressable key={ad.id} onPress={() => openAd(ad)}><View style={[styles.banner, { width: bannerWidth }]}>{source ? <Image source={source} style={styles.adImage} contentFit="cover" alt="" /> : null}<View style={styles.adShade} /><View style={styles.adTag}><Text style={styles.adTagText}>PR</Text><Text style={styles.adTagName} numberOfLines={1}>{ad.memberCompany || ad.memberName}</Text></View><View style={styles.adCopy}><Text style={styles.adTitle} numberOfLines={3}>{ad.title}</Text>{!!ad.description && <Text style={styles.adDesc} numberOfLines={2}>{ad.description}</Text>}</View></View></Pressable>)}{banners.map((source, index) => <Pressable key={index} onPress={() => index === 2 ? router.push('/profile') : index === 0 ? router.push('/create') : router.push('/requests')}><Image source={source} style={[styles.banner, { width: bannerWidth }]} contentFit="cover" alt={`${serviceName}の機能案内 ${index + 1}`} /></Pressable>)}</ScrollView><View style={styles.dots}>{[...ads, ...banners].map((_, index) => <View key={index} style={[styles.dot, slide === index && styles.activeDot]} />)}</View></View><SectionTitle title="閲覧履歴" onMore={() => router.push('/requests')} />{viewed.length ? viewed.map((item) => <RequestCard key={item.id} item={item} favorite={favoriteIds.includes(item.id)} onOpen={() => openRequest(item)} onFavorite={() => toggleFavorite(item)} onIntroduce={() => router.push({ pathname: '/(tabs)/requests', params: { requestId: item.id, introduce: '1' } })} />) : <Empty icon="time-outline" title="まだ閲覧履歴がありません" text="探しごとを開くと、ここからすぐ見返せます。" />}<SectionTitle title="お気に入り" onMore={() => router.push('/requests')} />{favorites.length ? favorites.map((item) => <RequestCard key={item.id} item={item} favorite onOpen={() => openRequest(item)} onFavorite={() => toggleFavorite(item)} onIntroduce={() => router.push({ pathname: '/(tabs)/requests', params: { requestId: item.id, introduce: '1' } })} />) : <Empty icon="heart-outline" title="気になる探しごとを保存" text="ハートを押すとここにまとまります。" />}<SectionTitle title="ジャンルから探す" onMore={() => router.push('/requests')} /><View style={styles.grid}>{industryGroups.map(([name, icon]) => <Pressable key={name} style={styles.genre} onPress={() => router.push({ pathname: '/(tabs)/requests', params: { industry: name } })}><View style={styles.genreIcon}><Ionicons name={icon} size={25} color={AppColors.blue} /></View><Text style={styles.genreName}>{name}</Text></Pressable>)}</View></AppScreen>;
}
function SectionTitle({ title, onMore }: { title: string; onMore: () => void }) { return <View style={styles.sectionTitle}><Text style={styles.sectionText}>{title}</Text><Pressable onPress={onMore}><Text style={styles.more}>もっと見る</Text></Pressable></View>; }
function Empty({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) { return <View style={[commonStyles.card, styles.empty]}><Ionicons name={icon} size={30} color={AppColors.blue} /><View style={{ flex: 1 }}><Text style={styles.emptyTitle}>{title}</Text><Text style={commonStyles.secondary}>{text}</Text></View></View>; }
const styles = StyleSheet.create({ banner: { aspectRatio: 3 / 2, borderRadius: 20, overflow: 'hidden', backgroundColor: AppColors.blueDark, justifyContent: 'flex-end' }, adImage: { position: 'absolute', inset: 0, borderRadius: 20 }, adShade: { position: 'absolute', inset: 0, borderRadius: 20, backgroundColor: 'rgba(8,22,45,.45)' }, adTag: { position: 'absolute', left: 11, top: 11, maxWidth: '70%', paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 99, backgroundColor: 'rgba(11,32,66,.72)' }, adTagText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, adTagName: { flexShrink: 1, color: '#fff', fontSize: 10, fontWeight: '800' }, adCopy: { position: 'absolute', left: 18, right: 18, bottom: 18, gap: 5 }, adTitle: { color: '#fff', fontSize: 21, lineHeight: 30, fontWeight: '900' }, adDesc: { color: '#DCE9FB', fontSize: 12, lineHeight: 19, fontWeight: '700' }, dots: { height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, dot: { width: 7, height: 7, borderRadius: 8, backgroundColor: '#CAD4E2' }, activeDot: { width: 22, backgroundColor: AppColors.blue }, sectionTitle: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionText: { color: AppColors.ink, fontSize: 20, fontWeight: '900' }, more: { color: AppColors.blue, fontSize: 13, fontWeight: '900' }, empty: { flexDirection: 'row', alignItems: 'center', gap: 13 }, emptyTitle: { marginBottom: 3, color: AppColors.ink, fontSize: 14, fontWeight: '900' }, grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 }, genre: { width: '25%', alignItems: 'center', gap: 7 }, genreIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: AppColors.line, borderRadius: 17, backgroundColor: '#F9FCFF' }, genreName: { minHeight: 32, paddingHorizontal: 2, color: '#2A3952', fontSize: 10, lineHeight: 14, fontWeight: '900', textAlign: 'center' } });
