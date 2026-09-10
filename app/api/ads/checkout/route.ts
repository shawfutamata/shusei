import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { adSlotConfigured, stripeClient } from '@/app/stripe';
import { AD_MIN_DAYS, DEFAULT_PLACEMENT, isAdPlacement, placementName } from '@/app/ad-options';
import { industryGroups } from '@/app/industry-options';
import { adSlotTotalYen } from '@/app/plan-catalog';
import { activateAdSlot, availableAdGiftDays, canBuyAdSlot, commitAdGiftDays, getMemberRank, getStripeLink, holdAdGiftDays, releaseAdSlot, reserveAdSlot, saveAdSlotSession, saveStripeCustomer, shiftDate } from '@/db/data';
import { AD_DAYS_AHEAD_ALL, AD_MAX_DAYS_ALL, adDiscountRate } from '@/app/rank-perks';
import { readAdContent } from '@/app/ad-upload';

// **Web専用**。トップバナーの出稿枠を1ヶ月ぶん買う。
// 購読ではなく1回きりの支払いなので mode は 'payment'。
// アプリからは呼ばない（App Store 3.1.1／docs/billing-architecture.md）。
export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  // お支払いの用意ができていなくても、**無料券だけで出せる申し込みは通す**。
  // 券は当たった時点で約束したものなので、こちらの設定を理由に使えないのは筋が違う。
  const payable = adSlotConfigured();

  const { level } = await getMemberRank(gate.user.userId);
  if (!canBuyAdSlot()) {
    return NextResponse.json({ error: '出稿枠は上位ランクの方の特典です。オファーを重ねてランクが上がるとお申し込みいただけます。' }, { status: 403 });
  }

  // タイトル・説明文・リンク・画像・期間を1回で受け取る。買ってから
  // 「まだ何も出ていない枠」を作らないため。
  const form = await request.formData();
  const parsed = await readAdContent(form);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const raw = String(form.get('startDate') ?? '');
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  const days = Number(form.get('days'));
  // どこに出すか。知らない値が来たらバナー扱いにせず、はっきり断る。
  const placement = String(form.get('placement') ?? DEFAULT_PLACEMENT);
  if (!isAdPlacement(placement)) return NextResponse.json({ error: '掲載する場所をお選びください。' }, { status: 400 });
  // 掲示板の上位だけ、大分類を1つ狙える。空なら全業種の先頭に出る。
  const industryRaw = String(form.get('industry') ?? '').trim();
  const industry = placement === 'list' && industryGroups.some((group) => group.name === industryRaw) ? industryRaw : '';
  const maxDays = AD_MAX_DAYS_ALL;
  if (!startDate) return NextResponse.json({ error: '掲載を始める日をお選びください。' }, { status: 400 });
  if (!Number.isInteger(days) || days < AD_MIN_DAYS || days > maxDays) {
    return NextResponse.json({ error: `掲載できるのは${AD_MIN_DAYS}日から${maxDays}日までです。` }, { status: 400 });
  }
  // 過ぎた日や、ずっと先の日を押さえられないようにする。
  const today = new Date().toISOString().slice(0, 10);
  if (startDate < today) return NextResponse.json({ error: '過ぎた日は選べません。' }, { status: 400 });
  if (startDate > shiftDate(today, AD_DAYS_AHEAD_ALL - 1)) {
    return NextResponse.json({ error: 'その日はまだお申し込みいただけません。カレンダーに出ている日からお選びください。' }, { status: 400 });
  }

  // ガチャで当たった無料券。**足りないぶんは払ってもらう。**
  // 全部まかなえるときだけ使う形にしていたが、7日ためるまで1枚も使えず、
  // 当たった実感が出なかった。2日券で7日出すなら、5日ぶんを請求する。
  //
  // 使うかどうかは会員が選べる。まるごと無料にできる日まで取っておきたい人が
  // いるので、黙って減らさない。既定は「使う」。
  const useGift = String(form.get('useGift') ?? '1') !== '0';
  const giftAvailable = useGift ? await availableAdGiftDays(gate.user.userId) : 0;
  const giftDays = Math.min(giftAvailable, days);
  const chargeDays = days - giftDays;
  const free = chargeDays <= 0;

  // 先に枠を押さえる。早い者勝ちなので、決済画面を開く前に取り合いを終わらせる。
  let reserved: { id: string; endDate: string };
  try {
    // 請求する額をここで決めて、そのまま枠にも記録する。**画面から受け取った
    // 額は使わない**（書き換えられるため）。分析の売上はこの値だけを使う。
    // 無料券で消したぶんは請求に入らないので、売上にも乗らない。
    reserved = await reserveAdSlot(gate.user.userId, startDate, days, parsed.content, placement, industry,
      free ? 0 : adSlotTotalYen(placement, chargeDays, adDiscountRate(level)), giftDays);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '枠を押さえられませんでした。' }, { status: 409 });
  }

  // **券は枠と同じように取り置く。** ここで減らしておかないと、決済画面を
  // 開いている間に同じ券で別の広告を申し込めてしまう。やめたときは戻す
  // （releaseAdSlot が一緒に戻す）。
  let held = 0;
  if (giftDays > 0) {
    try {
      held = await holdAdGiftDays(gate.user.userId, giftDays, reserved.id);
    } catch (error) {
      await releaseAdSlot(reserved.id).catch(() => undefined);
      console.error('ad gift hold failed', error);
      return NextResponse.json({ error: 'お申し込みを進められませんでした。時間をおいてお試しください。' }, { status: 502 });
    }
    // 取れた券が足りないときは、そのぶん請求が変わってしまう。押さえ直させる。
    if (held < giftDays) {
      await releaseAdSlot(reserved.id).catch(() => undefined);
      return NextResponse.json({ error: '無料券の残りが変わりました。もう一度お確かめのうえお申し込みください。' }, { status: 409 });
    }
  }

  // 券だけで足りるときは、Stripeを通さずそのまま掲載を始める。
  // **券を使用済みにするのは掲載を始めたあと。**
  if (free) {
    try {
      await activateAdSlot(reserved.id);
      await commitAdGiftDays(reserved.id);
      return NextResponse.json({ free: true, message: `無料券で${days}日間の掲載を始めました。` });
    } catch (error) {
      await releaseAdSlot(reserved.id).catch(() => undefined);
      console.error('free ad slot failed', error);
      return NextResponse.json({ error: '掲載を始められませんでした。時間をおいてお試しください。' }, { status: 502 });
    }
  }

  if (!payable) {
    await releaseAdSlot(reserved.id).catch(() => undefined);
    return NextResponse.json({ error: '出稿枠のお申し込みはまだ受け付けていません。運営窓口へお問い合わせください。' }, { status: 503 });
  }

  try {
    return await createCheckout(gate.user.userId, gate.user.email, gate.user.displayName, reserved.id, startDate, reserved.endDate, placement, days, chargeDays, giftDays, level, new URL(request.url).origin);
  } catch (error) {
    // 決済画面を開けなかったのに枠を押さえたままにしない。次の人がすぐ買える。
    await releaseAdSlot(reserved.id).catch(() => undefined);
    console.error('ad slot checkout failed', error);
    return NextResponse.json({ error: 'お支払い画面を開けませんでした。時間をおいてお試しいただくか、運営窓口へお問い合わせください。' }, { status: 502 });
  }
}

async function createCheckout(memberId: string, userEmail: string, userName: string, slotId: string, startDate: string, endDate: string, placement: string, days: number, chargeDays: number, giftDays: number, level: number, origin: string) {
  const stripe = stripeClient();
  const link = await getStripeLink(memberId);

  // 顧客は会費と同じものを使う。請求の履歴が1人分にまとまる。
  let customerId = link.customerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: link.email || userEmail,
      name: link.displayName || userName,
      metadata: { memberId },
    });
    customerId = customer.id;
    await saveStripeCustomer(memberId, customerId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    // 金額は日数×単価。**画面から受け取った額は使わない**（書き換えられるため）。
    // Stripeに価格を作り置きせず、その場の金額を price_data で渡す。
    line_items: [{
      price_data: {
        currency: 'jpy',
        // **請求するのは券で消せなかった日数ぶんだけ。**
        unit_amount: adSlotTotalYen(placement, chargeDays, adDiscountRate(level)),
        product_data: {
          name: `TASUKI ${placementName(placement)} ${days}日間`,
          // 無料券を使ったときは、明細にもそう書く。あとで請求書を見たときに
          // 「なぜこの額なのか」が分からないと問い合わせになる。
          description: giftDays > 0
            ? `${startDate} 〜 ${endDate}（無料券 ${giftDays}日分を差し引き、${chargeDays}日分のご請求）`
            : `${startDate} 〜 ${endDate}`,
        },
      },
      quantity: 1,
    }],
    locale: 'ja',
    // 1回きりの支払いでも請求書を作らせる。会員が自分で領収書（PDF）を
    // 取り出せるようになり、こちらで発行する手間も無くなる。
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: giftDays > 0
          ? `TASUKI ${placementName(placement)}（${startDate} 〜 ${endDate}／無料券 ${giftDays}日分を差し引き）`
          : `TASUKI ${placementName(placement)}（${startDate} 〜 ${endDate}）`,
        metadata: { memberId, adSlotId: slotId },
      },
    },
    // Stripeから支払い完了のレシートをそのまま送ってもらう。
    payment_intent_data: { receipt_email: link.email || userEmail },
    success_url: `${origin}/?ad=done`,
    cancel_url: `${origin}/?ad=cancel`,
    // webhookはこのslotIdだけを見て掲載中にする。
    metadata: { memberId, adSlotId: slotId, startDate, endDate },
  });

  await saveAdSlotSession(slotId, session.id);
  return NextResponse.json({ url: session.url });
}
