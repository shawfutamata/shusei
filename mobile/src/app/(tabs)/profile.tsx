import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Linking, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { AppScreen, commonStyles } from '@/components/app-screen';
import { AppColors } from '@/constants/app';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasRegisteredPushToken, registerForPushNotifications, unregisterPushNotifications } from '@/lib/notifications';
import { serviceName, serviceUrl } from '@/constants/brand';

type Invite = { code: string; url: string; invitedCount: number; activeCount: number; waitingCount: number };
type Stats = { displayName: string; venue: string; company: string; positionTitle: string; badge: string; businessArea: string; introCount: number; points: number; rank: string; nextRankAt: number };

export default function ProfileScreen() {
  const { user, signOut, deleteAccount } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [busy, setBusy] = useState(false);
  // 招待は会費に触れない情報だけ扱う。金額・割引はアプリに出さない。
  const [invite, setInvite] = useState<Invite | null>(null);
  useEffect(() => {
    apiFetch<{ stats: Stats }>('/api/board').then((result) => setStats(result.stats)).catch(() => undefined);
    hasRegisteredPushToken().then(setNotifications).catch(() => undefined);
  }, []);
  async function toggleNotifications(enabled: boolean) {
    setBusy(true);
    try {
      if (enabled) {
        await registerForPushNotifications();
        setNotifications(true);
        Alert.alert('通知を設定しました', '選んだ関連業種の探しごとが投稿されると通知します。');
      } else {
        await unregisterPushNotifications();
        setNotifications(false);
      }
    }
    catch (error) { Alert.alert('通知を設定できません', error instanceof Error ? error.message : '端末設定を確認してください。'); }
    finally { setBusy(false); }
  }
  function confirmDelete() {
    Alert.alert('アカウントを削除しますか？', 'プロフィール、投稿、紹介、登録した画像を含むアカウントデータが削除され、元に戻せません。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '完全に削除', style: 'destructive', onPress: async () => { setBusy(true); try { await deleteAccount(); } catch (error) { Alert.alert('削除できませんでした', error instanceof Error ? error.message : '時間をおいてお試しください。'); } finally { setBusy(false); } } },
    ]);
  }
  useEffect(() => { apiFetch<Invite>('/api/invite').then(setInvite).catch(() => {}); }, []);
  async function shareInvite() {
    if (!invite) return;
    await Share.share({ message: `${serviceName}に招待します。\n${invite.url}` });
  }
  return <AppScreen title="マイページ" eyebrow="MY PAGE">
    {!stats ? <ActivityIndicator color={AppColors.blue} /> : <View style={[styles.rankCard, rankStyle(stats.rank)]}><View style={styles.rankTop}><View><Text style={[styles.rankBrand, { color: rankText(stats.rank) }]}>MEMBER RANK</Text><Text style={[styles.rankName, { color: rankText(stats.rank) }]}>{stats.rank}</Text></View><Ionicons name="diamond-outline" size={38} color={rankText(stats.rank)} /></View><View style={styles.person}><View style={styles.avatar}><Ionicons name="person" size={34} color="#fff" /></View><View style={{ flex: 1 }}><Text style={[styles.name, { color: rankText(stats.rank) }]}>{stats.displayName}</Text><Text style={[styles.meta, { color: rankText(stats.rank) }]}>{[stats.badge, stats.venue].filter(Boolean).join('・') || 'プロフィール未設定'}</Text><Text style={[styles.company, { color: rankText(stats.rank) }]}>{[stats.company, stats.positionTitle].filter(Boolean).join('｜')}</Text></View></View><View style={styles.rankStats}><Stat number={stats.introCount} label="紹介した数" color={rankText(stats.rank)} /><Stat number={stats.points} label="ポイント" color={rankText(stats.rank)} /><Stat number={Math.max(0, stats.nextRankAt - stats.introCount)} label="次ランクまで" color={rankText(stats.rank)} /></View></View>}
    <View style={commonStyles.card}><Text style={styles.sectionTitle}>通知設定</Text><View style={styles.settingRow}><View style={styles.settingIcon}><Ionicons name="notifications-outline" size={24} color={AppColors.blue} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>関連する探しごとの通知</Text><Text style={styles.settingText}>プロフィールで選んだ関連業種の新着だけ通知します。</Text></View>{busy ? <ActivityIndicator color={AppColors.blue} /> : <Switch value={notifications} onValueChange={toggleNotifications} trackColor={{ true: '#93C5FD' }} thumbColor={notifications ? AppColors.blue : '#fff'} />}</View></View>
    <View style={commonStyles.card}><Text style={styles.sectionTitle}>仲間を招待する</Text><Text style={styles.inviteLead}>招待リンクを送ると、その方も同じ掲示板に参加できます。運営が確認したうえでご利用いただけます。</Text>{invite ? <><Pressable style={styles.inviteLink} onPress={shareInvite}><Text style={styles.inviteUrl} numberOfLines={1}>{invite.url}</Text><Ionicons name="share-outline" size={20} color={AppColors.blue} /></Pressable><View style={styles.inviteStats}><InviteStat number={invite.invitedCount} label="招待した人" /><InviteStat number={invite.activeCount} label="利用中" /><InviteStat number={invite.waitingCount} label="確認待ち" /></View></> : <ActivityIndicator color={AppColors.blue} />}</View>

    <View style={commonStyles.card}><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>会員情報</Text><Pressable onPress={() => router.push('/profile-edit')}><Text style={styles.edit}>編集する</Text></Pressable></View><Info label="氏名" value={stats?.displayName || user?.displayName || ''} /><Info label="メール" value={user?.email || ''} /><Info label="所属会場" value={stats?.venue || '未設定'} /><Info label="活動エリア" value={stats?.businessArea || '未設定'} /></View>
    <View style={styles.contractNote}><Ionicons name="shield-checkmark-outline" size={25} color={AppColors.blue} /><View style={{ flex: 1 }}><Text style={styles.contractTitle}>守成クラブ会員専用</Text><Text style={styles.contractText}>登録済みの会員情報と利用状態を安全に確認しています。</Text></View></View>
    <Pressable style={styles.policyLink} onPress={() => Linking.openURL(`${serviceUrl}/privacy`)}><Ionicons name="document-text-outline" size={18} color={AppColors.blue} /><Text style={styles.policyLinkText}>プライバシーポリシー</Text></Pressable>
    <Pressable style={styles.signOut} onPress={signOut}><Text style={styles.signOutText}>ログアウト</Text></Pressable>
    <Pressable style={styles.delete} onPress={confirmDelete} disabled={busy}><Text style={styles.deleteText}>アカウントを削除</Text></Pressable>
  </AppScreen>;
}

function Stat({ number, label, color }: { number: number; label: string; color: string }) { return <View style={styles.stat}><Text style={[styles.statNumber, { color }]}>{number}</Text><Text style={[styles.statLabel, { color }]}>{label}</Text></View>; }
function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }
function rankText(rank: string) { return rank === 'DIAMOND' || rank === 'RUBY' ? '#F8FAFC' : '#62513D'; }
function rankStyle(rank: string) { if (rank === 'DIAMOND') return { backgroundColor: '#1F2937', borderColor: '#9CA3AF' }; if (rank === 'RUBY') return { backgroundColor: '#741F34', borderColor: '#F59AAE' }; if (rank === 'SAPPHIRE') return { backgroundColor: '#E7EFFB', borderColor: '#6B91C7' }; if (rank === 'EMERALD') return { backgroundColor: '#E8F1EA', borderColor: '#6F9C86' }; return { backgroundColor: '#F5EEDF', borderColor: '#C9B58F' }; }
function InviteStat({ number, label }: { number: number; label: string }) {
  return <View style={styles.inviteStat}><Text style={styles.inviteNumber}>{number}</Text><Text style={styles.inviteLabel}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  inviteLead: { marginTop: 6, color: AppColors.muted, fontSize: 12, lineHeight: 19, fontWeight: '700' },
  inviteLink: { minHeight: 52, marginTop: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#BDD2F5', borderStyle: 'dashed', borderRadius: 13, backgroundColor: '#F5F9FF' },
  inviteUrl: { flex: 1, color: AppColors.blue, fontSize: 12, fontWeight: '800' },
  inviteStats: { marginTop: 11, flexDirection: 'row', gap: 9 },
  inviteStat: { flex: 1, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#E2E9F3', borderRadius: 12, backgroundColor: '#fff' },
  inviteNumber: { color: AppColors.ink, fontSize: 21, fontWeight: '900' },
  inviteLabel: { marginTop: 3, color: AppColors.muted, fontSize: 10, fontWeight: '800' },
  rankCard: { padding: 19, borderWidth: 1.5, borderRadius: 22 }, rankTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }, rankBrand: { opacity: .75, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, rankName: { marginTop: 4, fontSize: 25, fontWeight: '900', letterSpacing: 2 }, person: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, backgroundColor: 'rgba(37,99,235,.7)' }, name: { fontSize: 19, fontWeight: '900' }, meta: { marginTop: 4, opacity: .82, fontSize: 12, fontWeight: '800' }, company: { marginTop: 3, opacity: .72, fontSize: 10, fontWeight: '700' }, rankStats: { marginTop: 19, paddingTop: 15, flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,.25)' }, stat: { flex: 1, alignItems: 'center' }, statNumber: { fontSize: 22, fontWeight: '900' }, statLabel: { marginTop: 4, opacity: .72, fontSize: 10, fontWeight: '800' }, sectionHeading: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: AppColors.ink, fontSize: 16, fontWeight: '900' }, edit: { color: AppColors.blue, fontSize: 12, fontWeight: '900' }, settingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, settingIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: AppColors.paleBlue }, settingTitle: { color: '#2C4261', fontSize: 13, fontWeight: '900' }, settingText: { marginTop: 3, color: AppColors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' }, info: { paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', gap: 15, borderTopWidth: 1, borderTopColor: '#EDF2F7' }, infoLabel: { color: AppColors.muted, fontSize: 12, fontWeight: '800' }, infoValue: { flex: 1, color: AppColors.ink, fontSize: 12, fontWeight: '800', textAlign: 'right' }, contractNote: { padding: 15, flexDirection: 'row', gap: 11, borderRadius: 15, backgroundColor: AppColors.paleBlue }, contractTitle: { color: '#27486E', fontSize: 13, fontWeight: '900' }, contractText: { marginTop: 4, color: '#5C718D', fontSize: 10, lineHeight: 16, fontWeight: '700' }, policyLink: { minHeight: 50, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#C9D8EC', borderRadius: 13, backgroundColor: '#fff' }, policyLinkText: { color: AppColors.blueDark, fontSize: 13, fontWeight: '900' }, signOut: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#B9C8DC', borderRadius: 13, backgroundColor: '#fff' }, signOutText: { color: '#425672', fontSize: 14, fontWeight: '900' }, delete: { paddingVertical: 11, alignItems: 'center' }, deleteText: { color: '#B42318', fontSize: 12, fontWeight: '800' },
});
