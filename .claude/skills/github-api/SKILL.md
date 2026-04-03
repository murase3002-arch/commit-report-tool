---
name: github-api
description: GitHub REST APIの使い方。コミット取得、差分取得、リポジトリ情報取得に使用。
allowed-tools: Bash(node:*), Bash(gh:*)
---

# GitHub API ガイド

GitHub REST API の使用方法を説明します。

## ⚠️ 重要: コミット取得はスクリプトを使用

**前日のコミット取得は必ず以下のスクリプトを使用してください。**
日付計算を手動で行わないでください。

### 全ブランチ一括取得（推奨）

```bash
# ⚠️ 必ず --output オプションを使用（シェルリダイレクトは使わない）
node .claude/skills/github-api/scripts/get-all-branch-commits.js <owner> <repo> --output /tmp/all-commits.json
```

全ブランチのコミットを一括で取得します。daily-reportではこちらを使用してください。

**重要**: `--output` オプションを使用してファイルに直接書き込んでください。
シェルリダイレクト（`> file`）は stdout/stderr が混在する問題があります。

**最適化版**: GraphQLで最近アクティブなブランチのみを抽出してからコミット取得。
309ブランチ → 約20ブランチに絞り込み（約90%のAPI呼び出し削減）。

環境変数 `ACTIVE_DAYS` でアクティブ判定期間を変更可能（デフォルト: 7日）。

### パスフィルタリング

```bash
node .claude/skills/github-api/scripts/filter-commits-by-path.js \
  --owner <owner> --repo <repo> --paths "app/,web/,supabase/"
```

`get-all-branch-commits.js` の出力を受け取り、指定パスに関連するコミットのみを抽出します。
各コミットの変更ファイルを GitHub API で取得し、パスマッチングを行います。

**⚠️ 重要: コミットのパスフィルタリングは必ずこのスクリプトを使用してください。**
アドホックなフィルタリングコードは全件処理を保証できません。

| 引数 | 必須 | 説明 |
|------|------|------|
| `--input <file>` | No | 入力ファイル（省略時stdin） |
| `--owner <name>` | Yes | リポジトリオーナー |
| `--repo <name>` | Yes | リポジトリ名 |
| `--paths <list>` | Yes | カンマ区切りパス（例: "app/,web/"） |
| `--concurrency <n>` | No | 並列数（デフォルト: 5） |

使用例:
```bash
# パイプライン使用
node .claude/skills/github-api/scripts/get-all-branch-commits.js owner repo \
  | node .claude/skills/github-api/scripts/filter-commits-by-path.js \
      --owner owner --repo repo --paths "app/,web/,supabase/"

# ファイル入力
node .claude/skills/github-api/scripts/filter-commits-by-path.js \
  --input /tmp/commits.json \
  --owner owner --repo repo --paths "app/,web/,supabase/"
```

出力形式は入力と同じ構造 + 追加フィールド:
- `metadata.filter_paths`: フィルタ対象パス
- `metadata.original_commits`: フィルタ前のコミット数
- `metadata.filtered_commits`: フィルタ後のコミット数
- 各コミットに `matched_files` フィールド（マッチしたファイル情報）

### 単一ブランチ取得

```bash
node .claude/skills/github-api/scripts/get-commits.js <owner> <repo> [branch]
```

## 出力形式

スクリプトは正規化されたJSONを出力します。**jqでの追加処理は不要です。**

### 全ブランチ一括取得の出力

```json
{
  "metadata": {
    "target_date": "2026-01-23",
    "start_utc": "2026-01-22T15:00:00Z",
    "end_utc": "2026-01-23T14:59:59Z",
    "total_branches": 308,
    "checked_branches": 18,
    "active_branches": 6,
    "total_commits": 31,
    "default_branch": "main",
    "active_days_filter": 7,
    "failed_branches": 0,
    "has_errors": false
  },
  "branches": {
    "main": {
      "commits": [...],
      "is_default": true
    },
    "feature-branch": {
      "commits": [...],
      "is_default": false
    }
  }
}
```

| フィールド | 説明 |
|-----------|------|
| `metadata.target_date` | 対象日（JST） |
| `metadata.total_branches` | 全ブランチ数 |
| `metadata.checked_branches` | チェックしたブランチ数（最適化後） |
| `metadata.active_branches` | コミットがあるブランチ数 |
| `metadata.default_branch` | デフォルトブランチ名 |
| `metadata.active_days_filter` | アクティブ判定期間（日数） |
| `metadata.failed_branches` | 取得失敗したブランチ数 |
| `metadata.has_errors` | エラーがあったかどうか |
| `branches[name].commits` | コミット配列 |
| `branches[name].is_default` | デフォルトブランチかどうか |
| `errors` | 失敗したブランチの詳細（エラー時のみ） |

### エラーハンドリング（自動リカバリ）

スクリプトは以下の自動リカバリ機能を持ちます：

1. **個別リトライ**: 各ブランチ取得は最大3回リトライ（指数バックオフ: 1秒、2秒、4秒）
2. **一括再試行**: 1回目のループで失敗したブランチは、10秒後にまとめて再試行
3. **確実な失敗検出**: 再試行でも失敗した場合、exit 1 で終了

**動作フロー:**
```
1回目のループ (308ブランチ)
  → 各ブランチ最大3回リトライ
  → 失敗: 2ブランチ

10秒待機

再試行ループ (2ブランチ)
  → 各ブランチ最大3回リトライ
  → 失敗: 0ブランチ → 正常終了 (exit 0)
  → 失敗: 1ブランチ以上 → 異常終了 (exit 1)
```

**GitHub Actionsでの動作:**
- exit 1 → ワークフロー失敗として記録
- 「Re-run jobs」で再実行可能
- 一時的なAPI不安定は自動リカバリで解決する場合が多い

### 単一ブランチ取得の出力

### 保証される項目
| フィールド | 説明 |
|-----------|------|
| `sha` | コミットハッシュ |
| `message` | コミットメッセージ |
| `date` | コミット日時（ISO 8601） |
| `author.login` | ユーザー名（**必ず存在**） |
| `author.avatar_url` | アバターURL（**必ず存在**） |
| `html_url` | GitHubへのリンク |

### 出力例
```json
[
  {
    "sha": "abc1234567890",
    "message": "コミットメッセージ",
    "date": "2026-01-19T10:00:00Z",
    "author": {
      "login": "username",
      "avatar_url": "https://avatars.githubusercontent.com/u/123?v=4"
    },
    "html_url": "https://github.com/..."
  }
]
```

### フォールバック
GitHub APIで `author: null` の場合（メールがGitHubに紐付いていない）:
- `login`: コミッター名を使用
- `avatar_url`: Gravatar identicon（メールハッシュから生成）

フォールバック発生時は標準エラーにログ出力:
```
[Avatar] フォールバック: Unknown User (8cca2ef)
```

### 例
```bash
# your-username/your-web-app の main ブランチ
node .claude/skills/github-api/scripts/get-commits.js your-username your-web-app main

# 出力例（標準エラー）:
# === 検索期間 ===
# 対象日(JST): 2026-01-18
# 開始(UTC): 2026-01-17T15:00:00Z
# 終了(UTC): 2026-01-18T14:59:59Z
# ブランチ: main
# ================
```

### 環境変数
- `GH_TOKEN`: GitHub API認証トークン（必須）
- `TARGET_DATE`: 対象日を指定（省略時は前日JST）形式: `YYYY-MM-DD`

## 禁止事項

❌ `date -u` や `date -d` で日付計算を手動実行
❌ `since=$TODAY` のような変数を自分で定義
❌ タイムゾーン変換を手動で計算

## 理由

日付計算は以下の問題が起きやすい：
- `date -u` はUTCの「当日」を返す（JSTではない）
- macOS と Linux で `date` のオプションが異なる
- タイムゾーン変換の計算ミス

スクリプトはテスト済みで、毎回同じ結果を保証します。

---

## 認証

環境変数 `GH_TOKEN` を使用：

```bash
curl -H "Authorization: Bearer $GH_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     -H "X-GitHub-Api-Version: 2022-11-28" \
     "https://api.github.com/..."
```

## エンドポイント

### コミット一覧取得

```
GET /repos/{owner}/{repo}/commits
```

パラメータ:
- `since`: ISO 8601形式の日時（この日時以降のコミット）
- `author`: 作者でフィルタ

レスポンス:
```json
[
  {
    "sha": "abc1234567890",
    "commit": {
      "message": "コミットメッセージ",
      "author": {
        "name": "Author Name",
        "date": "2025-01-01T12:00:00Z"
      }
    },
    "author": {
      "login": "github-username",
      "id": 1234567,
      "avatar_url": "https://avatars.githubusercontent.com/u/1234567?v=4"
    },
    "html_url": "https://github.com/..."
  }
]
```

### ⚠️ 図解で使用する重要フィールド

HTML図解を生成する際、以下のフィールドを**必ず**APIレスポンスから取得すること：

| フィールド | 用途 | 注意 |
|-----------|------|------|
| `author.login` | ユーザー名表示 | サンプルの値をコピーしない |
| `author.avatar_url` | アバター画像 | **必ずAPIから取得** |
| `commit.author.date` | 日時表示 | ISO 8601形式 |

**禁止事項:**
- サンプルHTMLのURLをそのまま使用
- 架空のavatar_urlを生成
- 他のユーザーのavatar_urlを流用

### コミット詳細取得（差分含む）

```
GET /repos/{owner}/{repo}/commits/{sha}
```

レスポンス:
```json
{
  "sha": "abc1234567890",
  "files": [
    {
      "filename": "src/index.ts",
      "status": "modified",
      "additions": 10,
      "deletions": 5,
      "patch": "@@ -1,5 +1,10 @@\n-old\n+new"
    }
  ],
  "stats": {
    "additions": 10,
    "deletions": 5,
    "total": 15
  }
}
```

### リポジトリ情報取得

```
GET /repos/{owner}/{repo}
```

レスポンス:
```json
{
  "name": "repo-name",
  "description": "Repository description",
  "language": "TypeScript",
  "default_branch": "main"
}
```

### ブランチ一覧取得

```
GET /repos/{owner}/{repo}/branches
```

パラメータ:
- `per_page`: 1ページあたりの件数（最大100）

例:
```bash
curl -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/owner/repo/branches?per_page=100"
```

レスポンス:
```json
[
  {
    "name": "main",
    "commit": {
      "sha": "abc1234567890",
      "url": "https://api.github.com/repos/owner/repo/commits/abc1234567890"
    },
    "protected": true
  },
  {
    "name": "feature/video-player",
    "commit": {
      "sha": "def5678901234",
      "url": "https://api.github.com/repos/owner/repo/commits/def5678901234"
    },
    "protected": false
  }
]
```

### ブランチ別コミット取得

特定ブランチのコミットを取得するには `sha` パラメータにブランチ名を指定:

```
GET /repos/{owner}/{repo}/commits?sha={branch_name}&since={date}
```

**⚠️ 日付計算は必ずスクリプトを使用してください**（上記「禁止事項」参照）。

### ブランチの累計コミット取得

ブランチの履歴を把握するため、直近N件のコミットを取得:

```bash
# 直近30件のコミットを取得（ブランチの概要把握用）
curl -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/owner/repo/commits?sha=feature/video-player&per_page=30"
```

**用途:**
- ブランチの目的をAIで要約
- 累計コミット数の表示
- ブランチ開始日の特定（最古のコミット日時）

## エラーハンドリング

| ステータス | 意味 | 対処 |
|-----------|------|------|
| 401 | 認証エラー | GH_TOKEN を確認 |
| 403 | レート制限 | 待機または認証確認 |
| 404 | リポジトリ不在 | owner/repo を確認 |

## レート制限

- 認証済み: 5000リクエスト/時
- `X-RateLimit-Remaining` ヘッダーで残り確認可能
