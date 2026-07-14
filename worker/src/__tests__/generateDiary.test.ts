import { describe, expect, it, vi } from 'vitest';

import { handleAdjustDiary, handleGenerateDiary } from '../index';
import type { LlmProvider } from '../llm';

// api-contract.md 3.2/3.3: レスポンスに実際に使ったモデルID（source.model として保存追跡用）を
// 含めることを検証する。purpose ごとに異なるモデルを返す stub で取り違えが無いことも確認する。
function llmStub(): LlmProvider {
  return {
    name: 'stub',
    modelFor: (purpose) => (purpose === 'generate' ? 'stub-generate-model' : 'stub-interactive-model'),
    callText: vi.fn(),
    callJson: vi.fn().mockResolvedValue({ bodyText: '本文', mood: 'tender' }),
  };
}

describe('handleGenerateDiary', () => {
  it('purpose=generate のモデルID・promptVersion を返す', async () => {
    const llm = llmStub();
    const res = await handleGenerateDiary(llm, { words: [{ text: '疲れた', category: 'mood' }], date: '2026-07-01' });

    expect(res).toMatchObject({ bodyText: '本文', mood: 'tender', model: 'stub-generate-model' });
    expect(res.promptVersion).toBeTruthy();
    expect(llm.callJson).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'generate' }));
  });

  it('words が空なら invalid-argument', async () => {
    await expect(handleGenerateDiary(llmStub(), { words: [], date: '2026-07-01' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('words が上限件数を超えると invalid-argument（LLMへ任意長の入力を転送しない防御）', async () => {
    const words = Array.from({ length: 101 }, (_, i) => ({ text: `w${i}`, category: 'assoc' }));
    await expect(handleGenerateDiary(llmStub(), { words, date: '2026-07-01' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('words の1語が上限文字数を超えると invalid-argument', async () => {
    const words = [{ text: 'x'.repeat(201), category: 'mood' }];
    await expect(handleGenerateDiary(llmStub(), { words, date: '2026-07-01' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('date が上限文字数を超えると invalid-argument', async () => {
    const words = [{ text: '疲れた', category: 'mood' }];
    await expect(handleGenerateDiary(llmStub(), { words, date: 'x'.repeat(33) })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('handleAdjustDiary', () => {
  it('purpose=interactive のモデルID・promptVersion を返す（mood は再推定しない）', async () => {
    const llm = llmStub();
    const res = await handleAdjustDiary(llm, { bodyText: '元の本文', instruction: 'positive' });

    expect(res).toMatchObject({ bodyText: '本文', mood: null, model: 'stub-interactive-model' });
    expect(res.promptVersion).toBeTruthy();
    expect(llm.callJson).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'interactive' }));
  });

  it('instruction が不正なら invalid-argument', async () => {
    await expect(handleAdjustDiary(llmStub(), { bodyText: '本文', instruction: 'unknown' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('bodyText が上限文字数を超えると invalid-argument（LLMへ任意長の入力を転送しない防御）', async () => {
    await expect(
      handleAdjustDiary(llmStub(), { bodyText: 'x'.repeat(4001), instruction: 'positive' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
