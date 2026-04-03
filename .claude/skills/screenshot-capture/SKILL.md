---
name: screenshot-capture
description: HTMLファイルのスクリーンショット撮影。図解をPNG化するときに使用。
---

# Screenshot Capture

HTMLファイルをPNG画像に変換するスキルです。

## 使い方

```bash
node .claude/skills/screenshot-capture/scripts/capture.js <input.html> <output.png>
```

### 例

```bash
# 単一ファイル
node .claude/skills/screenshot-capture/scripts/capture.js /tmp/diagram.html /tmp/diagram.png

# 複数ファイル
node .claude/skills/screenshot-capture/scripts/capture.js /tmp/summary.html /tmp/summary.png
node .claude/skills/screenshot-capture/scripts/capture.js /tmp/timeline.html /tmp/timeline.png
```

## 特徴

- **Retina対応**: deviceScaleFactor: 2 で高解像度
- **余白なし**: コンテンツサイズに自動フィット
- **Headless対応**: GitHub Actions でも動作

## 依存関係

初回実行時に自動インストールされます：

```bash
npm install playwright
npx playwright install chromium
```

## オプション

環境変数で動作を制御できます：

| 環境変数 | デフォルト | 説明 |
|----------|------------|------|
| `SCREENSHOT_SCALE` | `2` | デバイスピクセル比 |
| `SCREENSHOT_WIDTH` | `450` | ビューポート幅 |
| `SCREENSHOT_WAIT` | `500` | 読み込み待機時間(ms) |

## GitHub Actions での使用

```yaml
- name: Take screenshots
  run: |
    npm install playwright
    npx playwright install chromium
    node .claude/skills/screenshot-capture/scripts/capture.js /tmp/report.html /tmp/report.png
```

## トラブルシューティング

### Chromiumがインストールされていない

```bash
npx playwright install chromium
```

### フォントが表示されない (GitHub Actions)

```yaml
- name: Install fonts
  run: sudo apt-get install -y fonts-noto-cjk
```
