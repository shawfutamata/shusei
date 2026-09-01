// 管理画面が読み書きするところ。**画面ではなくここで持ち主と権限を確かめる。**
//
// 呼ぶ前に必ず `getAdmin()`（app/admin-auth.ts）を通すこと。この中では
// 管理者かどうかを見ていない。API側で一度だけ確かめる作りにしてある。
import { env } from 'cloudflare:workers';
import { ensureDatabase } from './data';
import { effectivePlan, isPlanOverridden } from '../app/effective-plan';
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
  id: string; email: string; displayName: string; company: string; venue: string;
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
 * 会員の一覧。`keyword` は名前・会社・メール・会場のどれかに当たれば拾う。
 * LIKE に渡す前に `%` と `_` を無害化する。入れられると全件一致になるため。
 */
export async function adminMembers(keyword = '', limit = 200): Promise<AdminMember[]> {
  await ensureDatabase();
  const term = keyword.trim();
  const like = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const where = term
    ? `WHERE (m.display_name LIKE ?1 ESCAPE '\\' OR m.company LIKE ?1 ESCAPE '\\'
        OR m.email LIKE ?1 ESCAPE '\\' OR m.venue LIKE ?1 ESCAPE '\\')`
    : '';
  const statement = env.DB.prepare(`SELECT m.id, m.email, m.display_name AS displayName, m.company, m.venue,
    m.membership_status AS status, m.intro_count AS introCount, m.created_at AS createdAt,
    m.plan AS storedPlan, m.plan_period_end AS planPeriodEnd,
    m.bonus_plan AS bonusPlan, m.bonus_period_end AS bonusPeriodEnd,
    (SELECT COUNT(*) FROM requests r WHERE r.author_id = m.id) AS requestCount
    FROM members m ${where} ORDER BY m.created_at DESC LIMIT ${Number(limit)}`);
  const rows = await (term ? statement.bind(like) : statement)
    .all<Omit<AdminMember, 'canUse' | 'plan' | 'adminPlan'> & { storedPlan: string; planPeriodEnd: string; bonusPlan: string; bonusPeriodEnd: string }>();
  const now = new Date();
  return rows.results.map(({ storedPlan, planPeriodEnd, bonusPlan, bonusPeriodEnd, ...row }) => ({
    ...row,
    // マイページとまったく同じ関数で出す。ここを別々に書くと、また食い違う。
    plan: effectivePlan(row.email, {
      plan: storedPlan === 'standard' ? 'standard' : 'free', planPeriodEnd: planPeriodEnd ?? '',
      bonusPlan: bonusPlan === 'standard' ? 'standard' : 'free', bonusPeriodEnd: bonusPeriodEnd ?? '',
    }, now),
    adminPlan: isPlanOverridden(row.email),
    canUse: row.status === 'active' || row.status === 'past_due',
  }));
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
  if (!row) throw new Error('その探しごとは見つかりませんでした。');
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
  /** 会場ごとの活きぐあい。どこに顔を出すかを決めるのに使う。 */
  venues: { venue: string; members: number; requests: number; introductions: number }[];
  /** 業種の需要と供給。**探されているのに会員がいない業種＝勧誘すべき業種。** */
  industryGap: { industry: string; wanted: number; supply: number; gap: number }[];
  /** 動きが止まっている会員。声をかける相手の一覧。 */
  dormant: { id: string; displayName: string; company: string; venue: string; email: string; lastActive: string; daysSince: number }[];
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

  const venueRows = await env.DB.prepare(`SELECT m.venue AS venue, COUNT(*) AS members,
      (SELECT COUNT(*) FROM requests r JOIN members a ON a.id = r.author_id WHERE a.venue = m.venue) AS requests,
      (SELECT COUNT(*) FROM introductions i JOIN members b ON b.id = i.introducer_id WHERE b.venue = m.venue) AS introductions
    FROM members m WHERE m.venue <> '' GROUP BY m.venue ORDER BY members DESC LIMIT 15`)
    .all<{ venue: string; members: number; requests: number; introductions: number }>();

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

  const dormantRows = await env.DB.prepare(`SELECT m.id, m.display_name AS displayName, m.company, m.venue,
      m.email, m.created_at AS createdAt,
      (SELECT MAX(created_at) FROM requests WHERE author_id = m.id) AS lastRequest,
      (SELECT MAX(created_at) FROM introductions WHERE introducer_id = m.id) AS lastIntro,
    FROM members m WHERE m.membership_status = 'active'`)
    .all<{ id: string; displayName: string; company: string; venue: string; email: string;
      createdAt: string; lastRequest: string | null; lastIntro: string | null }>();
  const dormant = dormantRows.results
    .map((row) => {
      // 何もしていない人は、登録した日を最後の動きとする。
      const lastActive = [row.lastRequest, row.lastIntro, row.createdAt]
        .filter(Boolean).sort().pop() as string;
      return {
        id: row.id, displayName: row.displayName, company: row.company, venue: row.venue, email: row.email,
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
    venues: venueRows.results.map((row) => ({ ...row, members: Number(row.members), requests: Number(row.requests), introductions: Number(row.introductions) })),
    industryGap,
    dormant,
    revenue: revenueRows.results.map((row) => ({ month: row.month, adYen: Number(row.adYen ?? 0), adCount: Number(row.adCount ?? 0) })).reverse(),
    paidMembers: Number(paid?.count ?? 0),
  };
}
