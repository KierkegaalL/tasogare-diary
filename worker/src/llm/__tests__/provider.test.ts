import { describe, expect, it } from 'vitest';

import { getLlmProvider, ApiError } from '../index';

describe('getLlmProvider', () => {
  it('LLM_PROVIDER 未指定なら gemini を既定にする', () => {
    expect(getLlmProvider({ GEMINI_API_KEY: 'k' }).name).toBe('gemini');
  });

  it('LLM_PROVIDER=gemini を明示指定できる', () => {
    expect(getLlmProvider({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }).name).toBe('gemini');
  });

  it('大文字小文字を区別しない', () => {
    expect(getLlmProvider({ LLM_PROVIDER: 'GEMINI', GEMINI_API_KEY: 'k' }).name).toBe('gemini');
  });

  it('未対応プロバイダは internal エラーを投げる', () => {
    expect(() => getLlmProvider({ LLM_PROVIDER: 'unknown' })).toThrow(ApiError);
    try {
      getLlmProvider({ LLM_PROVIDER: 'unknown' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('internal');
    }
  });
});
