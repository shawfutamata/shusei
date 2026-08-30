// 管理画面が読み書きするところ。**画面ではなくここで持ち主と権限を確かめる。**
//
// 呼ぶ前に必ず `getAdmin()`（app/admin-auth.ts）を通すこと。この中では
// 管理者かどうかを見ていない。API側で一度だけ確かめる作りにしてある。
import { env } from 'cloudflare:workers';
import { ensureDatabase } from './data';

export type AdminSummary = {
  members: number; activeMembers: number; suspendedMembers: number;
  requests: number; openRequests: number;
  introductions: number; comments: number;
  liveAds: number; newFeedback: number;
};

export type AdminMember = {
  id: string; email: string; displayName: string; company: string; venue: string;
  status: string; plan: string; introCount: number; requestCount: number;
  createdAt: string; canUse: boolean;
};

export type AdminRequest = {
  id: string; title: string; category: string; status: string; deadline: string;
  createdAt: string; authorName: string; authorEmail: string;
  introCount: number; commentCount: number;
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
  const [members, activeMembers, requests, openRequests, introductions, comments, liveAds, newFeedback] = await Promise.all([
    one('SELECT COUNT(*) AS count FROM members'),
    one("SELECT COUNT(*) AS count FROM members WHERE membership_status = 'active'"),
    one('SELECT COUNT(*) AS count FROM requests'),
    one("SELECT COUNT(*) AS count FROM requests WHERE status = 'open' AND deadline >= ?", today),
    one('SELECT COUNT(*) AS count FROM introductions'),
    one('SELECT COUNT(*) AS count FROM request_comments'),
    one("SELECT COUNT(*) AS count FROM ad_slots WHERE status = 'active' AND start_date <= ? AND end_date >= ?", today, today),
    one("SELECT COUNT(*) AS count FROM feedback WHERE status = 'new'"),
  ]);
  return { members, activeMembers, suspendedMembers: members - activeMembers,
    requests, openRequests, introductions, comments, liveAds, newFeedback };
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
    m.membership_status AS status, m.plan, m.intro_count AS introCount, m.created_at AS createdAt,
    (SELECT COUNT(*) FROM requests r WHERE r.author_id = m.id) AS requestCount
    FROM members m ${where} ORDER BY m.created_at DESC LIMIT ${Number(limit)}`);
  const rows = await (term ? statement.bind(like) : statement).all<Omit<AdminMember, 'canUse'>>();
  return rows.results.map((row) => ({ ...row, canUse: row.status === 'active' || row.status === 'past_due' }));
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
    (SELECT COUNT(*) FROM request_comments c WHERE c.request_id = r.id) AS commentCount
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
