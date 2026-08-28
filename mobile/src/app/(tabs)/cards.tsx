import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { recognizeText } from 'rn-mlkit-ocr';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen, commonStyles } from '@/components/app-screen';
import { AppColors } from '@/constants/app';
import { apiFetch } from '@/lib/api';
import { parseBusinessCardTexts, type CardDraft } from '@/lib/business-card-parser';

export default function CardsScreen() {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  // 読み取りは有料機能。無料会員には画面そのものを出さない。
  // 価格・割引・購入への誘導はアプリ内に置かない（docs/billing-architecture.md）。
  const [pro, setPro] = useState<boolean | null>(null);
  useEffect(() => { apiFetch<{ pro: boolean }>('/api/entitlements').then((result) => setPro(result.pro)).catch(() => setPro(true)); }, []);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<CardDraft[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reading, setReading] = useState(false);
  const [readingIndex, setReadingIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  async function normalizeImage(uri: string) {
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 2400 } }], { compress: .94, format: ImageManipulator.SaveFormat.JPEG });
    return result.uri;
  }
  async function openCamera() {
    if (!permission?.granted && !(await requestPermission()).granted) return Alert.alert('カメラの許可が必要です');
    setCameraOpen(true);
  }
  async function capture() {
    const photo = await camera.current?.takePictureAsync({ quality: 1, skipProcessing: false });
    if (photo?.uri) setImages((current) => [...current, photo.uri].slice(0, 20));
    setCameraOpen(false);
  }
  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 20, quality: 1 });
    if (!result.canceled) setImages((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 20));
  }
  async function scanCards() {
    setReading(true); setReadingIndex(0);
    try {
      const normalized: string[] = []; const scanned: CardDraft[] = [];
      for (let index = 0; index < images.length; index += 1) {
        setReadingIndex(index);
        const uri = await normalizeImage(images[index]); normalized.push(uri);
        const japanese = await recognizeText(uri, 'japanese');
        const latin = await recognizeText(uri, 'latin');
        scanned.push(parseBusinessCardTexts(uri, [japanese.text, latin.text, ...japanese.blocks.flatMap((block) => block.lines.map((line) => line.text)), ...latin.blocks.flatMap((block) => block.lines.map((line) => line.text))]));
      }
      setImages(normalized); setDrafts(scanned); setReviewIndex(0);
    } catch (error) {
      Alert.alert('名刺を読み取れませんでした', error instanceof Error ? error.message : '画像を確認してもう一度お試しください。');
    } finally { setReading(false); }
  }
  function updateDraft(key: keyof Omit<CardDraft, 'uri'>, value: string) {
    setDrafts((current) => current.map((draft, index) => index === reviewIndex ? { ...draft, [key]: value } : draft));
  }
  async function saveCards() {
    setSaving(true);
    try {
      const body = new FormData();
      body.append('cards', JSON.stringify(drafts.map((card) => {
        const { uri, ...fields } = card;
        void uri;
        return { ...fields, isFavorite: false };
      })));
      drafts.forEach((draft, index) => body.append(`image_${index}`, { uri: draft.uri, name: `business-card-${index + 1}.jpg`, type: 'image/jpeg' } as unknown as Blob));
      await apiFetch('/api/business-cards', { method: 'POST', body });
      const count = drafts.length; setDrafts([]); setImages([]);
      Alert.alert('名刺を登録しました', `${count}枚を本人専用の名刺リストへ保存しました。`);
    } catch (error) { Alert.alert('登録できませんでした', error instanceof Error ? error.message : '内容を確認してください。'); }
    finally { setSaving(false); }
  }

  if (cameraOpen) return <View style={styles.cameraPage}><CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" /><View style={styles.cameraHeader}><Pressable onPress={() => setCameraOpen(false)}><Ionicons name="close" size={34} color="#fff" /></Pressable><Text style={styles.cameraTitle}>名刺を枠内に合わせてください</Text><View style={{ width: 34 }} /></View><View style={styles.guide} /><View style={styles.shutterRow}><Pressable style={styles.shutter} onPress={capture}><View style={styles.shutterInner} /></Pressable></View></View>;
  const draft = drafts[reviewIndex];
  if (pro === false) return <AppScreen title="名刺リスト" eyebrow="BUSINESS CARDS"><View style={commonStyles.card}><Text style={styles.guideTitle2}>まとめて読み取る機能はご利用いただけません</Text><Text style={styles.guideText2}>ご利用中のアカウントでは、カメラでの一括読み取りをお使いいただけません。ご不明な点は運営窓口へお問い合わせください。</Text></View></AppScreen>;
  return <>
    <AppScreen title="名刺リスト" eyebrow="BUSINESS CARDS">
      <View style={styles.guideCard}><Ionicons name="scan-outline" size={38} color="#fff" /><View style={{ flex: 1 }}><Text style={styles.guideTitle}>日本語・英語を高精度読み取り</Text><Text style={styles.guideText}>カメラで撮影、または写真から最大20枚を選べます。</Text></View></View>
      <View style={styles.actions}><CaptureAction icon="camera-outline" title="カメラで撮影" caption="その場で1枚ずつ追加" onPress={openCamera} /><CaptureAction icon="images-outline" title="写真から選ぶ" caption="複数枚を一括選択" onPress={pick} /></View>
      <View style={styles.count}><Text style={styles.countTitle}>読み取り対象</Text><Text style={styles.countNumber}>{images.length}枚</Text></View>
      {images.length ? <View style={styles.grid}>{images.map((uri, index) => <View key={`${uri}-${index}`} style={styles.thumb}><Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" alt={`読み取り対象の名刺 ${index + 1}`} /><Pressable style={styles.remove} onPress={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Ionicons name="close" size={17} color="#fff" /></Pressable></View>)}</View> : <View style={styles.empty}><Ionicons name="id-card-outline" size={34} color="#8491A4" /><Text style={styles.emptyText}>撮影した名刺がここに並びます</Text></View>}
      {images.length > 0 && <Pressable style={commonStyles.primaryButton} onPress={scanCards}><Text style={commonStyles.primaryButtonText}>{images.length}枚を読み取る</Text></Pressable>}
      <Text style={styles.privacy}>🔒 OCRは端末内で処理し、名刺画像と連絡先は本人の名刺リストだけに保存されます。</Text>
    </AppScreen>
    <Modal visible={reading} transparent animationType="fade"><View style={styles.readingBackdrop}><View style={styles.readingCard}><ActivityIndicator size="large" color={AppColors.blue} /><Text style={styles.readingTitle}>名刺を読み取り中</Text><Text style={styles.readingText}>{Math.min(readingIndex + 1, images.length)} / {images.length}枚目を解析しています</Text><Text style={styles.readingNote}>日本語と英語を照合して、項目ごとに整理します。</Text></View></View></Modal>
    <Modal visible={Boolean(draft)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDrafts([])}>{draft && <View style={styles.reviewPage}><View style={styles.reviewHeader}><Pressable onPress={() => setDrafts([])}><Text style={styles.cancel}>中止</Text></Pressable><View><Text style={styles.reviewTitle}>読み取り結果を確認</Text><Text style={styles.reviewCount}>{reviewIndex + 1} / {drafts.length}枚目</Text></View><View style={{ width: 42 }} /></View><ScrollView contentContainerStyle={styles.reviewBody} keyboardShouldPersistTaps="handled"><Image source={{ uri: draft.uri }} style={styles.reviewImage} contentFit="contain" alt={`読み取り結果を確認する名刺 ${reviewIndex + 1}`} /><Text style={styles.reviewGuide}>読み取り間違いは直接修正できます。名刺にない項目は空欄で登録できます。</Text><Field label="氏名" value={draft.name} onChangeText={(value) => updateDraft('name', value)} /><Field label="会社・屋号" value={draft.company} onChangeText={(value) => updateDraft('company', value)} /><Field label="役職・肩書き" value={draft.positionTitle} onChangeText={(value) => updateDraft('positionTitle', value)} /><Field label="部署" value={draft.department} onChangeText={(value) => updateDraft('department', value)} /><Field label="携帯電話" value={draft.mobile} onChangeText={(value) => updateDraft('mobile', value)} keyboardType="phone-pad" /><Field label="会社電話" value={draft.phone} onChangeText={(value) => updateDraft('phone', value)} keyboardType="phone-pad" /><Field label="メールアドレス" value={draft.email} onChangeText={(value) => updateDraft('email', value)} keyboardType="email-address" /><Field label="郵便番号（任意）" value={draft.postalCode} onChangeText={(value) => updateDraft('postalCode', value)} /><Field label="住所" value={draft.address} onChangeText={(value) => updateDraft('address', value)} /><Field label="Webサイト" value={draft.website} onChangeText={(value) => updateDraft('website', value)} /><Field label="グループ" value={draft.groupName} onChangeText={(value) => updateDraft('groupName', value)} placeholder="例：ひるのめぐろ会場" /><Field label="名刺の交換日" value={draft.exchangeDate} onChangeText={(value) => updateDraft('exchangeDate', value)} /><Field label="メモ" value={draft.memo} onChangeText={(value) => updateDraft('memo', value)} multiline /><View style={styles.reviewNav}>{reviewIndex > 0 && <Pressable style={styles.navSecondary} onPress={() => setReviewIndex((value) => value - 1)}><Text style={styles.navSecondaryText}>前の名刺</Text></Pressable>}<Pressable style={[commonStyles.primaryButton, { flex: 1 }, saving && { opacity: .55 }]} onPress={() => reviewIndex < drafts.length - 1 ? setReviewIndex((value) => value + 1) : saveCards()} disabled={saving}><Text style={commonStyles.primaryButtonText}>{saving ? '登録中…' : reviewIndex < drafts.length - 1 ? '次の名刺' : `${drafts.length}枚を登録する`}</Text></Pressable></View></ScrollView></View>}</Modal>
  </>;
}

function CaptureAction({ icon, title, caption, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; caption: string; onPress: () => void }) { return <Pressable style={styles.action} onPress={onPress}><Ionicons name={icon} size={32} color={AppColors.blue} /><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionText}>{caption}</Text></Pressable>; }
function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} style={[styles.input, props.multiline && { minHeight: 86, paddingTop: 12 }]} autoCapitalize="none" /></View>; }

const styles = StyleSheet.create({
  guideTitle2: { color: AppColors.ink, fontSize: 16, fontWeight: '900' },
  guideText2: { marginTop: 8, color: AppColors.muted, fontSize: 12, lineHeight: 20, fontWeight: '700' },
  guideCard: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 16, backgroundColor: AppColors.blue }, guideTitle: { color: '#fff', fontSize: 16, fontWeight: '900' }, guideText: { marginTop: 5, color: '#E5F3FF', fontSize: 11, lineHeight: 17, fontWeight: '700' }, actions: { flexDirection: 'row', gap: 10 }, action: { flex: 1, minHeight: 132, padding: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C9DBFA', borderRadius: 15, backgroundColor: '#fff' }, actionTitle: { marginTop: 7, color: '#244268', fontSize: 14, fontWeight: '900' }, actionText: { marginTop: 4, color: '#75849A', fontSize: 10, lineHeight: 15, fontWeight: '700', textAlign: 'center' }, count: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, countTitle: { color: AppColors.ink, fontSize: 16, fontWeight: '900' }, countNumber: { color: AppColors.blue, fontSize: 14, fontWeight: '900' }, empty: { minHeight: 125, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1', borderRadius: 14 }, emptyText: { color: '#8491A4', fontSize: 12, fontWeight: '800' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, thumb: { width: '48%', aspectRatio: 1.55, overflow: 'hidden', borderRadius: 11, backgroundColor: '#fff' }, remove: { position: 'absolute', right: 6, top: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(15,23,42,.82)' }, privacy: { color: '#74839A', fontSize: 11, lineHeight: 18, textAlign: 'center', fontWeight: '700' }, cameraPage: { flex: 1, backgroundColor: '#000' }, cameraHeader: { zIndex: 2, paddingHorizontal: 18, paddingTop: 58, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cameraTitle: { color: '#fff', fontSize: 13, fontWeight: '900' }, guide: { position: 'absolute', left: 26, right: 26, top: '30%', aspectRatio: 1.58, borderWidth: 3, borderColor: '#fff', borderRadius: 16 }, shutterRow: { position: 'absolute', left: 0, right: 0, bottom: 45, alignItems: 'center' }, shutter: { width: 78, height: 78, padding: 6, borderWidth: 5, borderColor: '#fff', borderRadius: 39 }, shutterInner: { flex: 1, borderRadius: 31, backgroundColor: '#fff' }, readingBackdrop: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,.55)' }, readingCard: { width: '100%', maxWidth: 360, padding: 26, alignItems: 'center', borderRadius: 22, backgroundColor: '#fff' }, readingTitle: { marginTop: 15, color: AppColors.ink, fontSize: 19, fontWeight: '900' }, readingText: { marginTop: 8, color: AppColors.blue, fontSize: 14, fontWeight: '900' }, readingNote: { marginTop: 8, color: AppColors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700', textAlign: 'center' }, reviewPage: { flex: 1, backgroundColor: AppColors.paper }, reviewHeader: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: AppColors.line }, cancel: { color: AppColors.blue, fontSize: 14, fontWeight: '900' }, reviewTitle: { color: AppColors.ink, fontSize: 17, fontWeight: '900', textAlign: 'center' }, reviewCount: { marginTop: 3, color: AppColors.muted, fontSize: 11, fontWeight: '800', textAlign: 'center' }, reviewBody: { padding: 16, paddingBottom: 60, gap: 13 }, reviewImage: { width: '100%', aspectRatio: 1.58, borderRadius: 12, backgroundColor: '#E2E8F0' }, reviewGuide: { padding: 12, borderRadius: 10, backgroundColor: AppColors.paleBlue, color: '#48617F', fontSize: 12, lineHeight: 19, fontWeight: '800' }, field: { gap: 6 }, fieldLabel: { color: '#354A68', fontSize: 13, fontWeight: '900' }, input: { minHeight: 50, paddingHorizontal: 13, borderWidth: 1, borderColor: '#CBD7E7', borderRadius: 11, backgroundColor: '#fff', color: AppColors.ink, fontSize: 15, fontWeight: '700' }, reviewNav: { flexDirection: 'row', gap: 10, marginTop: 6 }, navSecondary: { minHeight: 54, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#B8C7DA', borderRadius: 14, backgroundColor: '#fff' }, navSecondaryText: { color: '#526681', fontSize: 14, fontWeight: '900' },
});
