import { AuthLinkError, linkKindLabel, mapFirebaseLinkError } from '../types';

describe('linkKindLabel', () => {
  it('kind を表示名へ', () => {
    expect(linkKindLabel('google')).toBe('Google');
    expect(linkKindLabel('apple')).toBe('Apple');
  });
});

describe('mapFirebaseLinkError', () => {
  const err = (code: string) => ({ code });

  it('credential-already-in-use は非移行の注意を含むメッセージにする', () => {
    const mapped = mapFirebaseLinkError('google', err('auth/credential-already-in-use'));
    expect(mapped).toBeInstanceOf(AuthLinkError);
    expect(mapped.code).toBe('credential-already-in-use');
    expect(mapped.message).toContain('引き継がれません');
    expect(mapped.message).toContain('Google');
  });

  it('email-already-in-use を写像する', () => {
    expect(mapFirebaseLinkError('apple', err('auth/email-already-in-use')).code).toBe('email-already-in-use');
  });

  it('provider-already-linked / credential-already-linked は already-linked', () => {
    expect(mapFirebaseLinkError('apple', err('auth/provider-already-linked')).code).toBe('already-linked');
    expect(mapFirebaseLinkError('apple', err('auth/credential-already-linked')).code).toBe('already-linked');
  });

  it('network-request-failed は network', () => {
    expect(mapFirebaseLinkError('google', err('auth/network-request-failed')).code).toBe('network');
  });

  it('未知のコード・code を持たない値は unknown', () => {
    expect(mapFirebaseLinkError('google', err('auth/internal-error')).code).toBe('unknown');
    expect(mapFirebaseLinkError('google', new Error('boom')).code).toBe('unknown');
    expect(mapFirebaseLinkError('google', null).code).toBe('unknown');
  });
});
