import type { NavigatorScreenParams } from '@react-navigation/native';

// 画面遷移の型定義（architecture.md 第3.2節のルート構成に対応）。
export type MainTabParamList = {
  Home: undefined;
  Calendar: undefined;
};

export type DiaryFlowParamList = {
  Mood: undefined;
  Event: undefined;
  Words: undefined;
  Preview: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  DiaryFlow: NavigatorScreenParams<DiaryFlowParamList>;
  Detail: { entryId: string };
  Settings: undefined;
  WebConnect: undefined;
};

// useNavigation の型付けを容易にするためのグローバル宣言。
declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
