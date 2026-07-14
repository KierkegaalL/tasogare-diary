import type { AuthProvider, AuthUser } from './types';

// ネイティブ Firebase 認証プロバイダ（@react-native-firebase/auth）の中核実装
// （docs/migration-react-native-firebase.md 第3章・第4章）。
//
// 設計方針（nativeCredentialSource.ts と同じ）:
//   - 実際のネイティブモジュール（@react-native-firebase/auth）や JS SDK プロバイダ・Worker 呼び出しは
//     依存注入（NativeFirebaseAuthDeps）で受け取り、このファイルには **ネイティブ import を持たせない**。
//     → Expo Go 既定バンドルにネイティブモジュールを引き込まない（本ファイルは配布ビルドの
//       nativeFirebaseAuthProviderInstall.ts からのみ組み立てられる）。
//     → 移行ブリッジ（第4章）のロジックをネイティブ非依存で単体テストできる。
//
// プライバシー: ID トークン・カスタムトークンは機微情報。**一切ログ出力しない**（constraints.md）。

/** ネイティブ @react-native-firebase/auth のユーザー（必要な最小限のみ）。 */
export interface NativeFirebaseUser {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
}

/** ネイティブ @react-native-firebase/auth の操作。install ファイルで実モジュールを束ねて渡す。 */
export interface NativeAuthBinding {
  /** 既存のネイティブセッションを復元する（onAuthStateChanged を一度だけ待つ）。無ければ null。 */
  restore(): Promise<NativeFirebaseUser | null>;
  /** 匿名サインイン（引き継ぐ uid が無い新規端末用）。 */
  signInAnonymously(): Promise<NativeFirebaseUser>;
  /** カスタムトークンでサインイン（移行ブリッジ用。uid・リンク状態を引き継ぐ）。 */
  signInWithCustomToken(customToken: string): Promise<NativeFirebaseUser>;
  /** 現在のネイティブセッションの ID トークン。未サインインなら null。 */
  getIdToken(): Promise<string | null>;
  /** サインアウト。 */
  signOut(): Promise<void>;
}

/** 「移行済み」ローカルフラグの読み書き（既定は AsyncStorage 実装。install ファイルで注入）。 */
export interface MigrationFlagStore {
  isMigrated(): Promise<boolean>;
  markMigrated(): Promise<void>;
}

export interface NativeFirebaseAuthDeps {
  native: NativeAuthBinding;
  /**
   * 現行 JS SDK プロバイダ（firebaseAuthProvider）。移行ブリッジで「まず JS SDK セッションを復元」
   * （第4章 手順1）・「その ID トークンを取得」（手順2）・フォールバック時のサインアウトに使う。
   */
  jsProvider: Pick<AuthProvider, 'init' | 'getIdToken' | 'signOut'>;
  /** JS SDK の ID トークンを Worker /migrateToNativeAuth に送り、同一 uid のカスタムトークンを得る。 */
  mintCustomToken(jsIdToken: string): Promise<string>;
  migrationFlag: MigrationFlagStore;
}

function toAuthUser(user: NativeFirebaseUser): AuthUser {
  // provider は既存の firebaseAuthProvider.toAuthUser と揃えて 'anonymous' 固定。
  // 恒久アカウント（Apple/Google リンク）かどうかは isAnonymous で表す（Phase5 でリンク実装）。
  return {
    uid: user.uid,
    provider: 'anonymous',
    displayName: user.displayName ?? undefined,
    isAnonymous: user.isAnonymous,
  };
}

// 起動時のモード。移行ブリッジが失敗した起動では、この回だけ現行 JS SDK 経路を維持する
// （第9章のフォールバック方針: ブリッジ失敗時はネイティブへ切替えず次回起動で再試行）。
type ActiveMode = 'native' | 'js-fallback';

export function createNativeFirebaseAuthProvider(deps: NativeFirebaseAuthDeps): AuthProvider {
  const { native, jsProvider, mintCustomToken, migrationFlag } = deps;

  // init()/signIn() で確定するモード。getIdToken/signOut の委譲先を決める。
  // 既定は 'native'（signIn 直呼び＝新規端末や、init 前の呼び出しに対する安全側）。
  // 注意: このプロバイダは getAuthProvider() が返す単一インスタンスに閉じた状態。init() は起動時に
  // 1回だけ呼ばれる想定（authStore.initialize）。将来 init() を複数回呼ぶ経路を足す場合、後の呼び出しが
  // mode を上書きする点に留意すること（現状の呼び出し経路では問題ない）。
  let mode: ActiveMode = 'native';

  return {
    init: async (): Promise<AuthUser | null> => {
      // 移行済みなら以降はネイティブ SDK の通常復元のみ（ブリッジをスキップ）。
      if (await migrationFlag.isMigrated()) {
        mode = 'native';
        const restored = await native.restore();
        return restored ? toAuthUser(restored) : null;
      }

      // 未移行: まず現行 JS SDK セッションを復元（第4章 手順1）。
      const jsUser = await jsProvider.init();

      // 引き継ぐ uid が無い新規端末（第4章 手順5）: ブリッジ不要。ネイティブ側の既存セッションを
      // 返し、以後はブリッジをスキップするため移行済みフラグを立てる（無ければ null → authStore が
      // signIn() で匿名サインインする）。
      if (!jsUser) {
        const restored = await native.restore();
        await migrationFlag.markMigrated();
        mode = 'native';
        return restored ? toAuthUser(restored) : null;
      }

      // 既存 JS uid あり: ブリッジ実行（第4章 手順2-4）。
      // JS の ID トークン → Worker で同一 uid のカスタムトークン → ネイティブへ signInWithCustomToken。
      try {
        const jsIdToken = await jsProvider.getIdToken();
        const customToken = await mintCustomToken(jsIdToken);
        const nativeUser = await native.signInWithCustomToken(customToken);
        await migrationFlag.markMigrated();
        mode = 'native';
        return toAuthUser(nativeUser);
      } catch {
        // 第9章 フォールバック: ブリッジ失敗（Worker 到達不可等）時はネイティブへ切替えず、この起動は
        // 現行 JS SDK セッションのまま動作させる（既存データはそのまま見える）。移行済みフラグは
        // 立てないため、次回起動で再試行する。getIdToken/signOut も JS 側へ委譲する。
        // 失敗理由（トークン等の機微情報を含みうる）はログしない（constraints.md）。
        mode = 'js-fallback';
        return jsUser;
      }
    },

    signIn: async (): Promise<AuthUser> => {
      // authStore は init() が null のとき（＝復元セッションなし）に呼ぶ。ネイティブで匿名サインインし、
      // 以後ブリッジをスキップするため移行済みフラグを立てる。
      const nativeUser = await native.signInAnonymously();
      await migrationFlag.markMigrated();
      mode = 'native';
      return toAuthUser(nativeUser);
    },

    signOut: async (): Promise<void> => {
      // js-fallback 中は JS SDK セッションでのみサインインしているため JS 側をサインアウトする。
      if (mode === 'js-fallback') {
        await jsProvider.signOut();
        return;
      }
      await native.signOut();
    },

    getIdToken: async (): Promise<string> => {
      // js-fallback 中は JS SDK の ID トークンを使う（callClaudeWorker が認証に用いる）。
      if (mode === 'js-fallback') {
        return jsProvider.getIdToken();
      }
      const token = await native.getIdToken();
      if (!token) {
        throw new Error('ネイティブ Firebase セッションがありません（ID トークンを取得できません）。');
      }
      return token;
    },

    // linkWith（Apple/Google 恒久アカウント昇格）は Phase5 で実装する。未実装のため canLinkAccount は
    // false を返し、UI 導線は出さない（src/services/auth/index.ts）。
  };
}
