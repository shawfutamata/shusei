export type CardDraft = { uri: string; name: string; company: string; positionTitle: string; department: string; phone: string; mobile: string; email: string; postalCode: string; address: string; website: string; groupName: string; memo: string; exchangeDate: string };

type RecordLine = { source: number; order: number; raw: string; compact: string };

export function parseBusinessCardTexts(uri: string, texts: string[]): CardDraft {
  const records = texts.flatMap((text, source) => text.replace(/\r/g, '').split('\n').map((value, order) => ({ source, order, raw: normalizeBase(value), compact: compactJapanese(normalizeBase(value)) }))).filter((record) => record.raw);
  const phones: Array<{ value: string; mobile: boolean }> = []; const emails: string[] = []; const websites: string[] = [];
  for (const record of records) {
    const contact = normalizeContact(record.raw);
    const email = contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]; if (email) emails.push(fixEmail(email));
    const website = contact.match(/(?:https?:\/\/|www\.)[^\s|]+/i)?.[0]; if (website) websites.push(fixWebsite(website));
    const found = [...contact.matchAll(/(?:\+81-?)?0\d{1,4}-\d{1,4}-\d{3,4}/g)].map((match) => normalizePhone(match[0]));
    const usable = /FAX/i.test(record.raw) && /TEL|Phone|Mobile/i.test(record.raw) ? found.slice(0, 1) : /FAX/i.test(record.raw) ? [] : found;
    for (const value of usable) if (!phones.some((phone) => phone.value === value)) phones.push({ value, mobile: /^(?:\+81-?)?0(?:70|80|90)-/.test(value) });
  }
  const positionRecord = records.find((record) => extractPositionTitle(record.compact)); const positionTitle = extractPositionTitle(positionRecord?.compact ?? '');
  const groupName = records.map((record) => record.compact.match(/([一-龯々ぁ-んァ-ヶA-Za-z0-9・]+会場)/)?.[1] ?? '').find(Boolean) ?? '';
  const departmentRecord = records.find((record) => isDepartmentLine(record.compact)); const department = cleanDepartment(departmentRecord?.compact ?? '');
  const companyRecord = records.find((record) => isCompanyLine(record.compact)) ?? findLikelyOrganization(records, positionRecord);
  const company = cleanCompany(companyRecord?.compact ?? '');
  const name = chooseName(records, new Set([positionRecord?.compact ?? '', departmentRecord?.compact ?? '', companyRecord?.compact ?? '', groupName]));
  let postalCode = ''; let address = '';
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]; const postal = !isContactLine(record.raw) ? record.compact.match(/(?:〒\s*)?(\d{3})[-ー－](\d{4})(?=\s|[一-龯ぁ-んァ-ヶ]|$)/) : null;
    if (postal && !postalCode) postalCode = `${postal[1]}-${postal[2]}`;
    if (!address && looksLikeAddress(record.compact)) { address = cleanAddress(record.compact); const next = records[index + 1]; if (next && next.source === record.source && looksLikeBuildingContinuation(next.compact)) address += ` ${next.compact}`; }
  }
  return { uri, name, company, positionTitle, department, phone: phones.find((phone) => !phone.mobile)?.value ?? '', mobile: phones.find((phone) => phone.mobile)?.value ?? '', email: unique(emails)[0] ?? '', postalCode, address, website: unique(websites)[0] ?? '', groupName, memo: '', exchangeDate: todayInJapan() };
}

function normalizeBase(value: string) { return value.replace(/[②⑳]/g, '@').normalize('NFKC').replace(/[‐‑‒–—―－]/g, '-').replace(/[|｜]/g, ' ').replace(/\s+/g, ' ').trim(); }
function compactJapanese(value: string) { let result = value; for (let pass = 0; pass < 3; pass += 1) result = result.replace(/([一-龯々ぁ-んァ-ヶ])\s+(?=[一-龯々ぁ-んァ-ヶ])/g, '$1'); return result.replace(/株\s*式\s*会\s*社/g, '株式会社').replace(/有\s*限\s*会\s*社/g, '有限会社').replace(/合\s*同\s*会\s*社/g, '合同会社').trim(); }
function normalizeContact(value: string) { return value.replace(/(?:E-?mail|メール(?:アドレス)?|Mail)\s*[:：]?/ig, '').replace(/([0-9])O(?=[0-9])/g, '$10').replace(/O(?=[0-9]{2,4}[-])/g, '0').replace(/[ー－―‐‑–—]/g, '-').replace(/\s+/g, '').replace(/^00(?=(?:70|80|90)-)/, '0').replace(/:com\b/ig, '.com').replace(/\.cojp\b/ig, '.co.jp'); }
function fixEmail(value: string) { return value.replace(/[),;:]+$/, '').replace(/\.cojp$/i, '.co.jp').toLowerCase(); }
function fixWebsite(value: string) { const cleaned = value.replace(/[),;:]+$/, '').replace(/\.cojp$/i, '.co.jp'); if (/^www\./i.test(cleaned)) return cleaned.toLowerCase(); const match = cleaned.match(/^(https?:\/\/)([^/]+)(.*)$/i); return match ? `${match[1].toLowerCase()}${match[2].toLowerCase()}${match[3]}` : cleaned; }
function normalizePhone(value: string) { return value.replace(/^\+81-?0?/, '+81-'); }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }
function extractPositionTitle(line: string) { const titles: Array<[RegExp, string]> = [[/代表取締役/,'代表取締役'],[/専務取締役/,'専務取締役'],[/常務取締役/,'常務取締役'],[/副社長/,'副社長'],[/取締役/,'取締役'],[/社長/,'社長'],[/会長/,'会長'],[/\bCEO\b/i,'CEO'],[/\bCOO\b/i,'COO'],[/\bCFO\b/i,'CFO'],[/\bCTO\b/i,'CTO'],[/\bPresident\b/i,'President'],[/\bDirector\b/i,'Director'],[/部長/,'部長'],[/課長/,'課長'],[/マネージャー/,'マネージャー'],[/店[長革]/,'店長'],[/世話人/,'世話人'],[/代表/,'代表']]; const found = titles.filter(([pattern]) => pattern.test(line)).map(([, title]) => title); return [...new Set(found.filter((title) => !found.some((other) => other !== title && other.includes(title))))].join(' / '); }
function isCompanyLine(line: string) { return !isContactLine(line) && /(株式会社|有限会社|合同会社|一般社団法人|一般財団法人|医療法人|税理士法人|弁護士法人|事務所|\bInc\.?\b|\bLLC\b|\bCo\.?[, ]*Ltd\.?\b|\bCorporation\b)/i.test(line); }
function cleanCompany(line: string) { return line.replace(/^[\s/\-:：]+/, '').replace(/^(会社名|Company)\s*[:：]?\s*/i, '').replace(/\s*(?:〒\s*)?\d{3}[-ー－]\d{4}.*$/, '').replace(/\s*(?:TEL|FAX|Mobile|Phone|E-?mail)\s*[:：]?.*$/i, '').trim(); }
function isDepartmentLine(line: string) { return !isContactLine(line) && !extractPositionTitle(line) && line.length <= 40 && /(?:本店|支店|営業所|事業部|営業部|管理部|総務部|企画部|開発部|部|課|室|店)(?:・[^0-9@]{1,12}(?:本店|支店|店))?$/.test(line) && !/〒|\d{3,}/.test(line); }
function cleanDepartment(line: string) { return line.replace(/^[\s/\-:：]+/, '').trim(); }
function findLikelyOrganization(records: RecordLine[], position?: RecordLine) { const start = position ? records.indexOf(position) : -1; return records.map((record, index) => { const base = organizationScore(record.compact); return { record, base, score: base + (start >= 0 && Math.abs(index - start) <= 4 ? 6 : 0) }; }).filter(({ base }) => base > 0).sort((a, b) => b.score - a.score)[0]?.record; }
function organizationScore(line: string) { if (line.length < 3 || line.length > 42 || isContactLine(line) || extractPositionTitle(line) || looksLikeAddress(line) || isJapaneseNameCandidate(line) || /会場|申込|MEMBER|BELGIUM|President|Creative Production/i.test(line)) return -100; let score = 0; if (/(株式会社|有限会社|合同会社|法人|事務所)/.test(line)) score += 50; if (/(ダイヤモンド|ジュエリー|スペリオル|ColourJam|SUPERIOR|EXCELCO)/i.test(line)) score += 16; if (/[ァ-ヶ]{4,}/.test(line)) score += 8; if (/[一-龯々].*[ァ-ヶ]|[ァ-ヶ].*[一-龯々]/.test(line)) score += 5; return score; }
function chooseName(records: RecordLine[], excluded: Set<string>) { const candidates = records.map((record) => ({ record, formatted: formatJapaneseName(record.raw) })).filter(({ record, formatted }) => formatted && !excluded.has(record.compact) && !isContactLine(record.raw) && !isCompanyLine(record.compact) && !isDepartmentLine(record.compact) && !looksLikeAddress(record.compact) && !/(株式会社|有限会社|合同会社|会場|本店|支店|営業所|住所|申込|東京|名古屋|ホテル|ダイヤモンド)/.test(record.compact) && !extractPositionTitle(record.compact)); candidates.sort((left, right) => nameScore(right.record, right.formatted) - nameScore(left.record, left.formatted)); if (candidates[0]) return candidates[0].formatted; return records.map((record) => record.raw.replace(/[^A-Za-zÀ-ÿ' .-]/g, '').replace(/\s+/g, ' ').trim()).find((line) => line.split(' ').filter((word) => word.length >= 2).length === 2 && !/(company|inc|ltd|diamond|creative|production)/i.test(line)) ?? ''; }
function nameScore(record: { source: number; raw: string }, formatted: string) { const compactLength = formatted.replace(/\s/g, '').length; return (record.source === 0 ? 30 : 0) + (/\s/.test(record.raw) ? 8 : 0) + ([4, 5].includes(compactLength) ? 5 : 0) - Math.abs(compactLength - 4); }
function formatJapaneseName(value: string) { const cleaned = value.replace(/[^一-龯々ぁ-んァ-ヶ\s]/g, ' ').replace(/\s+/g, ' ').trim(); const tokens = cleaned.split(' ').filter(Boolean); if (tokens[0] && tokens[0].length >= 3 && tokens[0].length <= 5 && tokens.slice(1).every((token) => token.length === 1)) { const split = tokens[0].length >= 4 ? 2 : 1; return `${tokens[0].slice(0, split)} ${tokens[0].slice(split)}`; } const compact = tokens.join(''); if (compact.length < 3 || compact.length > 7 || !isJapaneseNameCandidate(compact)) return ''; if (tokens.length >= 2) return `${tokens[0]} ${tokens.slice(1).join('')}`; const split = compact.length >= 4 ? 2 : 1; return `${compact.slice(0, split)} ${compact.slice(split)}`; }
function isJapaneseNameCandidate(line: string) { return /^[一-龯々]{3,7}$/.test(line.replace(/\s/g, '')); }
function isContactLine(line: string) { return /@|(?:https?:\/\/|www\.)|\b(?:TEL|FAX|Mobile|Phone|E-?mail)\b/i.test(line) || /0\d{1,4}[-\s]\d{1,4}[-\s]\d{3,4}/.test(line); }
function looksLikeAddress(line: string) { return !isContactLine(line) && (/(?:〒\s*)?\d{3}[-ー－]\d{4}(?=\s|[一-龯ぁ-んァ-ヶ]|$)/.test(line) || /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県|名古屋市|中央区|港区|目黒区).{3,}/.test(line) && /\d/.test(line) || /[一-龯々ぁ-んァ-ヶ]{2,}(?:市|区|郡|町|村)[一-龯々ぁ-んァ-ヶ0-9丁目番地号\-ー－]{3,}/.test(line) && /\d/.test(line)); }
function cleanAddress(line: string) { const postalIndex = line.search(/〒?\s*\d{3}[-ー－]\d{4}/); const withoutPrefix = postalIndex >= 0 ? line.slice(postalIndex).replace(/^〒?\s*\d{3}[-ー－]\d{4}\s*/, '') : line; return withoutPrefix.replace(/^(?:東京本店|青山店|本店|支店)\s*/, '').replace(/(ホーム|ビル|マンション)\s*S(?=F\b)/i, '$18').trim(); }
function looksLikeBuildingContinuation(line: string) { return !isContactLine(line) && line.length <= 40 && /(?:ビル|マンション|ホーム|タワー|館|F|階)$/i.test(line) && !looksLikeAddress(line); }
function todayInJapan() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
