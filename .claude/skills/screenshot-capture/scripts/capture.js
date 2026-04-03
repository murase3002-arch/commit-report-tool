#!/usr/bin/env node
/**
 * Screenshot Capture Script
 *
 * HTMLファイルをPNG画像に変換します。
 * - Retina対応 (2x)
 * - コンテンツサイズに自動フィット（余白なし）
 * - GitHub Actions対応（Headless）
 *
 * Usage: node capture.js <input.html> <output.png>
 */

const { chromium } = require('playwright');
const path = require('path');

// 設定
const CONFIG = {
  scale: parseInt(process.env.SCREENSHOT_SCALE || '2', 10),
  width: parseInt(process.env.SCREENSHOT_WIDTH || '450', 10),
  wait: parseInt(process.env.SCREENSHOT_WAIT || '500', 10),
};

async function capture(inputPath, outputPath) {
  // 入力パスをfile:// URLに変換
  const fileUrl = inputPath.startsWith('file://')
    ? inputPath
    : `file://${path.resolve(inputPath)}`;

  console.log(`Capturing: ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Scale: ${CONFIG.scale}x, Width: ${CONFIG.width}px`);

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    // 高解像度コンテキストを作成
    const context = await browser.newContext({
      deviceScaleFactor: CONFIG.scale,
      viewport: { width: CONFIG.width, height: 800 }, // 初期高さ（後で調整）
    });

    const page = await context.newPage();
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(CONFIG.wait);

    // コンテンツの実際の高さを取得
    const contentHeight = await page.evaluate(() => {
      // body直下の最初のdivを探す（通常はメインコンテナ）
      const container = document.body.firstElementChild;
      if (container) {
        const rect = container.getBoundingClientRect();
        // パディングを考慮
        const style = window.getComputedStyle(document.body);
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        return Math.ceil(rect.height + paddingTop + paddingBottom);
      }
      // フォールバック: body全体の高さ
      return document.body.scrollHeight;
    });

    console.log(`Content height: ${contentHeight}px`);

    // ビューポートをコンテンツサイズに合わせる
    await page.setViewportSize({
      width: CONFIG.width,
      height: contentHeight
    });
    await page.waitForTimeout(100); // レイアウト安定化

    // スクリーンショット撮影（fullPageではなくビューポートのみ）
    await page.screenshot({
      path: outputPath,
      type: 'png',
      // fullPage: false がデフォルト
    });

    console.log(`Done! Saved to ${outputPath}`);

    await context.close();
  } finally {
    await browser.close();
  }
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node capture.js <input.html> <output.png>');
    console.error('');
    console.error('Environment variables:');
    console.error('  SCREENSHOT_SCALE  - Device pixel ratio (default: 2)');
    console.error('  SCREENSHOT_WIDTH  - Viewport width (default: 450)');
    console.error('  SCREENSHOT_WAIT   - Wait time in ms (default: 500)');
    process.exit(1);
  }

  const [inputPath, outputPath] = args;

  try {
    await capture(inputPath, outputPath);
  } catch (error) {
    console.error('Error:', error.message);

    if (error.message.includes('Executable doesn\'t exist')) {
      console.error('');
      console.error('Chromium is not installed. Run:');
      console.error('  npx playwright install chromium');
    }

    process.exit(1);
  }
}

main();
