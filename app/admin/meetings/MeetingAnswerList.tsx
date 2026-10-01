'use client';

import {splitIndustryLabels} from '@/app/industry-options';

import { useMemo, useState } from 'react';
import type { Attendee, Meeting, RosterPerson } from '@/app/meeting/types';

type Filter = 'all' | 'matched' | 'unmatched' | 'pending';

export default function MeetingAnswerList({ people, roster, event, analysisDone, busy, onReload, onRemove }: {
  people: Attendee[];
  roster: RosterPerson[];
  event: Meeting;
  analysisDone: boolean;
  busy: boolean;
  onReload: () => void;
  onRemove: (personId: string, candidateId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const counts = {
    all: people.length,
    matched: people.filter(person => person.analyzed === 1 && person.candidates.length > 0).length,
    unmatched: people.filter(person => person.analyzed === 1 && person.candidates.length === 0).length,
    pending: people.filter(person => person.analyzed !== 1).length,
  };
  const visiblePeople = useMemo(() => {
    const term = query.normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
    return people.filter(person => {
      if (filter === 'matched' && !(person.analyzed === 1 && person.candidates.length > 0)) return false;
      if (filter === 'unmatched' && !(person.analyzed === 1 && person.candidates.length === 0)) return false;
      if (filter === 'pending' && person.analyzed === 1) return false;
      return !term || [person.name, person.company, person.industry, person.need, person.services]
        .some(value => value.normalize('NFKC').toLocaleLowerCase('ja-JP').includes(term));
    });
  }, [people, query, filter]);
  const names = new Map([...roster.map(person => ['roster:' + person.id, person.name] as const), ...people.map(person => [person.id, person.name] as const)]);
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'すべて' }, { key: 'matched', label: '候補あり' },
    { key: 'unmatched', label: '候補なし' }, { key: 'pending', label: '分析待ち' },
  ];

  return <section id="meeting-answers" className="meeting-admin-section meeting-answer-section">
    <div className="meeting-admin-section-heading"><div><h2>回答一覧 <small>{people.length}人</small></h2><p className="meeting-help">希望を確認し、候補の根拠を必要なときに開けます。</p></div><button disabled={busy} className="meeting-secondary" onClick={onReload}>回答を再読み込み</button></div>
    {people.length === 0 ? <p className="meeting-admin-empty">まだ回答はありません。回答が届くと、ここに表示されます。</p> : <>
      <div className="meeting-answer-toolbar">
        <label className="meeting-answer-search"><span>回答を探す</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="名前・会社・業種・希望で検索" aria-label="回答を検索" /></label>
        <div className="meeting-answer-filters" role="group" aria-label="分析状態で絞り込み">{filters.map(item => <button key={item.key} type="button" className={filter === item.key ? 'is-active' : ''} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}<span>{counts[item.key]}</span></button>)}</div>
      </div>
      <p className="meeting-answer-result-count" aria-live="polite">{query || filter !== 'all' ? `${visiblePeople.length}件を表示` : '回答者の希望と紹介候補'}</p>
      {visiblePeople.length === 0 ? <p className="meeting-admin-empty">該当する回答はありません。検索語や絞り込みを変更してください。</p> : <div className="meeting-answer-grid">{visiblePeople.map(person => {
        const status = person.analyzed !== 1 ? 'pending' : person.candidates.length ? 'matched' : 'unmatched';
        return <article className="meeting-answer-card" key={person.id}>
          <div className="meeting-answer-card-top"><span className="meeting-answer-avatar" aria-hidden="true">{person.name.slice(0, 1)}</span><div className="meeting-answer-identity"><h3>{person.name}</h3><p>{person.company}</p></div><span className={`meeting-answer-status is-${status}`}>{status === 'pending' ? '分析待ち' : status === 'matched' ? `候補 ${person.candidates.length}人` : '候補なし'}</span></div>
          <div className="meeting-answer-tags">{person.industry?splitIndustryLabels(person.industry).map(industry=><span key={industry}>{industry}</span>):<span>業種未入力</span>}{person.area && <span>{person.area}</span>}{person.walkIn && <span className="is-walkin">当日参加</span>}</div>
          <div className="meeting-answer-wish"><span>つながりたい相手</span><p>{person.need || '今回は希望なし'}</p></div>
          {person.candidates.length > 0 && <div className="meeting-answer-candidate-preview"><span>紹介候補</span><div>{person.candidates.map(candidate => <span key={candidate.id}>{names.get(candidate.id) || '名簿の参加者'}</span>)}</div></div>}
          <details className="meeting-answer-details"><summary>事業情報と候補の根拠を見る</summary><div className="meeting-answer-expanded">
            {person.walkIn && <p className="meeting-answer-alert">当日参加・本人入力：お名前と事業内容を受付で確認してください。</p>}
            <dl className="meeting-answer-business"><div><dt>できる仕事</dt><dd>{person.services || '未入力'}</dd></div>{person.referrals && <div><dt>紹介できる相手</dt><dd>{person.referrals}</dd></div>}{(person.timing || person.budget || person.conditions) && <div><dt>希望する条件</dt><dd>{[person.timing, person.budget, person.conditions].filter(Boolean).join(' ／ ')}</dd></div>}</dl>
            {person.candidates.length > 0 && <div className="meeting-answer-matches"><h4>紹介候補と判断した理由</h4>{person.candidates.map((candidate, index) => <div className="meeting-answer-match" key={candidate.id}><div className="meeting-answer-match-head"><span>{String(index + 1).padStart(2, '0')}</span><strong>{names.get(candidate.id) || '名簿の参加者'}</strong><small>{candidate.kind === 'related' ? '関連する仕事の相談' : candidate.kind === 'direct' ? '直接依頼' : '紹介の相談'}</small></div><p>{candidate.reason}</p><dl><div><dt>探す仕事</dt><dd>「{candidate.needQuote}」</dd></div><div><dt>候補の事業情報</dt><dd>「{candidate.offerQuote}」</dd></div></dl>{candidate.questions.length > 0 && <p className="meeting-answer-questions"><b>要確認：</b>{candidate.questions.join(' ／ ')}</p>}{event.state === 'review' && analysisDone && <button disabled={busy} className="meeting-secondary" onClick={() => onRemove(person.id, candidate.id)}>この候補を外す</button>}</div>)}</div>}
            {person.analyzed === 1 && person.candidates.length === 0 && <p className="meeting-answer-empty-match">{person.need ? '確かな紹介候補は見つかりませんでした。' : '希望が入力されていないため、紹介候補はありません。'}</p>}
          </div></details>
        </article>;
      })}</div>}
    </>}
  </section>;
}
