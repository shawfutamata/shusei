export type Answer = {
  name: string; company: string; table: string; industry: string;
  services: string; referrals: string; need: string;
  area: string; timing: string; budget: string; conditions: string;
};
export type Attendee = Answer & { id: string; present: number; analyzed: number; candidates: Candidate[] };
export type Candidate = {
  id: string; kind: 'direct' | 'referral'; reason: string;
  needQuote: string; offerQuote: string; questions: string[];
};
export type Meeting = {
  id: string; title: string; venue: string; closesAt: number;
  state: 'open' | 'analyzing' | 'review' | 'published'; createdAt: number;
};
export const answerFields = ['name','company','table','industry','services','referrals','need','area','timing','budget','conditions'] as const;
export function validateAnswer(raw: unknown): Answer {
  if (!raw || typeof raw !== 'object') throw new Error('回答を入力してください。');
  const data = raw as Record<string, unknown>;
  const output = {} as Answer;
  for (const key of answerFields) {
    if (typeof data[key] !== 'string') throw new Error('回答形式を確認してください。');
    const value = data[key].trim();
    const max = ['services','referrals','need','conditions'].includes(key) ? 500 : 120;
    if (value.length > max) throw new Error(`${key} の文字数が多すぎます。`);
    output[key] = value;
  }
  if (!output.name || !output.company || !output.industry || output.services.length < 8) throw new Error('お名前・会社名・業種と、できる仕事を具体的に入力してください。');
  if (output.need && output.need.length < 8) throw new Error('探している仕事をもう少し具体的に入力してください。');
  return output;
}
// Model prose is not a source of truth: IDs and both quotes must exist in this event's frozen answers.
export function validateCandidates(raw: unknown, seeker: Attendee, attendees: Attendee[]): Candidate[] {
  if (!Array.isArray(raw)) throw new Error('AIの候補形式を確認できませんでした。再試行してください。');
  const seen = new Set<string>();
  return raw.flatMap((row: Record<string, unknown>) => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || seen.has(row.id) || row.id === seeker.id) return [];
    const person = attendees.find(a => a.id === row.id && a.present === 1);
    if (!person || (row.kind !== 'direct' && row.kind !== 'referral')) return [];
    const source = row.kind === 'direct' ? person.services : person.referrals;
    if (typeof row.needQuote !== 'string' || row.needQuote.trim().length < 4 || !seeker.need.includes(row.needQuote)) return [];
    if (typeof row.offerQuote !== 'string' || row.offerQuote.trim().length < 4 || !source.includes(row.offerQuote)) return [];
    if (typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 400) return [];
    if (!Array.isArray(row.questions) || row.questions.some(q => typeof q !== 'string' || q.length > 200)) return [];
    seen.add(row.id);
    return [{id:row.id,kind:row.kind,reason:row.reason,needQuote:row.needQuote,offerQuote:row.offerQuote,questions:row.questions.slice(0,4)} as Candidate];
  }).sort((a,b) => Number(a.kind === 'referral') - Number(b.kind === 'referral')).slice(0,3);
}
