昨日のコミットレポートを作成してSlackに投稿してください。

**重要**: このプロンプトの末尾に指定されたプロジェクト設定ファイルを使用してください。

## 参照スキル

以下のスキルを参照してください：
- **config-reader**: 設定ファイルの読み方
- **github-api**: GitHub APIでのコミット取得
- **code-analyzer**: ビジネス視点での記述ルール（**禁止ワード確認**）
- **diagram-guidelines**: HTML図解のデザイン（**examples必読**）
- **slack-formatting**: Slack投稿の方法（複数画像まとめて投稿）
- **screenshot-capture**: スクリーンショット撮影

## 処理フロー

### 1. 設定ファイルを読み込む
- プロジェクト設定ファイル（`configs/projects/*.yml`）を読み込む
- `repo_config` を参照してリポジトリ構造定義（`configs/repos/*.yml`）を読み込む
- `include_apps` / `include_categories` に基づいて対象アプリを特定

### 2. 全ブランチの昨日のコミットを一括取得

**⚠️ 重要: 必ず以下のスクリプトを使用**

日付計算とブランチ走査は `github-api` スキルのスクリプトを使用してください。
**手動で `date` コマンドやブランチ一覧取得を実行しないでください。**

```bash
# 全ブランチのコミットを一括取得
# ⚠️ 必ず --output オプションを使用（シェルリダイレクトは使わない）
node .claude/skills/github-api/scripts/get-all-branch-commits.js {owner} {repo} --output /tmp/all-commits.json
```

**スクリプトが自動で行うこと:**
1. **GraphQLで全ブランチの最終コミット日を取得**（4回のAPI呼び出し）
2. **最近アクティブなブランチだけ抽出**（過去7日以内 + デフォルトブランチ）
3. `dependabot/`、`renovate/` で始まるブランチの除外
4. **絞り込んだブランチのみ**コミット取得（リトライ付き）
5. 失敗ブランチの自動再取得（10秒待機後に再試行）
6. それでも失敗した場合は exit 1 で処理中断

**最適化の効果:**
- 309ブランチ → 約20ブランチに絞り込み
- API呼び出し約90%削減
- エラー発生リスクが大幅に低減

**環境変数:**
- `ACTIVE_DAYS`: アクティブ判定期間（デフォルト: 7日）

### 3. パスでフィルタリング

**⚠️ 重要: 必ず以下のスクリプトを使用。アドホックなフィルタリングコードは禁止。**

```bash
node .claude/skills/github-api/scripts/filter-commits-by-path.js \
  --input /tmp/all-commits.json \
  --owner {owner} \
  --repo {repo} \
  --paths "{paths}" > /tmp/filtered-commits.json
```

`{paths}` は対象アプリの `path` をカンマ区切りで指定（例: `"app/,web/,supabase/"`）。

**スクリプトが自動で行うこと:**
- 各コミットの変更ファイルを GitHub API で取得
- 指定パスに一致するファイルがあるコミットのみ抽出
- 全コミットを確実に処理（件数制限なし）

### 4. フィルタ結果を確認

フィルタ後の `/tmp/filtered-commits.json` を使用して以降の処理を行う。

**出力形式（正規化済み）**:
```json
{
  "metadata": {
    "target_date": "2026-01-23",
    "start_utc": "2026-01-22T15:00:00Z",
    "end_utc": "2026-01-23T14:59:59Z",
    "total_branches": 35,
    "active_branches": 3,
    "total_commits": 15,
    "default_branch": "main",
    "filter_paths": ["app/", "web/", "supabase/"],
    "original_commits": 126,
    "filtered_commits": 15
  },
  "branches": {
    "main": {
      "commits": [
        {
          "sha": "abc1234",
          "message": "コミットメッセージ",
          "date": "2026-01-23T10:00:00Z",
          "author": {
            "login": "username",
            "avatar_url": "https://avatars.githubusercontent.com/u/123?v=4"
          },
          "html_url": "https://github.com/...",
          "matched_files": [
            { "filename": "app/src/Login.tsx", "status": "modified", "additions": 15, "deletions": 3 }
          ]
        }
      ],
      "is_default": true
    },
    "drill-dev": {
      "commits": [...],
      "is_default": false
    }
  }
}
```

**注意**:
- `author.login` と `author.avatar_url` は**スクリプトが保証**（jqで追加抽出不要）
- `author: null` の場合は自動的にGravatar fallbackが適用される
- そのままHTML生成に使用可能
- `target_authors` が指定されていればフィルタ（空なら全員対象）
- `matched_files` に各コミットのマッチしたファイル情報が含まれる

**⚠️ コントリビューター情報のデータ構造ルール:**

スクリプト出力の `author` オブジェクトをそのまま使用すること。
ユーザー名とアバターURLは**必ずペア（オブジェクト）として保持**。

```javascript
// ✅ 正しい: スクリプト出力をそのまま使用
const contributors = commits.map(c => c.author);
// → [{ login: "user1", avatar_url: "..." }, ...]

// ❌ 間違い: 分離して保持（絶対にやらない）
const logins = ["user1", "user2"]
const avatars = ["https://...", "https://..."]
```

### 5. ブランチの履歴とサマリーを分析

**デフォルトブランチとその他で扱いを変える：**

#### デフォルトブランチ（main等）の場合
- **「目的」は生成しない**（本番環境は目的を持たない）
- 代わりに「昨日反映された変更」として昨日のコミット内容を要約
- 累計コミット数は表示しない（意味がないため）

#### その他のブランチ（作業ブランチ）の場合
- 直近30件のコミットを取得
- 「昨日の作業内容」を**AIで1行に要約**（例: 「請求書処理フローの整理」）
- 累計コミット数、開始日（最古のコミット日）を特定

```bash
# ブランチの履歴取得（サマリー生成用）
gh api "repos/{owner}/{repo}/commits?sha={branch_name}&per_page=30"
```

### 6. コミットをアプリ別に分類
- フィルタ済みコミットの `matched_files` を使用してアプリに分類
- 対象アプリの `path` と照合してアプリに分類
- **対象外のアプリへのコミットは除外**
- **ブランチ情報は維持**（どのブランチからのコミットかを記録）

### 7. 変更内容を分析
- 各コミットの差分（patch）を取得
- **ビジネス視点で変更内容を説明**
  - 「ユーザーにとって何が変わったか」を中心に記述
  - 抽象的な表現（バグ修正、調整、改善など）は禁止
  - 具体的な内容（〇〇できるようになった、〇〇の問題を解消など）を記述

### 8. HTML図解を生成（個別に）

**重要: 各HTMLファイルを個別に生成すること。1つに統合しない。**

**必ず最初に examples を読み込む：**
```
.claude/skills/diagram-guidelines/examples/daily-summary.html  # 昨日の開発（統合版）
.claude/skills/diagram-guidelines/examples/branch-summary.html # ブランチ詳細
.claude/skills/diagram-guidelines/examples/by-app.html
.claude/skills/diagram-guidelines/examples/timeline.html
.claude/skills/diagram-guidelines/examples/tips.html
```

**生成するファイル：**

1. `/tmp/daily-summary.html` - 昨日の開発（必須・常に1枚）
   - 統計情報（コミット数、ブランチ数、コントリビューター数）
   - ハイライト（誰が何をしたか、最大4件）
     - **必須**: 各ハイライトに「誰がやったか」を表示（アバター + ユーザー名）
     - **必須**: 各ハイライトにブランチタグを表示
     - **必須**: 説明文は**40文字以内**で簡潔に（見切れ防止）
   - コントリビューター一覧

2. `/tmp/branch-summary-{branch}.html` - ブランチ詳細（各ブランチ1枚）

   **デフォルトブランチの場合：**
   - ヘッダー: ブランチ名ラベル（緑）
   - 「📥 昨日反映された変更」セクション
   - 昨日のコミット内容を箇条書きで表示
   - 累計情報は表示しない

   **その他のブランチの場合：**
   - ヘッダー: ブランチ名ラベル（青）
   - 「📝 昨日の作業内容」セクション（AI生成サマリー）
   - 統計: 累計/昨日/開発者数/経過日数
   - 昨日のハイライト（最大4件）

3. `/tmp/by-app.html` - アプリ別（必須）
   - アプリごとにセクション分け
   - 各アプリ最大5件の変更を表示 **+ ブランチタグ**

4. `/tmp/timeline.html` - タイムライン（必須）
   - 時系列で作業履歴を表示 **+ ブランチタグ**
   - 最大4件（超過分は「+N件」と表示）

5. `/tmp/tips.html` - ワンポイントTIPS（`tips.enabled: true` の場合のみ）
   - 昨日の変更に関連する豆知識を**自動判断**して生成
   - 関連する変更に**ブランチタグ**を表示
   - タイトルは `tips.title` があれば使用、なければ「ワンポイントTIPS」

   **TIPS内容の自動判断ルール：**
   - コード変更が多い場合 → **技術解説**（この機能の仕組み、アーキテクチャ説明）
   - UI/デザイン変更 → **デザインTIPS**（なぜこのUIが使いやすいか）
   - バグ修正 → **トラブルシューティング**（なぜこの問題が起きたか）
   - 新機能追加 → **機能解説**（この機能で何ができるようになったか）

   **生成のポイント：**
   - 非エンジニアにもわかりやすく
   - 簡単な図解（フロー図やイラスト）を含める
   - 「なぜこの仕組みがあるのか」を説明
   - `tips.prompt` が設定されていればその指示に従う

**ブランチタグの色分けルール：**
| 判定方法 | 背景色 | ドット色 | ラベル |
|---------|--------|---------|--------|
| デフォルトブランチ | bg-green-100 | bg-green-500 | **ブランチ名そのまま**（main等） |
| fix/* prefix | bg-orange-100 | bg-orange-500 | **ブランチ名そのまま** |
| docs/* prefix | bg-purple-100 | bg-purple-500 | **ブランチ名そのまま** |
| その他全て | bg-blue-100 | bg-blue-500 | **ブランチ名そのまま** |

**重要**: ラベルには常にブランチ名をそのまま表示する。色だけでブランチの種類を区別する。

**共通仕様：**
- サイズ: 420x650px 固定
- アプリ設定の `name`, `short_name`, `color` を使用
- アイコンはインラインSVG（Lucide互換）
- **全ページにブランチタグと凡例を含める**

**⚠️ アバター画像の注意事項（重要）：**

1. **ペアで埋め込む**: ユーザー名とアバターは**必ず同じコミット/authorオブジェクトから**取得
2. サンプルHTMLのプレースホルダーはコピーしない
3. **必ず** GitHub APIから取得した `author.avatar_url` を使用すること
4. サンプルのURLや架空のURLをコピーしない

**HTML生成時の正しいパターン:**
```html
<!-- ✅ 正しい: 同じ contributor オブジェクトから両方取得 -->
<img src="{{ contributor.avatar_url }}">
<span>{{ contributor.login }}</span>

<!-- ❌ 間違い: 別々のリストから取得（ズレる危険） -->
<img src="{{ avatars[i] }}">
<span>{{ logins[i] }}</span>
```

**禁止パターン:**
- ユーザー名リストとアバターリストを別々に作成してインデックスで組み合わせる
- ユニークなユーザー名を抽出した後、別途アバターURLを検索して紐付ける

### 9. スクリーンショットを撮影
```bash
# 昨日の開発（常に1枚）
node .claude/skills/screenshot-capture/scripts/capture.js /tmp/daily-summary.html /tmp/daily-summary.png

# ブランチ詳細（各ブランチ1枚）
node .claude/skills/screenshot-capture/scripts/capture.js /tmp/branch-summary-main.html /tmp/branch-summary-main.png
node .claude/skills/screenshot-capture/scripts/capture.js /tmp/branch-summary-feature-video.html /tmp/branch-summary-feature-video.png
# ... アクティブブランチの数だけ繰り返し

# その他のレポート
node .claude/skills/screenshot-capture/scripts/capture.js /tmp/by-app.html /tmp/by-app.png
node .claude/skills/screenshot-capture/scripts/capture.js /tmp/timeline.html /tmp/timeline.png
node .claude/skills/screenshot-capture/scripts/capture.js /tmp/tips.html /tmp/tips.png  # tips.enabled: true の場合
```

### 10. Slackに投稿（まとめて）

**⚠️ 重要: 必ず以下のスクリプトを使用すること。独自の方法で投稿しないこと。**

```bash
# 必ずこのスクリプトを使用（curlを直接使わない）
node .claude/skills/slack-formatting/scripts/post-report.js \
  --message "メッセージテキスト" \
  /tmp/daily-summary.png \
  /tmp/branch-summary-*.png \
  /tmp/by-app.png \
  /tmp/timeline.png \
  /tmp/tips.png  # tips.enabled: true の場合のみ
```

**禁止事項:**
- ❌ curlで直接Slack APIを呼び出す
- ❌ スレッドに画像を投稿する（thread_tsを使わない）
- ❌ テキストと画像を別々に投稿する
- ❌ 独自のSlack投稿ロジックを書く

**このスクリプトが行うこと:**
- ✅ 複数画像を1メッセージにまとめて投稿
- ✅ チャンネルに直接投稿（スレッドではない）
- ✅ 環境変数 `SLACK_CHANNEL` からチャンネルIDを取得
- ✅ 未設定の場合はデバッグチャンネル `YOUR_DEBUG_CHANNEL_ID` に投稿

## 注意事項

- **対象アプリ以外のコミットはレポートに含めない**
- **すべての説明はビジネス視点で記述**（技術用語を避け、ユーザー影響を中心に）

## Slack投稿に必ず含める情報

すべての投稿（コミットあり・なし両方）に以下を含めること：

1. **監視期間**: いつからいつまでのコミットを確認したか
   - 例: `期間: 2025-12-31 00:00 〜 23:59 (JST)`

2. **監視対象ディレクトリ**: どのパスを監視しているか
   - 対象アプリの `path` を一覧表示
   - 例: `監視対象: app/, web/, supabase/`

### コミットがある場合のSlackメッセージ例

```
📊 開発レポート - 昨日のコミットレポート

期間: 2025-12-31 00:00 〜 23:59 (JST)
（実行日: 2026-01-01）
対象: 3ブランチ / 15コミット / 4名

🌱 *main* - 昨日反映された変更 (5件)
🔵 *feature/video-player* - 動画プレイヤー開発 (7件)
🟠 *fix/login-issue* - ログイン問題の修正 (3件)

🐱 コミネコ で自動生成
```
+ 画像（daily-summary + 各branch-summary + by-app + timeline + tips）

### コミットがない場合の投稿例

```
📊 開発レポート - 昨日のコミットレポート

期間: 2025-12-31 00:00 〜 23:59 (JST)
（実行日: 2026-01-01）
監視対象: app/, web/, supabase/

📭 昨日のコミットはありません
上記ディレクトリへの変更はありませんでした。

🐱 コミネコ で自動生成
```

## 設定ファイルの指定方法

```bash
# レポートを生成
claude "/daily-report を configs/projects/your-project.yml で実行"
```

## トラブルシューティング・チェックリスト

**コミットが取得できない場合の確認事項:**

1. **検索期間の確認**
   - [ ] 検索開始/終了時刻がUTCで正しく計算されているか
   - [ ] JSTの「前日00:00〜23:59」が正しくUTC変換されているか
   - 例: JST 2026-01-18 00:00 → UTC 2026-01-17 15:00

2. **API呼び出しの確認**
   - [ ] `since` と `until` の両方が指定されているか
   - [ ] ブランチ名が正しいか（`sha=main` など）

3. **デバッグ方法**
   ```bash
   # 検索期間を確認
   echo "検索開始: $YESTERDAY_JST_START"
   echo "検索終了: $YESTERDAY_JST_END"

   # 取得件数を確認
   gh api "repos/{owner}/{repo}/commits?since=$YESTERDAY_JST_START&until=$YESTERDAY_JST_END" --jq 'length'
   ```

**よくあるミス:**
- `date -u` だけ使う → UTCの当日00:00になる（JSTではない）
- `since` のみ指定 → 終了時刻がないため現在時刻まで取得
- タイムゾーン未指定 → 実行環境のローカル時刻に依存

4. **ブランチ取得エラーの確認**

   スクリプトは失敗時に自動で exit 1 するため、手動確認は不要です。
   GitHub Actionsでは失敗として記録され、ワークフローを再実行できます。

   **自動リカバリの仕組み:**
   1. 各ブランチ取得: 最大3回リトライ（指数バックオフ）
   2. 失敗ブランチ: 10秒後にまとめて再試行
   3. それでも失敗: exit 1 で処理中断

   **対処法:**
   - GitHub API レート制限 → 時間を空けてワークフロー再実行
   - ネットワークエラー → ワークフロー再実行（自動リカバリで解決する場合が多い）
   - 継続的に失敗 → GitHub Statusページでサービス状態を確認
