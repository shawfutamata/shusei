import { PropsWithChildren, ReactNode } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '@/constants/app';
export function AppScreen({ title, eyebrow, action, children, scroll = true }: PropsWithChildren<{ title: string; eyebrow?: string; action?: ReactNode; scroll?: boolean }>) {
  const content = <View style={styles.content}><View style={styles.heading}><View>{eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}<Text style={styles.title}>{title}</Text></View>{action}</View>{children}</View>;
  return <SafeAreaView style={styles.safe}>{scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}</SafeAreaView>;
}
export const commonStyles = StyleSheet.create({ card: { borderWidth: 1, borderColor: AppColors.line, borderRadius: 18, backgroundColor: AppColors.white, padding: 16 }, primaryButton: { minHeight: 54, borderRadius: 14, backgroundColor: AppColors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, primaryButtonText: { color: AppColors.white, fontSize: 16, fontWeight: '900' }, secondary: { color: AppColors.muted, fontSize: 13, lineHeight: 20, fontWeight: '700' } });
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: AppColors.paper }, scroll: { paddingBottom: 120 }, content: { paddingHorizontal: 16, paddingTop: 16, gap: 16 }, heading: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: AppColors.blue, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginBottom: 4 }, title: { color: AppColors.ink, fontSize: 26, lineHeight: 34, fontWeight: '900' } });
