// 管理画面が読み書きするところ。**画面ではなくここで持ち主と権限を確かめる。**
//
// 呼ぶ前に必ず `getAdmin()`（app/admin-auth.ts）を通すこと。この中では
// 管理者かどうかを見ていない。API側で一度だけ確かめる作りにしてある。
import { env } from 'cloudflare:workers';
import { ensureDatabase } from './data';
import { campaignPlan } from '../app/campaign';
import { effectivePlan, isPlanOverridden } from '../app/effective-plan';
import { bonusPlan, contractedPlan, type Plan } from '../app/entitlements';
import { isAdminEmail } from '../app/admin-emails';
import { MAX_LEVEL, levelFor, rankNames } from '../app/rank-perks';
import { planCatalog, yearlyYen } from '../app/plan-catalog';

export type AdminSummary = {
  members: number; activeMembers: number; suspendedMembers: number;
  requests: number; openRequests: number;
  introductions: number;
  /** 内訳。オファー（自社で請け負う）と、リファラル（知り合いの紹介）。 */
  offers: number; referrals: number;
  liveAds: number; newFeedback: number;
  /** お金を払っている会員。運営の特典で開いている人は**数えない**。 */
  paidMembers: number;
  monthlyPayers: number;
  yearlyPayers: number;
  /**
   * 毎月のサブスク売上（月あたりに直した見込み）。
   * 年払いは12で割って月あたりに直す。実際に請求した額ではなく、
   * 「いま契約が続いていれば、毎月これだけ入る」という数。
   */
  mrrYen: number;
  /** 広告の売上。申し込み時に実際に請求した額なので、Stripeと一致する。 */
  adRevenueTotalYen: number;
  adRevenueThisMonthYen: number;
  /** ランクごとの会員数。SILVER→DIAMOND の順。 */
  rankCounts: number[];
};

export type AdminMember = {
  id: string; email: string; displayName: string; company: string;
  status: string;
  /**
   * **実効プラン。** `members.plan` の列をそのまま出さない。
   * 列は「契約したもの」でしかなく、期限切れ・招待特典・運営の特典が
   * 乗っていない。列を出していたせいで、同じ人が管理画面では「無料」、
   * マイページでは「スタンダード」と食い違っていた（app/effective-plan.ts）。
   */
  plan: string;
  /** 契約ではなく運営の特典で開いているか。一覧に理由を出すために使う。 */
  adminPlan: boolean;
  /**
   * その実効プランが**どこから来ているか**。一覧に理由を出すために使う。
   * キャンペーン中は全員が実効スタンダードになるので、これが無いと
   * 「誰が本当にお金を払っているか」が管理画面から分からなくなる。
   */
  planSource: 'contract' | 'bonus' | 'campaign' | 'admin' | 'none';
  introCount: number; requestCount: number;
  createdAt: string; canUse: boolean;
};

export type AdminRequest = {
  id: string; title: string; category: string; status: string; deadline: string;
  createdAt: string; authorName: string; authorEmail: string;
  introCount: number; offerCount: number; referralCount: number;
};

export type AdminAd = {
  id: string; title: string; placement: string; status: string;
  startDate: string; endDate: string; viewCount: number; clickCount: number;
  memberName: string; memberCompany: string; linkUrl: string;
};

export type AdminFeedback = {
  id: string; category: string; body: string; status: string; createdAt: string;
  memberName: string; memberEmail: string;
};

/** 上に出す数字。1画面ぶんの様子が分かればよいので、細かくは出さない。 */
export async function adminSummary(): Promise<AdminSummary> {
  await ensureDatabase();
  const today = new Date().toISOString().slice(0, 10);
  const one = async (sql: string, ...binds: unknown[]) => {
    const row = await env.DB.prepare(sql).bind(...binds).first<{ count: number }>();
    return Number(row?.count ?? 0);
  };
  const [members, activeMembers, requests, openRequests, introductions, offers, referrals, liveAds, newFeedback] = await Promise.all([
    one('SELECT COUNT(*) AS count FROM members'),
    one("SELECT COUNT(*) AS count FROM members WHERE membership_status = 'active'"),
    one('SELECT COUNT(*) AS count FROM requests'),
    one("SELECT COUNT(*) AS count FROM requests WHERE status = 'open' AND deadline >= ?", today),
    one('SELECT COUNT(*) AS count FROM introductions'),
    one("SELECT COUNT(*) AS count FROM introductions WHERE kind = 'self'"),
    one("SELECT COUNT(*) AS count FROM introductions WHERE kind != 'self'"),
    one("SELECT COUNT(*) AS count FROM ad_slots WHERE status = 'active' AND start_date <= ? AND end_date >= ?", today, today),
    one("SELECT COUNT(*) AS count FROM feedback WHERE status = 'new'"),
  ]);
  // 課金。運営の特典で開いている人は外す。特典は売上ではないため。
  const payerRows = await env.DB.prepare(`SELECT email, plan_interval AS interval FROM members
    WHERE plan = 'standard' AND (plan_period_end = '' OR plan_period_end >= ?)`).bind(today).all<{ email: string; interval: string }>();
  const payers = payerRows.results.filter((row) => !isAdminEmail(row.email));
  const monthlyPayers = payers.filter((row) => row.interval !== 'year').length;
  const yearlyPayers = payers.length - monthlyPayers;
  const mrrYen = monthlyPayers * planCatalog.standard.monthlyYen + Math.round(yearlyPayers * yearlyYen('standard') / 12);

  const month = today.slice(0, 7);
  const adRevenue = await env.DB.prepare(`SELECT
      COALESCE(SUM(amount_yen), 0) AS total,
      COALESCE(SUM(CASE WHEN substr(start_date,1,7) = ? THEN amount_yen ELSE 0 END), 0) AS thisMonth
    FROM ad_slots WHERE status IN ('active', 'stopped') AND amount_yen > 0`)
    .bind(month).first<{ total: number; thisMonth: number }>();

  // ランクは招待した人数で決まる（app/rank-perks.ts）。列には持っていないので、
  // 招待の数を数えてから振り分ける。運営は最上位で固定。
  const inviteRows = await env.DB.prepare(`SELECT m.email,
      (SELECT COUNT(*) FROM members inv WHERE inv.invited_by = m.id) AS inviteCount
    FROM members m`).all<{ email: string; inviteCount: number }>();
  const rankCounts = new Array<number>(rankNames.length).fill(0);
  for (const row of inviteRows.results) {
    const level = isAdminEmail(row.email) ? MAX_LEVEL : levelFor(Number(row.inviteCount ?? 0));
    rankCounts[Math.min(Math.max(level, 1), rankNames.length) - 1] += 1;
  }

  return { members, activeMembers, suspendedMembers: members - activeMembers,
    requests, openRequests, introductions, offers, referrals, liveAds, newFeedback,
    paidMembers: payers.length, monthlyPayers, yearlyPayers, mrrYen,
    adRevenueTotalYen: Number(adRevenue?.total ?? 0), adRevenueThisMonthYen: Number(adRevenue?.thisMonth ?? 0),
    rankCounts };
}

/**
 * 会員の一覧。`keyword` は名前・会社・メールのどれかに当たれば拾う。
 * LIKE に渡す前に `%` と `_` を無害化する。入れられると全件一致になるため。
 */
export async function adminMembers(keyword = '', limit = 200): Promise<AdminMember[]> {
  await ensureDatabase();
  const term = keyword.trim();
  const like = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const where = term
    ? `WHERE (m.display_name LIKE ?1 ESCAPE '\\' OR m.company LIKE ?1 ESCAPE '\\'
        OR m.email LIKE ?1 ESCAPE '\\')`
    : '';
  const statement = env.DB.prepare(`SELECT m.id, m.email, m.display_name AS displayName, m.company,
    m.membership_status AS status, m.intro_count AS introCount, m.created_at AS createdAt,
    m.plan AS storedPlan, m.plan_period_end AS planPeriodEnd,
    m.bonus_plan AS bonusPlan, m.bonus_period_end AS bonusPeriodEnd,
    (SELECT COUNT(*) FROM requests r WHERE r.author_id = m.id) AS requestCount
    FROM members m ${where} ORDER BY m.created_at DESC LIMIT ${Number(limit)}`);
  const rows = await (term ? statement.bind(like) : statement)
    .all<Omit<AdminMember, 'canUse' | 'plan' | 'adminPlan' | 'planSource'> & { storedPlan: string; planPeriodEnd: string; bonusPlan: string; bonusPeriodEnd: string }>();
  const now = new Date();
  return rows.results.map(({ storedPlan, planPeriodEnd, bonusPlan, bonusPeriodEnd, ...row }) => ({
    ...row,
    // マイページとまったく同じ関数で出す。ここを別々に書くと、また食い違う。
    plan: effectivePlan(row.email, {
      plan: storedPlan === 'standard' ? 'standard' : 'free', planPeriodEnd: planPeriodEnd ?? '',
      bonusPlan: bonusPlan === 'standard' ? 'standard' : 'free', bonusPeriodEnd: bonusPeriodEnd ?? '',
    }, now),
    adminPlan: isPlanOverridden(row.email),
    planSource: planSourceOf(row.email, storedPlan, planPeriodEnd, bonusPlan, bonusPeriodEnd, now),
    canUse: row.status === 'active' || row.status === 'past_due',
  }));
}

/**
 * その人がスタンダードを使えている理由。上から順に強いものを返す。
 * 「実効プランは何か」ではなく「**なぜそうなっているか**」を出すためのもの。
 */
function planSourceOf(email: string, storedPlan: string, planPeriodEnd: string,
  bonus: string, bonusPeriodEnd: string, now: Date): AdminMember['planSource'] {
  if (isPlanOverridden(email)) return 'admin';
  const state = {
    plan: (storedPlan === 'standard' ? 'standard' : 'free') as Plan, planPeriodEnd: planPeriodEnd ?? '',
    bonusPlan: (bonus === 'standard' ? 'standard' : 'free') as Plan, bonusPeriodEnd: bonusPeriodEnd ?? '',
  };
  if (contractedPlan(state, now) !== 'free') return 'contract';
  if (bonusPlan(state, now) !== 'free') return 'bonus';
  if (campaignPlan() !== 'free') return 'campaign';
  return 'none';
}

/**
 * 会員の利用を止める／戻す。
 *
 * 止めるときは `canceled` にする。`membership_status` が取る値は
 * `db/data.ts` の `MembershipStatus` で決まっていて、そこに無い値を入れると
 * `invited`（承認待ち）に丸められる。意味が変わってしまうので、型にある
 * 値だけを使う。
 */
export async function adminSetMemberActive(memberId: string, active: boolean) {
  await ensureDatabase();
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE members SET membership_status = ?,
      activated_at = CASE WHEN ? = 'active' AND activated_at = '' THEN ? ELSE activated_at END
    WHERE id = ?`)
    .bind(active ? 'active' : 'canceled', active ? 'active' : 'canceled', now, memberId).run();
  // 止めたら、いま開いているスマホアプリのセッションも切る。
  // Web側は毎回この列を見るので、次の操作から入れなくなる。
  if (!active) await env.DB.prepare('DELETE FROM mobile_sessions WHERE member_id = ?').bind(memberId).run();
}

/** 投稿の一覧。会員をまたいで全部見る。期限切れも募集終了も出す。 */
export async function adminRequests(keyword = '', limit = 200): Promise<AdminRequest[]> {
  await ensureDatabase();
  const term = keyword.trim();
  const like = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const where = term
    ? `WHERE (r.title LIKE ?1 ESCAPE '\\' OR r.description LIKE ?1 ESCAPE '\\'
        OR m.display_name LIKE ?1 ESCAPE '\\' OR m.email LIKE ?1 ESCAPE '\\')`
    : '';
  const statement = env.DB.prepare(`SELECT r.id, r.title, r.category, r.status, r.deadline,
    r.created_at AS createdAt, m.display_name AS authorName, m.email AS authorEmail,
    (SELECT COUNT(*) FROM introductions i WHERE i.request_id = r.id) AS introCount,
    (SELECT COUNT(*) FROM introductions i WHERE i.request_id = r.id AND i.kind = 'self') AS offerCount,
    (SELECT COUNT(*) FROM introductions i WHERE i.request_id = r.id AND i.kind != 'self') AS referralCount
    FROM requests r JOIN members m ON m.id = r.author_id
    ${where} ORDER BY r.created_at DESC LIMIT ${Number(limit)}`);
  const rows = await (term ? statement.bind(like) : statement).all<AdminRequest>();
  return rows.results;
}

/**
 * 投稿を消す。会員本人の削除（`deleteRequest`）と同じ順番で消す。
 *
 * **子（やり取り・紹介）を先に消す。** 外部キーが効いているので、
 * 順番を間違えると `FOREIGN KEY constraint failed` で止まる。
 */
export async function adminDeleteRequest(requestId: string) {
  await ensureDatabase();
  const row = await env.DB.prepare('SELECT image_count AS imageCount FROM requests WHERE id = ?')
    .bind(requestId).first<{ imageCount: number }>();
  if (!row) throw new Error('その案件は見つかりませんでした。');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM request_comments WHERE request_id = ?').bind(requestId),
    // やり取りは紹介にぶら下がっている。**紹介より先に消す。**
    env.DB.prepare('DELETE FROM introduction_messages WHERE introduction_id IN (SELECT id FROM introductions WHERE request_id = ?)').bind(requestId),
    env.DB.prepare('DELETE FROM introductions WHERE request_id = ?').bind(requestId),
    env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(requestId),
  ]);
  const keys = [`request-videos/${requestId}`];
  for (let index = 0; index < Math.max(1, row.imageCount ?? 0); index += 1) {
    keys.push(index === 0 ? `request-thumbs/${requestId}` : `request-thumbs/${requestId}/${index}`);
    keys.push(index === 0 ? `request-images/${requestId}` : `request-images/${requestId}/${index}`);
  }
  await Promise.allSettled(keys.map((key) => env.AVATARS.delete(key)));
}

/** 広告枠の一覧。新しい掲載から順に出す。 */
export async function adminAds(limit = 100): Promise<AdminAd[]> {
  await ensureDatabase();
  const rows = await env.DB.prepare(`SELECT a.id, a.title, a.placement, a.status,
    a.start_date AS startDate, a.end_date AS endDate, a.view_count AS viewCount,
    a.click_count AS clickCount, a.link_url AS linkUrl,
    m.display_name AS memberName, m.company AS memberCompany
    FROM ad_slots a JOIN members m ON m.id = a.member_id
    ORDER BY a.start_date DESC LIMIT ${Number(limit)}`).all<AdminAd>();
  return rows.results;
}

/**
 * 広告の掲載を止める／戻す。
 * 枠は消さない（お金をいただいているので、記録と数字は残す）。表示だけ止める。
 */
export async function adminSetAdStopped(adId: string, stopped: boolean) {
  await ensureDatabase();
  await env.DB.prepare("UPDATE ad_slots SET status = ? WHERE id = ?")
    .bind(stopped ? 'stopped' : 'active', adId).run();
}

/** 届いたご意見。新しいものから、未対応を先に出す。 */
export async function adminFeedback(limit = 100): Promise<AdminFeedback[]> {
  await ensureDatabase();
  const rows = await env.DB.prepare(`SELECT f.id, f.category, f.body, f.status,
    f.created_at AS createdAt, m.display_name AS memberName, m.email AS memberEmail
    FROM feedback f JOIN members m ON m.id = f.member_id
    ORDER BY CASE WHEN f.status = 'new' THEN 0 ELSE 1 END, f.created_at DESC
    LIMIT ${Number(limit)}`).all<AdminFeedback>();
  return rows.results;
}

/** ご意見に「読んだ」印を付ける／戻す。消さないので、あとから読み返せる。 */
export async function adminSetFeedbackDone(feedbackId: string, done: boolean) {
  await ensureDatabase();
  await env.DB.prepare('UPDATE feedback SET status = ? WHERE id = ?')
    .bind(done ? 'done' : 'new', feedbackId).run();
}

// ===== 分析 =====
// 「いま何が起きているか」だけでなく、**次に何をすればいいか**が出るように作る。
// 数を並べるだけの画面は、見た次の日から見なくなるため。

export type AdminAnalytics = {
  days: number;
  /** 日ごとの動き。折れ線に使う。 */
  timeline: { date: string; members: number; requests: number; introductions: number }[];
  /** 紹介がどれだけ生まれているか。このサービスの核。 */
  matching: {
    requests: number; withIntro: number; introductions: number;
    /** 紹介が1件でも付いた投稿の割合（%）。 */
    hitRate: number;
    /** 投稿から最初の紹介が届くまでの日数（中央値）。 */
    medianDaysToFirstIntro: number | null;
  };
  /** 業種の需要と供給。**探されているのに会員がいない業種＝勧誘すべき業種。** */
  industryGap: { industry: string; wanted: number; supply: number; gap: number }[];
  /** 動きが止まっている会員。声をかける相手の一覧。 */
  dormant: { id: string; displayName: string; company: string; email: string; lastActive: string; daysSince: number }[];
  /** 売上。広告は押さえた時点で記録した実額だけを使う。 */
  revenue: { month: string; adYen: number; adCount: number }[];
  paidMembers: number;
};

export async function adminAnalytics(days = 90): Promise<AdminAnalytics> {
  await ensureDatabase();
  const span = Math.min(365, Math.max(7, Math.round(days)));
  const from = new Date(Date.now() - (span - 1) * 86400_000).toISOString().slice(0, 10);
  const now = Date.now();

  const daily = async (table: string, column = 'created_at') => {
    const rows = await env.DB.prepare(
      `SELECT substr(${column},1,10) AS date, COUNT(*) AS count FROM ${table} WHERE ${column} >= ? GROUP BY date`)
      .bind(from).all<{ date: string; count: number }>();
    return new Map(rows.results.map((row) => [row.date, Number(row.count)]));
  };
  const [memberDays, requestDays, introDays] = await Promise.all([
    daily('members'), daily('requests'), daily('introductions'),
  ]);
  // 日付は歯抜けにしない。0の日が抜けると、折れ線が実際より活発に見える。
  const timeline: AdminAnalytics['timeline'] = [];
  for (let index = 0; index < span; index += 1) {
    const date = new Date(now - (span - 1 - index) * 86400_000).toISOString().slice(0, 10);
    timeline.push({ date, members: memberDays.get(date) ?? 0, requests: requestDays.get(date) ?? 0, introductions: introDays.get(date) ?? 0 });
  }

  // 期間内に出た投稿と、それに届いた最初の紹介まで。
  const firstIntro = await env.DB.prepare(`SELECT r.id, r.created_at AS requestAt,
      (SELECT MIN(i.created_at) FROM introductions i WHERE i.request_id = r.id) AS introAt
    FROM requests r WHERE r.created_at >= ?`).bind(from).all<{ id: string; requestAt: string; introAt: string | null }>();
  const gaps = firstIntro.results
    .filter((row) => row.introAt)
    .map((row) => (new Date(row.introAt as string).getTime() - new Date(row.requestAt).getTime()) / 86400_000)
    .sort((a, b) => a - b);
  const introCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM introductions WHERE created_at >= ?')
    .bind(from).first<{ count: number }>();
  const requestTotal = firstIntro.results.length;
  const withIntro = gaps.length;


  // 業種は大分類でまとめる。詳細のままだと数が多すぎて、次に何をするか決められない。
  const [tagRows, memberIndustries] = await Promise.all([
    env.DB.prepare('SELECT industry_tags AS tags FROM requests WHERE created_at >= ?').bind(from).all<{ tags: string }>(),
    env.DB.prepare("SELECT primary_industry AS industry, COUNT(*) AS count FROM members WHERE primary_industry <> '' GROUP BY industry")
      .all<{ industry: string; count: number }>(),
  ]);

  const [{ industryGroups }] = await Promise.all([import('../app/industry-options')]);
  const groupOf = new Map<string, string>();
  for (const group of industryGroups) {
    groupOf.set(group.name, group.name);
    for (const child of group.children) groupOf.set(child, group.name);
  }
  const wanted = new Map<string, number>();
  for (const row of tagRows.results) {
    let tags: string[] = [];
    try { tags = JSON.parse(row.tags) as string[]; } catch { tags = []; }
    // 同じ投稿が同じ大分類に2回数えられないよう、まとめてから足す。
    for (const group of new Set(tags.map((tag) => groupOf.get(tag)).filter(Boolean) as string[])) {
      wanted.set(group, (wanted.get(group) ?? 0) + 1);
    }
  }
  const supply = new Map<string, number>();
  for (const row of memberIndustries.results) {
    const group = groupOf.get(row.industry);
    if (group) supply.set(group, (supply.get(group) ?? 0) + Number(row.count));
  }
  const industryGap = industryGroups
    .map((group) => {
      const want = wanted.get(group.name) ?? 0;
      const have = supply.get(group.name) ?? 0;
      return { industry: group.name, wanted: want, supply: have, gap: want - have };
    })
    .filter((row) => row.wanted > 0 || row.supply > 0)
    .sort((a, b) => b.gap - a.gap || b.wanted - a.wanted);

  const dormantRows = await env.DB.prepare(`SELECT m.id, m.display_name AS displayName, m.company,
      m.email, m.created_at AS createdAt,
      (SELECT MAX(created_at) FROM requests WHERE author_id = m.id) AS lastRequest,
      (SELECT MAX(created_at) FROM introductions WHERE introducer_id = m.id) AS lastIntro
    FROM members m WHERE m.membership_status = 'active'`)
    .all<{ id: string; displayName: string; company: string; email: string;
      createdAt: string; lastRequest: string | null; lastIntro: string | null }>();
  const dormant = dormantRows.results
    .map((row) => {
      // 何もしていない人は、登録した日を最後の動きとする。
      const lastActive = [row.lastRequest, row.lastIntro, row.createdAt]
        .filter(Boolean).sort().pop() as string;
      return {
        id: row.id, displayName: row.displayName, company: row.company, email: row.email,
        lastActive: lastActive.slice(0, 10),
        daysSince: Math.floor((now - new Date(lastActive).getTime()) / 86400_000),
      };
    })
    .filter((row) => row.daysSince >= 30)
    .sort((a, b) => b.daysSince - a.daysSince);

  const revenueRows = await env.DB.prepare(`SELECT substr(start_date,1,7) AS month,
      SUM(amount_yen) AS adYen, COUNT(*) AS adCount FROM ad_slots
    WHERE status IN ('active', 'stopped') AND amount_yen > 0
    GROUP BY month ORDER BY month DESC LIMIT 12`).all<{ month: string; adYen: number; adCount: number }>();
  const paid = await env.DB.prepare("SELECT COUNT(*) AS count FROM members WHERE plan <> 'free'").first<{ count: number }>();

  return {
    days: span,
    timeline,
    matching: {
      requests: requestTotal,
      withIntro,
      introductions: Number(introCount?.count ?? 0),
      hitRate: requestTotal ? Math.round((withIntro / requestTotal) * 1000) / 10 : 0,
      medianDaysToFirstIntro: gaps.length
        ? Math.round(gaps[Math.floor((gaps.length - 1) / 2)] * 10) / 10
        : null,
    },
    industryGap,
    dormant,
    revenue: revenueRows.results.map((row) => ({ month: row.month, adYen: Number(row.adYen ?? 0), adCount: Number(row.adCount ?? 0) })).reverse(),
    paidMembers: Number(paid?.count ?? 0),
  };
}

// --- 会員1人の詳細 ------------------------------------------------------------
// 一覧の行を押したときに出す。**1人ぶんを、運営が知りたい順に並べて返す。**
//
// 何を出すかの決め方:
//   - 「この人は続いているか」…… 使った日、連続、直近30日
//   - 「この人は場に何を返したか」…… 投稿・オファー・紹介
//   - 「この人はお金を払っているか」…… プランの出どころ、広告のお支払い
//
// **出さないもの**: メッセージの中身、オファーの本文。数だけを出す。
// 運営が読めるようにすると、会員に「読まれている」と伝えなければならなくなる。

export type AdminMemberDetail = {
  id: string; email: string; displayName: string; nameKana: string;
  company: string; companyKana: string; positionTitle: string;
  businessArea: string; primaryIndustry: string; notifyIndustries: string[];
  annualRevenueBand: string; facebookUrl: string;
  avatarKey: string; avatarVersion: number;
  status: string; canUse: boolean;
  createdAt: string; activatedAt: string;
  /** 実効プランと、その出どころ。一覧と同じ関数で出す。 */
  plan: string; planSource: AdminMember['planSource']; adminPlan: boolean;
  planPeriodEnd: string; bonusPeriodEnd: string; planInterval: string;
  hasStripeCustomer: boolean;
  /** ランク（招待して参加した人数で決まる）。 */
  rank: string; level: number; inviteCount: number;
  inviteCode: string;
  /** 誰の招待で入ったか。空なら直接。 */
  invitedBy: { id: string; displayName: string; company: string } | null;
  /** 招待して入った人たち。 */
  invitees: { id: string; displayName: string; company: string; createdAt: string; canUse: boolean }[];

  activity: {
    /** 開いた日の合計。member_days を入れた日から数えている。 */
    totalDays: number;
    /** 直近30日のうち開いた日数。 */
    days30: number;
    /** 最後に開いた日（YYYY-MM-DD）。空なら記録なし。 */
    lastSeen: string;
    /** いま何日続けて開いているか。 */
    streak: number;
    /** 直近8週ぶん（56日）の開いた／開いていない。カレンダーに描く。 */
    recent: { date: string; open: boolean }[];
    /** member_days を入れてから何日経ったか。数字の読み方の但し書きに使う。 */
    trackedSince: string;
  };

  /** 投稿した案件。**閲覧数は出さない**（案件は閲覧を数えていない。広告だけ）。 */
  requests: { id: string; title: string; category: string; status: string; deadline: string;
    createdAt: string; introCount: number }[];
  offers: {
    /** この人が出したオファー（案件・広告あわせて）。 */
    sent: number;
    /** この人の案件に届いたオファー。 */
    received: number;
    /** 人を紹介した数（自薦ではないもの）。 */
    referral: number;
  };
  messages: { threads: number; sent: number };
  gacha: { draws: number; wonDays: number; usedDays: number };
  ads: { count: number; paidYen: number; giftDays: number; views: number; clicks: number;
    list: { id: string; title: string; placement: string; status: string;
      startDate: string; endDate: string; amountYen: number; giftDays: number;
      viewCount: number; clickCount: number }[] };
};

export async function adminMemberDetail(memberId: string): Promise<AdminMemberDetail | null> {
  await ensureDatabase();
  const row = await env.DB.prepare(`SELECT id, email, display_name AS displayName, name_kana AS nameKana,
      company, company_kana AS companyKana, position_title AS positionTitle,
      business_area AS businessArea, primary_industry AS primaryIndustry,
      notify_industries AS notifyIndustriesJson, annual_revenue_band AS annualRevenueBand,
      facebook_url AS facebookUrl, avatar_key AS avatarKey, avatar_version AS avatarVersion,
      membership_status AS status, created_at AS createdAt, activated_at AS activatedAt,
      plan AS storedPlan, plan_period_end AS planPeriodEnd, plan_interval AS planInterval,
      bonus_plan AS bonusPlan, bonus_period_end AS bonusPeriodEnd,
      stripe_customer_id AS stripeCustomerId, invite_code AS inviteCode, invited_by AS invitedBy
    FROM members WHERE id = ?`).bind(memberId).first<Record<string, string | number>>();
  if (!row) return null;

  const email = String(row.email ?? '');
  const now = new Date();
  const state = {
    plan: (row.storedPlan === 'standard' ? 'standard' : 'free') as Plan,
    planPeriodEnd: String(row.planPeriodEnd ?? ''),
    bonusPlan: (row.bonusPlan === 'standard' ? 'standard' : 'free') as Plan,
    bonusPeriodEnd: String(row.bonusPeriodEnd ?? ''),
  };

  const today = jstToday();
  const from56 = shiftDay(today, -55);
  const from30 = shiftDay(today, -29);

  const [days, requests, offers, messages, gacha, ads, invitees, inviter] = await env.DB.batch([
    // 開いた日。**全部は取らない。** 数だけ先に出し、カレンダーには56日ぶんを使う。
    env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM member_days WHERE member_id = ?1) AS totalDays,
        (SELECT COUNT(*) FROM member_days WHERE member_id = ?1 AND day >= ?2) AS days30,
        (SELECT MAX(day) FROM member_days WHERE member_id = ?1) AS lastSeen,
        (SELECT MIN(day) FROM member_days) AS trackedSince`).bind(memberId, from30),
    env.DB.prepare(`SELECT r.id, r.title, r.category, r.status, r.deadline, r.created_at AS createdAt,
        (SELECT COUNT(*) FROM introductions i WHERE i.request_id = r.id) AS introCount
      FROM requests r WHERE r.author_id = ? ORDER BY r.created_at DESC LIMIT 50`).bind(memberId),
    env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM introductions WHERE introducer_id = ?1) AS sentRequest,
        (SELECT COUNT(*) FROM ad_introductions WHERE introducer_id = ?1) AS sentAd,
        (SELECT COUNT(*) FROM introductions i JOIN requests r ON r.id = i.request_id
          WHERE r.author_id = ?1) AS received,
        (SELECT COUNT(*) FROM introductions WHERE introducer_id = ?1 AND kind = 'referral') AS referral`)
      .bind(memberId),
    env.DB.prepare(`SELECT
        (SELECT COUNT(DISTINCT pair_key) FROM direct_messages
          WHERE sender_id = ?1 OR recipient_id = ?1) AS threads,
        (SELECT COUNT(*) FROM direct_messages WHERE sender_id = ?1) AS sent`).bind(memberId),
    env.DB.prepare(`SELECT COUNT(*) AS draws, COALESCE(SUM(days),0) AS wonDays
      FROM gacha_days WHERE member_id = ?`).bind(memberId),
    env.DB.prepare(`SELECT id, title, placement, status, start_date AS startDate, end_date AS endDate,
        amount_yen AS amountYen, gift_days AS giftDays, view_count AS viewCount, click_count AS clickCount
      FROM ad_slots WHERE member_id = ? ORDER BY start_date DESC LIMIT 50`).bind(memberId),
    env.DB.prepare(`SELECT id, display_name AS displayName, company, created_at AS createdAt,
        membership_status AS status
      FROM members WHERE invited_by = ? ORDER BY created_at DESC LIMIT 100`).bind(memberId),
    env.DB.prepare('SELECT id, display_name AS displayName, company FROM members WHERE id = ?')
      .bind(String(row.invitedBy ?? '')),
  ]);

  // カレンダー用の56日ぶんは、別に引く（上の batch は集計だけ）。
  const recentRows = await env.DB.prepare('SELECT day FROM member_days WHERE member_id = ? AND day >= ?')
    .bind(memberId, from56).all<{ day: string }>();
  const openDays = new Set(recentRows.results.map((item) => item.day));
  const recent: AdminMemberDetail['activity']['recent'] = [];
  for (let index = 55; index >= 0; index -= 1) {
    const date = shiftDay(today, -index);
    recent.push({ date, open: openDays.has(date) });
  }
  // 続けて開いている日数。**今日まだ開いていない人も切らさない**（昨日から数える）。
  let streak = 0;
  let cursor = openDays.has(today) ? today : shiftDay(today, -1);
  while (openDays.has(cursor)) { streak += 1; cursor = shiftDay(cursor, -1); }

  const dayRow = (days.results[0] ?? {}) as Record<string, string | number | null>;
  const offerRow = (offers.results[0] ?? {}) as Record<string, number>;
  const messageRow = (messages.results[0] ?? {}) as Record<string, number>;
  const gachaRow = (gacha.results[0] ?? {}) as Record<string, number>;
  const adRows = ads.results as Record<string, string | number>[];
  const inviterRow = (inviter.results[0] ?? null) as { id: string; displayName: string; company: string } | null;
  const inviteeRows = invitees.results as Record<string, string>[];

  // ガチャの券をどれだけ使ったか。ad_slots に積まれた無料日数で数える。
  const usedDays = adRows.reduce((sum, ad) => sum + Number(ad.giftDays ?? 0), 0);

  return {
    id: String(row.id), email,
    displayName: String(row.displayName ?? ''), nameKana: String(row.nameKana ?? ''),
    company: String(row.company ?? ''), companyKana: String(row.companyKana ?? ''),
    positionTitle: String(row.positionTitle ?? ''),
    businessArea: String(row.businessArea ?? ''), primaryIndustry: String(row.primaryIndustry ?? ''),
    notifyIndustries: parseIndustries(row.notifyIndustriesJson),
    annualRevenueBand: String(row.annualRevenueBand ?? ''), facebookUrl: String(row.facebookUrl ?? ''),
    avatarKey: String(row.avatarKey ?? ''), avatarVersion: Number(row.avatarVersion ?? 0),
    status: String(row.status ?? ''),
    canUse: row.status === 'active' || row.status === 'past_due',
    createdAt: String(row.createdAt ?? ''), activatedAt: String(row.activatedAt ?? ''),
    plan: effectivePlan(email, state, now),
    planSource: planSourceOf(email, String(row.storedPlan ?? ''), state.planPeriodEnd,
      String(row.bonusPlan ?? ''), state.bonusPeriodEnd, now),
    adminPlan: isPlanOverridden(email),
    planPeriodEnd: state.planPeriodEnd, bonusPeriodEnd: state.bonusPeriodEnd,
    planInterval: String(row.planInterval ?? 'month'),
    hasStripeCustomer: Boolean(String(row.stripeCustomerId ?? '')),
    rank: rankNames[Math.min(levelFor(inviteeRows.length), MAX_LEVEL) - 1] ?? rankNames[0],
    level: levelFor(inviteeRows.length),
    inviteCount: inviteeRows.length,
    inviteCode: String(row.inviteCode ?? ''),
    invitedBy: inviterRow ? { ...inviterRow } : null,
    invitees: inviteeRows.map((item) => ({
      id: String(item.id), displayName: String(item.displayName ?? ''), company: String(item.company ?? ''),
      createdAt: String(item.createdAt ?? ''),
      canUse: item.status === 'active' || item.status === 'past_due',
    })),

    activity: {
      totalDays: Number(dayRow.totalDays ?? 0),
      days30: Number(dayRow.days30 ?? 0),
      lastSeen: String(dayRow.lastSeen ?? ''),
      streak,
      recent,
      trackedSince: String(dayRow.trackedSince ?? ''),
    },
    requests: (requests.results as Record<string, string | number>[]).map((item) => ({
      id: String(item.id), title: String(item.title ?? ''), category: String(item.category ?? ''),
      status: String(item.status ?? ''), deadline: String(item.deadline ?? ''),
      createdAt: String(item.createdAt ?? ''),
      introCount: Number(item.introCount ?? 0),
    })),
    offers: {
      sent: Number(offerRow.sentRequest ?? 0) + Number(offerRow.sentAd ?? 0),
      received: Number(offerRow.received ?? 0),
      referral: Number(offerRow.referral ?? 0),
    },
    messages: { threads: Number(messageRow.threads ?? 0), sent: Number(messageRow.sent ?? 0) },
    gacha: { draws: Number(gachaRow.draws ?? 0), wonDays: Number(gachaRow.wonDays ?? 0), usedDays },
    ads: {
      count: adRows.length,
      paidYen: adRows.reduce((sum, ad) => sum + Number(ad.amountYen ?? 0), 0),
      giftDays: usedDays,
      views: adRows.reduce((sum, ad) => sum + Number(ad.viewCount ?? 0), 0),
      clicks: adRows.reduce((sum, ad) => sum + Number(ad.clickCount ?? 0), 0),
      list: adRows.map((ad) => ({
        id: String(ad.id), title: String(ad.title ?? ''), placement: String(ad.placement ?? ''),
        status: String(ad.status ?? ''), startDate: String(ad.startDate ?? ''), endDate: String(ad.endDate ?? ''),
        amountYen: Number(ad.amountYen ?? 0), giftDays: Number(ad.giftDays ?? 0),
        viewCount: Number(ad.viewCount ?? 0), clickCount: Number(ad.clickCount ?? 0),
      })),
    },
  };
}

/** 日本時間の今日。member_days と同じ数え方でないと、連続日数がずれる。 */
function jstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function parseIndustries(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
