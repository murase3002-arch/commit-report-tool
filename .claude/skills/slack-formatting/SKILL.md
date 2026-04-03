---
name: slack-formatting
description: Slackチャンネルに複数画像をまとめて投稿する。Slack投稿、レポート投稿、画像アップロード時に使用。curlは使わずpost-report.jsを実行すること。
allowed-tools: Bash(node:*), Read
---

# Slack Formatting ガイド

Slack への投稿方法を説明します。

## ⚠️ 重要: 必ずスクリプトを使用すること

**Slack投稿は必ず以下のスクリプトを使用してください。**
curlで直接APIを呼び出したり、独自の投稿ロジックを書いたりしないでください。

```bash
# 必ずこのスクリプトを使用
node .claude/skills/slack-formatting/scripts/post-report.js \
  --message "メッセージテキスト" \
  /tmp/image1.png /tmp/image2.png ...
```

## スクリプト使用方法

### 基本的な使い方

```bash
node .claude/skills/slack-formatting/scripts/post-report.js \
  --message "📊 今日のコミットレポート

期間: 2026-01-06 00:00 〜 23:59 (JST)
対象: 1ブランチ / 18コミット / 5名

🐱 コミネコ で自動生成" \
  /tmp/daily-summary.png \
  /tmp/branch-summary-main.png \
  /tmp/by-app.png \
  /tmp/timeline.png \
  /tmp/tips.png
```

### 環境変数

| 環境変数 | 用途 | 必須 |
|----------|------|------|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token | ✅ |
| `SLACK_CHANNEL` | 投稿先チャンネルID | ※未設定時はデバッグチャンネル |

**デバッグ用チャンネル**: `YOUR_DEBUG_CHANNEL_ID`

### スクリプトが行うこと

- ✅ 複数画像を**1メッセージにまとめて**投稿
- ✅ **チャンネルに直接投稿**（スレッドではない）
- ✅ 詳細なログ出力（原因特定用）
- ✅ エラーハンドリング

### スクリプトの出力例

```
========================================
=== SLACK投稿開始 ===
========================================
[2026-01-07T07:15:00.000Z] 投稿先チャンネル: C0XXXXXXXXX
[2026-01-07T07:15:00.000Z] 画像数: 5
[2026-01-07T07:15:00.000Z] メッセージ: 📊 今日のコミットレポート...
[2026-01-07T07:15:00.000Z]   [1] daily-summary.png
[2026-01-07T07:15:00.000Z]   [2] branch-summary-main.png
...
========================================
=== SLACK投稿完了 ===
========================================
[2026-01-07T07:15:10.000Z] チャンネル: C0XXXXXXXXX
[2026-01-07T07:15:10.000Z] 画像数: 5
[2026-01-07T07:15:10.000Z] ✅ 投稿成功！
```

---

## 禁止事項

以下の方法は**絶対に使用しないでください**:

```bash
# ❌ 禁止: curlで直接APIを呼び出す
curl -X POST https://slack.com/api/chat.postMessage ...

# ❌ 禁止: スレッドに投稿する
curl ... -d '{"thread_ts": "xxx"}' ...

# ❌ 禁止: テキストと画像を別々に投稿
curl ... chat.postMessage  # テキスト
curl ... files.upload      # 画像（スレッドに）
```

---

## Block Kit 構造（参考）

テキストメッセージのフォーマットに使用できます。

### mrkdwn 記法

| 書式 | 記法 | 例 |
|------|------|-----|
| 太字 | `*text*` | *太字* |
| イタリック | `_text_` | _イタリック_ |
| 取消線 | `~text~` | ~取消線~ |
| コード | `` `code` `` | `code` |
| リンク | `<URL\|テキスト>` | <https://github.com\|GitHub> |
| メンション | `<@USER_ID>` | <@U1234> |
| チャンネル | `<#CHANNEL_ID>` | <#C1234> |

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| 画像がスレッドに投稿された | スクリプトを使っていない | `post-report.js` を使用する |
| 画像が1枚しか投稿されない | スクリプトを使っていない | `post-report.js` を使用する |
| 3回投稿された | 投稿処理が複数回呼ばれた | ログで `SLACK投稿開始` の回数を確認 |
| `not_authed` エラー | 環境変数が渡されていない | `SLACK_BOT_TOKEN` を確認 |
