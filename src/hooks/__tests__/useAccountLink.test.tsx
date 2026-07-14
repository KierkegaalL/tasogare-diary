import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { useLinkableAccountKinds } from '../useAccountLink';
import { useAuthStore } from '../../stores/authStore';

// authStore が内部で localAuthProvider（AsyncStorage 依存）を import するためモックする。
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// 実機検証で発覚した不具合（連携済み後の再起動で「Googleと連携」ボタンが再表示される）の回帰テスト。
// 原因: toAuthUser() は provider を常に 'anonymous' 固定で返すため、判定は isAnonymous で行う必要がある。

const mockCanLinkAccount = jest.fn();
jest.mock('../../services/auth', () => ({
  canLinkAccount: (kind: string) => mockCanLinkAccount(kind),
}));

function Probe() {
  const kinds = useLinkableAccountKinds();
  return <Text>{JSON.stringify(kinds)}</Text>;
}

function renderKinds(): string[] {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<Probe />);
  });
  const json = root.toJSON();
  const text = Array.isArray(json) ? json[0]?.children?.[0] : json?.children?.[0];
  return JSON.parse(text as string) as string[];
}

beforeEach(() => {
  mockCanLinkAccount.mockReset();
  mockCanLinkAccount.mockReturnValue(true);
  useAuthStore.setState({ user: null, status: 'loading' });
});

describe('useLinkableAccountKinds', () => {
  it('user が無ければ空配列（canLinkAccount も呼ばない）', () => {
    expect(renderKinds()).toEqual([]);
    expect(mockCanLinkAccount).not.toHaveBeenCalled();
  });

  it('isAnonymous===false（連携済み）なら空配列（canLinkAccount も呼ばない）', () => {
    useAuthStore.setState({
      user: { uid: 'u1', provider: 'anonymous', isAnonymous: false },
      status: 'authenticated',
    });

    expect(renderKinds()).toEqual([]);
    expect(mockCanLinkAccount).not.toHaveBeenCalled();
  });

  it('isAnonymous===true なら provider の値によらず canLinkAccount でフィルタした結果を返す', () => {
    // provider が 'anonymous' 固定でも（toAuthUser 由来の復元後の実際の値を模す）isAnonymous だけで判定する。
    useAuthStore.setState({
      user: { uid: 'u1', provider: 'anonymous', isAnonymous: true },
      status: 'authenticated',
    });
    mockCanLinkAccount.mockImplementation((kind: string) => kind === 'google');

    expect(renderKinds()).toEqual(['google']);
  });
});
