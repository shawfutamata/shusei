import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen, commonStyles } from '@/components/app-screen';
import { AppColors, industryGroups, prefectures } from '@/constants/app';
import { findVenuePrefecture, isListedVenue, venuePrefectures, venuesByPrefecture } from '@/constants/venues';
import { apiFetch } from '@/lib/api';

type Stats = { company: string; venue: string; positionTitle: string; businessArea: string; primaryIndustry: string; notifyIndustries: string[]; annualRevenueBand: string; avatarUrl: string };
const revenues = [['revenue_10_30','1000万〜3000万'],['revenue_30_70','3000万〜7000万'],['revenue_70_100','7000万〜1億'],['revenue_100_plus','1億以上']];

export default function ProfileEditScreen() {
  const [form, setForm] = useState<Stats>({ company: '', venue: '', positionTitle: '', businessArea: '', primaryIndustry: '', notifyIndustries: [], annualRevenueBand: '', avatarUrl: '' });
  const [avatar, setAvatar] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [venuePrefecture, setVenuePrefecture] = useState(''); const [venueOther, setVenueOther] = useState(false);
  useEffect(() => { apiFetch<{ stats: Stats }>('/api/board').then((result) => { setForm(result.stats); setVenuePrefecture(findVenuePrefecture(result.stats.venue)); setVenueOther(Boolean(result.stats.venue) && !isListedVenue(result.stats.venue)); }).catch((error) => Alert.alert('読み込めませんでした', error instanceof Error ? error.message : '')).finally(() => setLoading(false)); }, []);
  function change<K extends keyof Stats>(key: K, value: Stats[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function pickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('写真へのアクセスを許可してください。');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (result.canceled) return;
    const normalized = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 1000, height: 1000 } }], { compress: .88, format: ImageManipulator.SaveFormat.JPEG });
    setAvatar(normalized.uri);
  }
  function toggleNotify(value: string) { change('notifyIndustries', form.notifyIndustries.includes(value) ? form.notifyIndustries.filter((item) => item !== value) : form.notifyIndustries.length < 6 ? [...form.notifyIndustries, value] : form.notifyIndustries); }
  async function save() {
    if (!form.company.trim() || !form.venue.trim()) return Alert.alert('入力を確認してください', '会社・屋号と所属会場は必須です。');
    if (!avatar && !form.avatarUrl) return Alert.alert('顔写真を登録してください', '本人確認のため、顔がわかる写真が必須です。');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('company', form.company); body.append('venue', form.venue); body.append('positionTitle', form.positionTitle); body.append('businessArea', form.businessArea); body.append('primaryIndustry', form.primaryIndustry); body.append('notifyIndustries', JSON.stringify(form.notifyIndustries)); body.append('annualRevenueBand', form.annualRevenueBand);
      if (avatar) body.append('avatar', { uri: avatar, name: 'profile.jpg', type: 'image/jpeg' } as unknown as Blob);
      await apiFetch('/api/profile', { method: 'PATCH', body });
      Alert.alert('保存しました', 'プロフィールを更新しました。', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error) { Alert.alert('保存できませんでした', error instanceof Error ? error.message : '入力を確認してください。'); }
    finally { setBusy(false); }
  }
  if (loading) return <View style={styles.loading}><ActivityIndicator color={AppColors.blue} /></View>;
  return <AppScreen title="プロフィール編集" eyebrow="PROFILE" action={<Pressable onPress={() => router.back()}><Ionicons name="close" size={29} color={AppColors.ink} /></Pressable>}>
    <View style={styles.avatarArea}><View style={styles.avatar}>{avatar || form.avatarUrl ? <Image source={{ uri: avatar || form.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" alt="プロフィールの顔写真" /> : <Ionicons name="person" size={48} color="#fff" />}</View><Pressable style={styles.photoButton} onPress={pickAvatar}><Ionicons name="crop-outline" size={19} color={AppColors.blue} /><Text style={styles.photoButtonText}>写真を選んで顔をトリミング</Text></Pressable><Text style={styles.required}>顔写真は必須です</Text></View>
    <Field label="会社・屋号（必須）" value={form.company} onChangeText={(value) => change('company', value)} placeholder="株式会社〇〇" />
    <SelectBlock label="所属会場（必須）"><Text style={styles.guideText}>都道府県を選ぶと、その中の会場が出ます。一覧にない会場は「その他」から入力してください。</Text><ChipList values={[...venuePrefectures, 'その他']} selected={[venueOther ? 'その他' : venuePrefecture]} onPress={(value) => { if (value === 'その他') { setVenueOther(true); setVenuePrefecture(''); change('venue', ''); } else { setVenueOther(false); setVenuePrefecture(value); change('venue', ''); } }} />{venueOther ? <Field label="会場名" value={form.venue} onChangeText={(value) => change('venue', value)} placeholder="例：ひるのめぐろ会場" /> : venuePrefecture ? <ChipList values={venuesByPrefecture[venuePrefecture] ?? []} selected={[form.venue]} onPress={(value) => change('venue', value)} /> : null}</SelectBlock>
    <Field label="役職・肩書き" value={form.positionTitle} onChangeText={(value) => change('positionTitle', value)} placeholder="例：世話人" />
    <SelectBlock label="活動エリア（47都道府県）"><ChipList values={[...prefectures]} selected={[form.businessArea]} onPress={(value) => change('businessArea', value)} /></SelectBlock>
    <SelectBlock label="主な業種"><ChipList values={industryGroups.map(([name]) => name)} selected={[form.primaryIndustry]} onPress={(value) => change('primaryIndustry', value)} /></SelectBlock>
    <SelectBlock label={`通知を受けたい関連業種（${form.notifyIndustries.length}/6）`}><Text style={styles.guideText}>選んだ業種の探しごとが投稿されると通知します。</Text><ChipList values={industryGroups.map(([name]) => name)} selected={form.notifyIndustries} onPress={toggleNotify} /></SelectBlock>
    <SelectBlock label="会社の年商（任意）"><ChipList values={revenues.map(([, label]) => label)} selected={revenues.filter(([value]) => value === form.annualRevenueBand).map(([, label]) => label)} onPress={(label) => change('annualRevenueBand', revenues.find(([, item]) => item === label)?.[0] ?? '')} /></SelectBlock>
    <Pressable style={[commonStyles.primaryButton, busy && { opacity: .55 }]} onPress={save} disabled={busy}><Text style={commonStyles.primaryButtonText}>{busy ? '保存中…' : 'プロフィールを保存する'}</Text></Pressable>
  </AppScreen>;
}
function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} style={styles.input} /></View>; }
function SelectBlock({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>; }
function ChipList({ values, selected, onPress }: { values: readonly string[]; selected: string[]; onPress: (value: string) => void }) { return <View style={styles.chips}>{values.map((value) => <Pressable key={value} style={[styles.chip, selected.includes(value) && styles.chipSelected]} onPress={() => onPress(value)}><Text style={[styles.chipText, selected.includes(value) && styles.chipTextSelected]}>{value}</Text></Pressable>)}</View>; }
const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.paper }, avatarArea: { alignItems: 'center', gap: 9 }, avatar: { width: 118, height: 118, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#DBEAFE', borderRadius: 59, backgroundColor: '#91A4BE' }, photoButton: { minHeight: 42, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#BDD2F5', borderRadius: 22, backgroundColor: '#fff' }, photoButtonText: { color: AppColors.blue, fontSize: 12, fontWeight: '900' }, required: { color: '#B42318', fontSize: 10, fontWeight: '800' }, field: { gap: 8 }, label: { color: '#30425F', fontSize: 14, fontWeight: '900' }, input: { minHeight: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: '#CBD7E7', borderRadius: 12, backgroundColor: '#fff', color: AppColors.ink, fontSize: 15, fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#CBD7E7', borderRadius: 20, backgroundColor: '#fff' }, chipSelected: { borderColor: AppColors.blue, backgroundColor: AppColors.blue }, chipText: { color: '#5F6F85', fontSize: 11, fontWeight: '800' }, chipTextSelected: { color: '#fff' }, guideText: { color: AppColors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700' } });
