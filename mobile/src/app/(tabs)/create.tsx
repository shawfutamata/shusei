import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen, commonStyles } from '@/components/app-screen';
import { AppColors } from '@/constants/app';
import { industryGroups } from '@/constants/app';
import { budgetBands } from '@/constants/budget-options';
import { apiFetch } from '@/lib/api';

export default function CreateScreen() {
  const [category, setCategory] = useState('発注先'); const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [budget, setBudget] = useState(''); const [budgetBand, setBudgetBand] = useState(''); const [area, setArea] = useState(''); const [industry, setIndustry] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() {
    if (!title.trim() || !description.trim() || !budgetBand || !area.trim() || !industry) return Alert.alert('入力を確認してください', 'すべての項目を入力してください。');
    setBusy(true);
    try {
      await apiFetch('/api/board', { method: 'POST', body: JSON.stringify({ category: category === '発注先' ? 'project' : category === '協業先' ? 'collaboration' : 'consultation', title, description, budgetLabel: budget, budgetBand, area, industryTags: [industry], deadline: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) }) });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('投稿しました', '仲間からの紹介を待ちましょう。', [{ text: '困りごとを見る', onPress: () => router.replace('/requests') }]);
      setTitle(''); setDescription(''); setBudget(''); setBudgetBand(''); setArea('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '投稿できませんでした。';
      if (message.includes('顔写真')) Alert.alert('プロフィール設定が必要です', message, [{ text: '後で' }, { text: '設定する', onPress: () => router.push('/profile-edit') }]); else Alert.alert('投稿できませんでした', message);
    } finally { setBusy(false); }
  }
  return <AppScreen title="案件を投稿" eyebrow="NEW REQUEST"><Text style={styles.lead}>紹介してほしい人を具体的に書くと、仲間から紹介が集まりやすくなります。</Text><Field label="探しているもの"><View style={styles.choices}>{['発注先', '協業先', '相談・情報'].map((item) => <Pressable key={item} style={[styles.choice, category === item && styles.choiceSelected]} onPress={() => setCategory(item)}><Text style={[styles.choiceText, category === item && styles.choiceTextSelected]}>{item}</Text></Pressable>)}</View></Field><Field label="タイトル"><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="例：採用に強い動画制作会社" /></Field><Field label="詳しい内容"><TextInput style={[styles.input, styles.textarea]} value={description} onChangeText={setDescription} placeholder="課題と、紹介してほしい人を記入" multiline textAlignVertical="top" /></Field><Field label="予算"><View style={styles.tags}>{Object.entries(budgetBands).map(([value, label]) => <Pressable key={value} style={[styles.tag, budgetBand === value && styles.tagSelected]} onPress={() => setBudgetBand(value)}><Text style={[styles.tagText, budgetBand === value && styles.tagTextSelected]}>{label}</Text></Pressable>)}</View></Field><Field label="予算のくわしい書き方（任意）"><TextInput style={styles.input} value={budget} onChangeText={setBudget} placeholder="例：月額20〜40万円" /></Field><Field label="希望エリア"><TextInput style={styles.input} value={area} onChangeText={setArea} placeholder="例：東京都・オンライン" /></Field><Field label="関連する業種"><View style={styles.tags}>{industryGroups.map(([name]) => <Pressable key={name} style={[styles.tag, industry === name && styles.tagSelected]} onPress={() => setIndustry(name)}><Text style={[styles.tagText, industry === name && styles.tagTextSelected]}>{name}</Text></Pressable>)}</View></Field><Pressable style={[commonStyles.primaryButton, busy && { opacity: .55 }]} onPress={submit} disabled={busy}><Text style={commonStyles.primaryButtonText}>{busy ? '投稿中…' : 'この内容で投稿する'}</Text></Pressable></AppScreen>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>; }
const styles = StyleSheet.create({ lead: { padding: 14, borderRadius: 13, backgroundColor: AppColors.paleBlue, color: '#315A9D', fontSize: 13, lineHeight: 21, fontWeight: '800' }, field: { gap: 8 }, label: { color: '#30425F', fontSize: 14, fontWeight: '900' }, choices: { flexDirection: 'row', gap: 7 }, choice: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD7E7', borderRadius: 11, backgroundColor: '#fff' }, choiceSelected: { borderColor: AppColors.blue, backgroundColor: AppColors.blue }, choiceText: { color: AppColors.muted, fontSize: 12, fontWeight: '900' }, choiceTextSelected: { color: '#fff' }, input: { minHeight: 54, paddingHorizontal: 14, borderWidth: 1, borderColor: '#CBD7E7', borderRadius: 12, backgroundColor: '#fff', color: AppColors.ink, fontSize: 15, fontWeight: '700' }, textarea: { minHeight: 130, paddingTop: 14 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, tag: { paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: '#CBD7E7', borderRadius: 18, backgroundColor: '#fff' }, tagSelected: { borderColor: AppColors.blue, backgroundColor: AppColors.paleBlue }, tagText: { color: '#5E6F86', fontSize: 11, fontWeight: '800' }, tagTextSelected: { color: AppColors.blueDark } });
