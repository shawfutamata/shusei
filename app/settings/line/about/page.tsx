import { serviceName } from '@/app/brand';
import { company } from '@/app/company';
import { LINE_DATA_CONSENT_VERSION, LINE_LINK_DISCLOSURE } from '@/app/line-data-consent';
import styles from './page.module.css';
export const metadata = { title: 'LINE連携と情報の取扱い', robots: { index: false, follow: false } };
export default function LineInformationPage() {
  return <main className={styles.page}>
    <a className={styles.back} href="/settings/line">← LINE連携・通知の設定に戻る</a>
    <header><p className={styles.eyebrow}>LINE INFORMATION</p><h1>LINE連携と情報の取扱い</h1><p>連携への同意を選ぶ前にご確認ください。このページを開くだけで、同意や連携・通知が始まることはありません。</p></header>
    <section aria-labelledby="consent-title"><h2 id="consent-title">連携時に同意する内容</h2><p className={styles.disclosure}>{LINE_LINK_DISCLOSURE}</p><small>同意内容の版：{LINE_DATA_CONSENT_VERSION}</small></section>
    <section><h2>取得・保存するもの</h2><dl><div><dt>LINEのユーザーID</dt><dd>連携したLINEアカウントを識別するために利用します。</dd></div><div><dt>暗号化した認証トークン</dt><dd>LINEへの認証状態を確認し、連携を管理するために保存します。</dd></div></dl><p>ログイン・連携管理と、ご本人が希望したLINE通知のために利用します。連携中は、これらの情報を24時間を超えて保存・利用します。</p><p>LINEのお名前・メールアドレスは取得しません。友だち状態は照会・保存しません。{serviceName}にご本人が登録した氏名・メールアドレスは、LINEから取得する情報とは別です。</p></section>
    <section id="notifications"><h2>お知らせは別々に選べます</h2><p>LINE連携への同意だけでは、LINE通知を有効にしません。通知を最初に設定する際はオフで、ご本人が「新しいメッセージ」「新しいオファー・リファラル」から選んで保存します。選んだお知らせをLINEへ送ることに同意して保存し、両方外すと通知を停止します。</p><p>保存時にLINEで本人確認します。通知には相手の名前やメッセージ本文を載せず、届いたことだけをお知らせします。公式LINEの友だち追加が必要です。友だち・ブロック状態は照会しないため、未追加・ブロック中などは設定しても届かない場合があります。</p><p>LINEでブロックすると通知は届きません。ブロック解除だけで通知設定が再開するとは限りません。必要な通知を設定画面でご確認ください。通知停止を行っても、既に送信中のお知らせは取り消せない場合があります。</p><p>メールのお知らせはLINE通知とは別の設定です。メールのお知らせを止めても、ご自身で依頼する本人確認コードは送信されます。</p></section>
    <section id="unlink"><h2>LINE連携を解除すると</h2><ul><li>LINE通知を止め、LINE側の{serviceName}との連動も解除します。</li><li>LINEでログインした端末はログアウトします。</li><li>会員情報・投稿・ご本人が登録した氏名やメールアドレスは残ります。</li><li>再ログインには、登録メールと同じGoogleアカウントが必要です。ご用意できない場合は、解除前に運営窓口へご相談ください。</li></ul><p>登録メールへの確認コードで本人確認を行います。LINE側の連動解除が確認できない場合は「処理中」として扱い、解除完了とは表示しません。同じLINEでの再確認や再試行が必要になることがあります。解除が確認できた後、認証トークンを消去し、会員とのLINE連携とLINE用のログイン状態を削除します。LINEのユーザーIDなど、解除の確認に使う記録は残ります。</p><p>本人確認の手続きをキャンセルしても、通知停止や、既にLINEへ送信した解除処理は取り消されません。バックアップ等の取扱いは運営窓口へご確認ください。</p></section>
    <section id="withdraw"><h2>退会・削除について</h2><p>LINE連携の解除だけでは{serviceName}を退会しません。オンライン退会が準備中の場合は、運営窓口へ退会・削除をご依頼ください。</p><p>オンライン退会を利用できる場合も、操作前に対象と注意事項を確認します。取引・請求・共有記録がある場合は、この画面で一律に削除せず、運営での確認が必要です。バックアップ等の取扱いや個別の削除範囲について、未確認の削除期限をお約束するものではありません。</p></section>
    <section><h2>お問い合わせ</h2><p>連携解除やデータの取扱いを確認したい場合は、{company.email} へお問い合わせください。</p><a href="/account/privacy">ログインできない場合のLINE連携解除・退会確認</a><a href="/privacy">プライバシーポリシー</a></section>
    <a className={styles.returnButton} href="/settings/line">設定画面に戻る</a>
  </main>;
}
