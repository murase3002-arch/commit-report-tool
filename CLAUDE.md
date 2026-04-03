# コミネコ

GitHubコミットを図解してSlackに投稿するシステム。

## プロジェクト構造

```
configs/
├── repos/           # リポジトリ内のアプリ定義（共有）
└── projects/        # プロジェクト別設定（Slack先、対象アプリ）

.claude/
├── prompts/
│   └── daily-report.md    # メイン処理フロー
└── skills/                # 各処理の詳細知識
```

## 実行方法

```bash
claude "/daily-report を configs/projects/your-project.yml で実行"
```

## スキル参照ガイド

| タイミング | スキル | 内容 |
|-----------|--------|------|
| 設定読み込み時 | config-reader | 2層構造の読み方、アプリフィルタ |
| コミット取得時 | github-api | REST APIエンドポイント |
| 差分分析時 | code-analyzer | ビジネス視点への変換ルール |
| 図解生成前 | diagram-guidelines | デザイン基準、examples |
| スクショ時 | screenshot-capture | Playwrightスクリプト |
| Slack投稿時 | slack-formatting | 複数画像まとめ投稿 |

## GitHub Secrets

GitHub Actionsで使用するシークレット一覧:

| シークレット名 | 用途 |
|---------------|------|
| `ANTHROPIC_API_KEY` | Claude API認証 |
| `GH_TOKEN` | GitHub API認証（コミット取得） |
| `SLACK_BOT_TOKEN` | Slack Bot認証 |
| `SLACK_CHANNEL` | 投稿先チャンネルID |

## Slack投稿ルール

Slackへの投稿は **必ず `slack-formatting` スキルを使用** してください。

```bash
node .claude/skills/slack-formatting/scripts/post-report.js \
  --message "メッセージ" \
  /tmp/image1.png /tmp/image2.png
```

**禁止事項:**
- curl で直接 Slack API を呼び出す
- 独自の投稿ロジックを書く
