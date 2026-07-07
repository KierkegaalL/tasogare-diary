#!/usr/bin/env bash
#
# UserPromptSubmit hook: 依頼文を判定し、CLAUDE.md 原則7（使用モデルの使い分け）に
# 沿った推奨モデルをセッションに助言として注入する。
#
# 注意: フックは実行中セッションのモデルを切り替えられない。本フックは
#       「推奨モデル」を提示し、必要なら /model での切替を促すだけの助言。
#
# 入力: stdin に UserPromptSubmit の JSON（.prompt に依頼文）。
# 出力: hookSpecificOutput.additionalContext に1行の助言。

set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"
[ -z "$INPUT" ] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

python3 - "$INPUT" <<'PY' 2>/dev/null
import json, sys

try:
    data = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)

# 英語混じり語のため小文字化して照合（日本語は影響を受けない）
p = (data.get("prompt") or "").lower()

# 新規作成を示すシグナル（強めの語に限定して過検出を避ける）
create = ["新規", "新しく", "新しい", "ゼロから", "作成", "つくって", "作って",
          "生成", "立ち上げ", "セットアップ", "初期化", "雛形", "scaffold",
          "create", "新設", "起こして"]
# 既存/作成済みファイルへの実行を示すシグナル
# （「確認」「チェック」「対応」「改善」「整合」「見直し」等の汎用語は過検出の
#   ため除外し、修整・調査を直接示す語に絞る）
modify = ["修正", "修整", "直し", "直して", "変更", "更新", "調査", "残タスク",
          "リファクタ", "レビュー", "バグ", "不具合", "追記", "既存",
          "作成済み", "fix", "review", "debug"]

# 「作成済み」は修整側のシグナル。create の「作成」と部分一致で衝突するため、
# create 判定用テキストからは「作成済み」を除去してから照合する。
p_for_create = p.replace("作成済み", "")
has_c = any(k in p_for_create for k in create)
has_m = any(k in p for k in modify)

OPUS = "Opus 4.8 (claude-opus-4-8)"
SONNET = "Sonnet 5 (claude-sonnet-5)"

if has_c and not has_m:
    rec = f"新規作成と推定 → {OPUS} を推奨"
elif has_m and not has_c:
    rec = f"既存/作成済みファイルへの実行と推定 → {SONNET} を推奨"
elif has_c and has_m:
    rec = f"新規作成と修整が混在の可能性。新規部分は {OPUS}、既存部分は {SONNET}"
else:
    rec = f"判定不能。新規作成なら {OPUS}、既存ファイルへの修整・調査なら {SONNET}"

msg = ("[モデル方針 / CLAUDE.md 原則7] " + rec +
       "。現在のモデルが異なる場合は /model で切替を検討（本フックは切替を強制しない）。")

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": msg
    }
}))
PY
exit 0
