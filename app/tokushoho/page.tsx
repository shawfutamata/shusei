import type { Metadata } from 'next';
import { serviceName } from '../brand';
import { company, missingCompanyFields } from '../company';
import { adSlotPrice, planCatalog, planPrice, yearlyYen } from '../plan-catalog';
import LegalPage, { LegalSection, LegalTable, LegalTodo } from '../LegalPage';

export const metadata: Metadata = { title: `特定商取引法に基づく表記｜${serviceName}`, description: `${serviceName}の販売条件` };

export default function TokushohoPage() {
  const missing = missingCompanyFields();
  const rows: [string, React.ReactNode][] = [
    ['販売事業者', company.name],
    ['運営責任者', company.representative || <LegalTodo label="代表者の氏名" />],
    ['所在地', company.address || <LegalTodo label="所在地" />],
    ['電話番号', company.phone || <LegalTodo label="電話番号" />],
    ['お問い合わせ', <>{company.email}<br />{company.hours}<br />お問い合わせはメールにて承ります。お電話をご希望の場合は、上記の電話番号へご連絡ください。</>],
    ['販売価格', <>
      スタンダード：{planPrice('standard')}（税込）／{planPrice('standard', 'year')}（税込）<br />
      トップバナーへの出稿枠：1枠1ヶ月 {adSlotPrice()}（税込）<br />
      無料プランは料金がかかりません。
    </>],
    ['商品代金以外の必要料金', 'インターネット接続に必要な通信料金、および通信機器等の費用はお客様のご負担となります。'],
    ['支払方法', 'クレジットカード決済（Stripe社の決済システムを利用します）'],
    ['支払時期', <>
      お申し込み手続きの完了時に初回のご請求を行います。<br />
      以降は、月払いは毎月、年払いは毎年、お申し込み日に対応する日に自動的に更新し、同額をご請求します。<br />
      トップバナーへの出稿枠は、お申し込み手続きの完了時に1回きりのご請求を行います。自動更新はありません。
    </>],
    ['役務の提供時期', 'お支払いの完了後、ただちにご利用いただけます。'],
    ['返品・キャンセル', <>
      本サービスはデジタル役務の提供であり、提供開始後の返品はお受けできません。<br />
      解約はいつでも手続きでき、既にお支払いいただいた期間の末日までご利用いただけます。日割りでの返金は行いません。<br />
      詳しくは<a href="/refund" style={{ color: '#1478d6', fontWeight: 800 }}>返金・キャンセルポリシー</a>をご覧ください。
    </>],
    ['動作環境', '最新版のGoogle Chrome、Safari、Microsoft Edgeのいずれか。iOS・Android向けアプリは各ストアの記載をご確認ください。'],
  ];
  if (company.invoiceNumber) rows.splice(1, 0, ['適格請求書発行事業者登録番号', company.invoiceNumber]);

  return <LegalPage
    eyebrow="SPECIFIED COMMERCIAL TRANSACTIONS"
    title="特定商取引法に基づく表記"
    lead={`${serviceName}の有料プランおよび広告枠に関する販売条件です。`}
    warning={missing.length ? `公開前に ${missing.join('・')} を app/company.ts へ記入してください。通信販売では省略できません。` : undefined}
    updatedAt="2026年8月29日"
  >
    <LegalTable rows={rows} />
    <LegalSection
      heading="価格の内訳"
      body={[
        `年払いは、月払いの12か月ぶんから20%を割り引いた金額です。スタンダードは月あたり ${Math.round(yearlyYen('standard') / 12).toLocaleString('ja-JP')}円になります。`,
        'トップバナーへの出稿枠は、1回きりのお支払いです。掲載は申し込まれた月の1ヶ月間で、自動更新はありません。枠数には限りがあり、お申し込み順に確定します。',
        `無料プラン（${planCatalog.free.summary}）は、お申し込みや料金のお支払いなくご利用いただけます。`,
      ]}
    />
  </LegalPage>;
}
