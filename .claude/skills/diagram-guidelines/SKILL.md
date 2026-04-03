---
name: diagram-guidelines
description: HTML図解のデザインガイドライン。図解を作成するときに参照。
---

# 図解デザインガイドライン

コミット情報をHTML図解に変換する際のデザイン基準です。

## 必須手順（最重要）

**図解生成の前に、以下のファイルを必ず読み込んでください：**

```
.claude/skills/diagram-guidelines/examples/daily-summary.html  # 今日の開発（統合版）
.claude/skills/diagram-guidelines/examples/branch-summary.html # ブランチ詳細
.claude/skills/diagram-guidelines/examples/by-app.html
.claude/skills/diagram-guidelines/examples/timeline.html
.claude/skills/diagram-guidelines/examples/tips.html
```

これらのexamplesと**同じデザインパターン**で生成してください。自己流で作らないこと。

## サイズ仕様（固定）

| 項目 | 値 |
|------|-----|
| **幅** | 420px 固定 |
| **高さ** | 600px 固定 |
| **スクリーンショット** | 840 x 1200px（Retina 2x） |

コンテンツが収まらない場合は、項目数を減らすか複数枚に分割してください。

## 出力ファイル構成（5種類）

| ファイル | 名称 | 役割 |
|----------|------|------|
| **daily-summary.html** | 今日の開発 | 統計情報 + ハイライト（誰が何をしたか、最大4件） |
| **branch-summary.html** | ブランチ詳細 | デフォルトブランチ: 今日反映された変更 / その他: 今日の作業内容 |
| by-app.html | アプリ別 | アプリごとの変更一覧（最大5件/アプリ）、ブランチタグ付き |
| timeline.html | タイムライン | 時系列での作業履歴（**最大4件**）、ブランチタグ付き |
| tips.html | ワンポイントTIPS | 今日の変更に関連する豆知識（設定で有効時のみ）、ブランチタグ付き |

**ページ分割ルール:**
- コンテンツが多い場合は `by-app-1.html`, `by-app-2.html` のように分割
- タイムラインは4件を超えるとフッターが見切れるため、残りは「+N more commits」で表示
- TIPSはプロジェクト設定の `tips.enabled` が `true` の場合のみ生成

## ブランチタグ（全ページ共通）

すべてのコミット/ハイライト項目には**ブランチタグ**を表示します。

### ブランチの分類

**重要**: ブランチ名の prefix（feature/、fix/等）ではなく、**デフォルトブランチかどうか**で判断します。

```bash
# デフォルトブランチの取得
DEFAULT_BRANCH=$(gh api repos/{owner}/{repo} --jq '.default_branch')
```

### ブランチタグの色分け

| 判定方法 | 背景色 | テキスト色 | ドット色 |
|---------|--------|-----------|---------|
| デフォルトブランチ | bg-green-100 | text-green-600/700 | bg-green-500 |
| fix/* prefix | bg-orange-100 | text-orange-600/700 | bg-orange-500 |
| docs/* prefix | bg-purple-100 | text-purple-600/700 | bg-purple-500 |
| その他全て | bg-blue-100 | text-blue-600/700 | bg-blue-500 |

**重要**: ラベルは常に**ブランチ名をそのまま表示**する（main, feature/xxx, fix/xxx等）。色だけで種類を区別する。

### ブランチタグのHTML

```html
<!-- インライン版（コンパクト） -->
<div class="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 rounded text-xs text-blue-600">
  <div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
  <span>feature/video</span>
</div>

<!-- ブランチ名が長い場合は短縮 -->
<!-- feature/video-player → feature/video -->
<!-- fix/login-session-timeout → fix/login -->
```

### フッターの凡例

すべてのページに**ブランチ凡例**を含めます（色のみで区別）：

```html
<div class="flex gap-3">
  <span class="flex items-center gap-1 text-xs text-green-600">
    <span class="w-2 h-2 rounded-full bg-green-500"></span>デフォルト
  </span>
  <span class="flex items-center gap-1 text-xs text-blue-600">
    <span class="w-2 h-2 rounded-full bg-blue-500"></span>作業
  </span>
  <span class="flex items-center gap-1 text-xs text-orange-600">
    <span class="w-2 h-2 rounded-full bg-orange-500"></span>fix
  </span>
</div>
```

※ 凡例は「色の意味」を示すもの。実際のタグにはブランチ名を表示する。

## ビジネス視点での記述

**重要**: すべての説明は「ユーザーにとって何が変わったか」を中心に記述します。

### 禁止表現と置き換え

| 禁止 | 代わりに書くべき内容 |
|------|----------------------|
| バグ修正 | 〇〇できなかった問題を解消 |
| 調整 | 〇〇が見やすく/使いやすくなった |
| 改善 | 〇〇が速く/簡単になった |
| 対応 | 〇〇できるようになった |
| リファクタリング | 〇〇の動作が安定した |

詳細は **code-analyzer** スキルを参照してください。

## 技術スタック

- **Tailwind CSS**: CDN版を使用 `<script src="https://cdn.tailwindcss.com"></script>`
- **shadcn/ui風デザイン**: slate系カラー、rounded-lg、shadow-sm
- **アイコン**: インラインSVG（Lucide互換）を使用、絵文字は使わない
- **GitHubアバター**: `https://avatars.githubusercontent.com/u/{user_id}?v=4`

## 基本レイアウト

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>レポート</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif; }
  </style>
</head>
<body class="bg-white p-4">
  <div class="w-[420px] h-[600px] mx-auto flex flex-col">
    <!-- コンテンツ -->
  </div>
</body>
</html>
```

**重要**:
- 幅 `420px`、高さ `600px` 固定
- `flex flex-col` でコンテンツを配置
- `min-height: 100vh` は使わない

## カラーパレット（shadcn/ui準拠）

| 用途 | Tailwindクラス |
|------|----------------|
| 背景 | bg-white, bg-slate-50 |
| テキスト（メイン） | text-slate-900 |
| テキスト（サブ） | text-slate-500, text-slate-400 |
| ボーダー | border-slate-200 |
| アクセント（青） | bg-blue-500, text-blue-600 |
| アクセント（紫） | bg-purple-500, text-purple-600 |
| アクセント（緑） | bg-emerald-500, text-emerald-600 |
| アクセント（オレンジ/ハイライト） | bg-amber-500, text-amber-600 |

## コンポーネント

### ヘッダー（共通）

```html
<div class="flex items-center justify-between mb-4">
  <div class="flex items-center gap-2">
    <div class="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
      <!-- GitHubロゴSVG -->
    </div>
    <div>
      <h1 class="text-base font-semibold text-slate-900">タイトル</h1>
      <p class="text-xs text-slate-500">リポジトリ名</p>
    </div>
  </div>
  <div class="text-sm font-medium text-slate-700">12/25 - 26</div>
</div>
```

### 統計バー（サマリー用）

```html
<div class="flex items-center justify-center gap-6 py-3 mb-4 bg-slate-50 rounded-lg">
  <div class="text-center">
    <div class="text-xl font-bold text-slate-900">10</div>
    <div class="text-xs text-slate-500">commits</div>
  </div>
  <div class="w-px h-8 bg-slate-200"></div>
  <div class="text-center">
    <div class="text-xl font-bold text-slate-900">4</div>
    <div class="text-xs text-slate-500">contributors</div>
  </div>
</div>
```

### ハイライトアイテム（サマリー用）

```html
<div class="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
  <div class="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0"></div>
  <div class="text-sm text-slate-800">動画を途中から再生できるようになった</div>
</div>
```

### アプリ別セクション（by-app用）

```html
<div class="mb-4">
  <div class="flex items-center gap-2 mb-3">
    <div class="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center">
      <!-- アプリアイコン -->
    </div>
    <div class="text-sm font-semibold text-slate-900">アプリ名</div>
    <div class="text-xs text-slate-400">(path/)</div>
    <div class="flex-1 h-px bg-slate-200 ml-2"></div>
  </div>

  <div class="space-y-2 pl-2">
    <!-- 変更アイテム -->
  </div>
</div>
```

### 変更アイテム（by-app用）

```html
<div class="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
  <div class="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
  <div>
    <div class="text-sm text-slate-800">動画を途中から再生できるようになった</div>
    <div class="text-xs text-slate-500 mt-1">補足説明</div>
  </div>
</div>
```

### タイムラインアイテム（timeline用）

```html
<div class="relative pl-6">
  <div class="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white"></div>
  <div class="bg-slate-50 rounded-lg p-3 border border-slate-100">
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-2">
        <img src="avatar_url" class="w-5 h-5 rounded-full" alt="">
        <span class="text-xs font-medium text-slate-700">username</span>
      </div>
      <span class="text-xs text-slate-400">12/26 12:01</span>
    </div>
    <div class="text-sm text-slate-800">変更内容</div>
    <div class="flex items-center gap-1.5 mt-2">
      <div class="w-2 h-2 rounded bg-blue-500"></div>
      <span class="text-xs text-slate-400">アプリ名</span>
    </div>
  </div>
</div>
```

### フッター（共通）

```html
<div class="border-t border-slate-200 pt-3">
  <div class="flex items-center justify-between">
    <div class="flex -space-x-2">
      <img src="avatar1" class="w-5 h-5 rounded-full border-2 border-white" alt="">
      <img src="avatar2" class="w-5 h-5 rounded-full border-2 border-white" alt="">
    </div>
    <div class="text-xs text-slate-400">Generated by Claude Code</div>
  </div>
</div>
```

### ワンポイントTIPS（tips用）

TIPSは以下の構成で生成する：

1. **ヘッダー**: 電球アイコン + タイトル（設定の `tips.title` を使用）
2. **関連する変更**: どの変更に関連するTIPSか
3. **トピックタイトル**: 解説するテーマ
4. **図解**: 簡単なフロー図やイラスト（bg-slate-50の中にボックスを並べる）
5. **解説テキスト**: わかりやすい説明
6. **今回の修正**: このTIPSと今日の変更の関連
7. **フッター**: カテゴリラベル + Generated by Claude Code

**レイアウト制約（重要）:**
- **図解は3ステップまで**に収める（4ステップ以上は見切れる原因）
- 各要素の margin/padding を小さめに（mb-3, p-2.5 など）
- 解説テキストは2段落以内に
- 600px内に収まるか確認してからスクリーンショット

TIPSの内容はプロジェクト設定の `tips.prompt` に従って生成する（省略時は変更内容から自動判断）。

## よく使うアイコン（インラインSVG）

### GitHubロゴ
```html
<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
</svg>
```

### スター（ハイライト）
```html
<svg class="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
</svg>
```

### スマートフォン（モバイルアプリ）
```html
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
</svg>
```

### パズル（ツール/プラグイン）
```html
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
  <path stroke-linecap="round" stroke-linejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"/>
</svg>
```

## スクリーンショット撮影

**screenshot-capture** スキルのスクリプトを使用：

```bash
node .claude/skills/screenshot-capture/scripts/capture.js input.html output.png
```

出力サイズ: 840 x 1200px（Retina 2x）

## 注意事項

- 絵文字は使用しない（プロフェッショナルなアイコンを使用）
- GitHubアバターを積極的に使用
- モノレポの場合は必ずアプリ別にグループ化
- 日本語で説明文を記述
- **すべての説明はビジネス視点で記述**
- "Generated by Claude Code" をフッターに含める
