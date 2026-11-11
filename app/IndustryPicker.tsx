'use client';

import { useEffect, useRef, useState } from 'react';
import { getIndustryGroup, industryGroups, restaurantIndustries } from './industry-options';

/**
 * 業種を選ぶところ。上段は**大分類の切り替え**で、選択そのものではない。
 *
 * もとは上段にも下段（実際の選択）にも同じ青い塗りを使っていたため、
 * 「6個まで」と書いてあるのに1つしか選べない、と読めてしまっていた。
 * 上段は「いま開いている」だけの見た目にして、選んだ数を各大分類の肩に出す。
 * どこに何個入っているかが、開かなくても分かる。
 */
export default function IndustryPicker({ id, legend, note, description, selected, activeGroup, onGroupChange, onToggle, allowCustom = false, maxSelected = 6, className = '' }: {
  /** 外から「ここまで送る」と指せるようにする目印。 */
  id?: string;
  legend: string; note: string; description?: string; selected: string[];
  activeGroup: string; onGroupChange: (value: string) => void; onToggle: (value: string) => void; allowCustom?: boolean; maxSelected?: number; className?: string;
}) {
  const detailRef = useRef<HTMLDivElement>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  const [customIndustry, setCustomIndustry] = useState('');
  const [customError, setCustomError] = useState('');
  // 初回表示や詳細業種の選択では動かさず、大分類を押したときだけ移動する。
  useEffect(() => {
    if (!scrollRequest) return;
    detailRef.current?.focus({ preventScroll: true });
    detailRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [scrollRequest]);
  function addCustomIndustry() {
    const value = customIndustry.trim();
    if (!value) return setCustomError('業種名を入力してください。');
    if (value.length > 40 || /[\u0000-\u001f]/.test(value)) return setCustomError('業種名は40文字以内で入力してください。');
    if (selected.includes(value)) return setCustomError('その業種は選択済みです。');
    if (selected.length >= maxSelected) return setCustomError(`業種は${maxSelected}個までです。選択中の業種を外してから追加してください。`);
    onToggle(value);
    setCustomIndustry('');
    setCustomError('');
  }
  const active = industryGroups.find((group) => group.name === activeGroup) ?? industryGroups[0];
  const countIn = (group: typeof industryGroups[number]) => selected.filter((value) => getIndustryGroup(value)?.name === group.name || (group.name === 'その他' && !getIndustryGroup(value))).length;

  return <fieldset id={id} className={`tag-field hierarchical-industry-picker ${className}`}>
    <legend>{legend} <small>{note}</small></legend>
    {description && <p>{description}</p>}

    {/* 切り替えであることが分かるように、タブとして読ませる */}
    <div className="industry-major-picker" role="tablist" aria-label="業種の大分類を切り替える">
      {industryGroups.map((group) => {
        const count = countIn(group);
        return <button type="button" key={group.name} role="tab"
          aria-selected={active.name === group.name}
          className={active.name === group.name ? 'open' : ''}
          onClick={() => { onGroupChange(group.name); setScrollRequest((value) => value + 1); }}>
          {group.name}{count > 0 && <em>{count}</em>}
        </button>;
      })}
    </div>

    <div ref={detailRef} className="industry-detail-panel" tabIndex={-1} aria-label={`${active.name}の詳細業種を選ぶ`}>
      <h4><span>大分類</span>{active.name}<small>この中から選びます{selected.length > 0 && `（選択中 ${selected.length}）`}</small></h4>
      <div className="tag-picker">{active.children.filter((industry) => !(restaurantIndustries as readonly string[]).includes(industry)).map((industry) => <button type="button" key={industry}
        className={selected.includes(industry) ? 'selected' : ''}
        onClick={() => onToggle(industry)}>{industry}</button>)}</div>
      {active.name === '飲食・食品' && <div className="industry-restaurant-options">
        <h5>飲食店のジャンル</h5>
        <p>お店の料理ジャンルも選べます。ジャンルごとに1個として数えます。</p>
        <div className="tag-picker">{restaurantIndustries.map((industry) => <button type="button" key={industry} className={selected.includes(industry) ? 'selected' : ''} onClick={() => onToggle(industry)}>{industry}</button>)}</div>
      </div>}
      {allowCustom && active.name === 'その他' && <div className="industry-custom-entry">
        <label><span>その他の業種を自由記入 <small>40文字以内</small></span>
          <input type="text" value={customIndustry} maxLength={40} placeholder="例：楽器の修理" onChange={(event) => { setCustomIndustry(event.target.value); setCustomError(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); addCustomIndustry(); } }} />
        </label>
        <button type="button" onClick={addCustomIndustry}>この業種を追加</button>
        <p>入力したら「この業種を追加」を押し、プロフィールを保存してください。自由記入も選択数に含まれます。</p>
        {customError && <p role="alert">{customError}</p>}
      </div>}
    </div>

    {selected.length > 0 && <div className="selected-industry-list">
      <b>選択中</b>
      {selected.map((industry) => <button type="button" key={industry} onClick={() => onToggle(industry)}>{industry}<span>×</span></button>)}
    </div>}
  </fieldset>;
}
