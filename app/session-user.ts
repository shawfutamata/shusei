// ログインしている会員の、画面とAPIが共通で使う最小の形。
//
// もとはChatGPT Sitesが差し込むヘッダ（oai-authenticated-user-*）から
// 作っていたが、Sitesから切り離したのでその経路は無い。いまは
// Googleログインが作ったセッション（member_session Cookie）と、
// アプリのBearerトークンの2つだけが入口。

export type SessionUser = {
  /** members.id。Googleログインではメールから引いた会員ID。 */
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};
