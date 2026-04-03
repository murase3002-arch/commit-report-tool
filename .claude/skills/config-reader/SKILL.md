---
name: config-reader
description: プロジェクト設定ファイルの構造と読み方。設定ファイルを扱うときに参照。
---

# Config Reader

プロジェクト設定ファイルの構造と使用方法を説明します。

## ファイル構造（2ファイル分離）

```
configs/
├── repos/           # リポジトリ構造定義（共有）
│   └── your-repo.yml
└── projects/        # プロジェクト設定（個別）
    └── your-project.yml
```

### 分離のメリット
- **再利用性**: リポジトリ構造は1箇所で管理、複数プロジェクトから参照
- **柔軟性**: プロジェクトごとに対象アプリを選択可能
- **保守性**: アプリ追加時はrepo定義のみ更新

---

## リポジトリ構造定義（repos/*.yml）

```yaml
repository:
  owner: your-username
  name: your-web-app
  description: リポジトリの説明

# 全アプリ/ツールの定義
apps:
  - id: my-app               # 一意のID（プロジェクトから参照）
    path: "app/"             # ディレクトリパス
    name: "Webアプリ"         # 正式名称（レポートで使用）
    short_name: "アプリ"      # 短縮名（タグで使用）
    icon: "smartphone"       # アイコン名
    color: "blue"            # Tailwind色名
    category: "main"         # カテゴリID

# カテゴリ定義
categories:
  main:
    name: "Webプラットフォーム"
    description: "Webサービスのコアシステム"
```

### フィールド説明

| フィールド | 用途 |
|-----------|------|
| `id` | アプリの一意識別子（プロジェクトから参照） |
| `path` | コミット分類用のディレクトリパス |
| `name` | 正式名称（アプリ別レポートのセクション名） |
| `short_name` | 短縮名（サマリーのタグ表示） |
| `icon` | Lucideアイコン名 |
| `color` | Tailwind CSS色名 |
| `category` | カテゴリID（グループ化用） |

---

## プロジェクト設定（projects/*.yml）

```yaml
project:
  name: "開発プロジェクト"
  description: "プロジェクトの説明"

# 参照するリポジトリ定義（相対パス）
repo_config: "repos/your-repo.yml"

# 対象アプリの指定（2つの方法）
include_apps:        # 方法1: IDで個別指定
  - my-app
  - my-web
  - my-backend

include_categories:  # 方法2: カテゴリで一括指定
  - main

# Slack設定
slack:
  token_env: SLACK_BOT_TOKEN      # トークンの環境変数名
  channel_env: SLACK_CHANNEL      # チャンネルIDの環境変数名
  channel_name: "#your-channel"   # 参考用

# レポート対象メンバー（空 = 全員）
target_authors: []

# ワンポイントTIPS設定（オプション）
tips:
  enabled: true                    # TIPSを生成するか
  # 以下はオプション（省略時はAIが変更内容から自動判断）
  # title: "ワンポイントTIPS"       # 図解のタイトル（デフォルト: "ワンポイントTIPS"）
  # prompt: "カスタムプロンプト"     # TIPS生成の指示（省略推奨）
```

### アプリ指定の優先順位

1. `include_apps` が指定されている場合 → そのIDのアプリのみ対象
2. `include_categories` のみ指定 → そのカテゴリに属するアプリが対象
3. 両方指定 → `include_apps` と `include_categories` の和集合

---

## 読み込み手順

### 1. プロジェクト設定を読み込む

```bash
cat configs/projects/your-project.yml
```

### 2. repo_config を解決してリポジトリ定義を読み込む

```bash
# repo_config: "repos/your-repo.yml" の場合
cat configs/repos/your-repo.yml
```

### 3. 対象アプリをフィルタリング

```python
import yaml

# プロジェクト設定を読み込み
with open('configs/projects/your-project.yml') as f:
    project = yaml.safe_load(f)

# リポジトリ定義を読み込み
repo_path = f"configs/{project['repo_config']}"
with open(repo_path) as f:
    repo = yaml.safe_load(f)

# 対象アプリをフィルタリング
include_apps = set(project.get('include_apps', []))
include_categories = set(project.get('include_categories', []))

target_apps = []
for app in repo['apps']:
    if app['id'] in include_apps:
        target_apps.append(app)
    elif app['category'] in include_categories:
        target_apps.append(app)

# include_apps も include_categories も空なら全アプリ対象
if not include_apps and not include_categories:
    target_apps = repo['apps']
```

---

## コミットのアプリ分類

変更ファイルのパスから、どのアプリに属するか判定：

```python
def classify_commit(changed_files, target_apps):
    """コミットの変更ファイルからアプリを特定"""
    app_commits = {}

    for file_path in changed_files:
        for app in target_apps:
            if file_path.startswith(app['path']):
                app_id = app['id']
                if app_id not in app_commits:
                    app_commits[app_id] = []
                app_commits[app_id].append(file_path)
                break

    return app_commits
```

---

## 使用例

```bash
# レポートを生成
claude "configs/projects/your-project.yml を使って今日のレポートを作成して"
```
