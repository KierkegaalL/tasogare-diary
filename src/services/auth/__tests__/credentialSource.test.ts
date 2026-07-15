import { AuthLinkError } from '../types';
import type { OAuthCredentialSource } from '../types';
import {
  getCredentialSource,
  resetCredentialSource,
  setCredentialSource,
  unavailableCredentialSource,
} from '../credentialSource';

describe('credentialSource（差し替え可能なシーム）', () => {
  afterEach(() => resetCredentialSource());

  it('既定は unavailable：isAvailable=false・getCredential は AuthLinkError("unavailable")', async () => {
    expect(getCredentialSource()).toBe(unavailableCredentialSource);
    expect(getCredentialSource().isAvailable('apple')).toBe(false);
    expect(getCredentialSource().isAvailable('google')).toBe(false);
    await expect(getCredentialSource().getCredential('apple')).rejects.toMatchObject({
      name: 'AuthLinkError',
      code: 'unavailable',
    });
  });

  it('setCredentialSource で差し替えられ、reset で既定へ戻る', async () => {
    const fake: OAuthCredentialSource = {
      isAvailable: () => true,
      getCredential: async (kind) => ({ kind, idToken: 'tok' }),
    };
    setCredentialSource(fake);
    expect(getCredentialSource()).toBe(fake);
    expect(getCredentialSource().isAvailable('google')).toBe(true);
    await expect(getCredentialSource().getCredential('google')).resolves.toEqual({ kind: 'google', idToken: 'tok' });

    resetCredentialSource();
    expect(getCredentialSource()).toBe(unavailableCredentialSource);
  });

  it('unavailable の拒否は AuthLinkError インスタンス', async () => {
    await expect(unavailableCredentialSource.getCredential('google')).rejects.toBeInstanceOf(AuthLinkError);
  });
});
