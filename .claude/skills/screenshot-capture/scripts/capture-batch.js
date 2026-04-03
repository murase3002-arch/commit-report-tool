#!/usr/bin/env node
/**
 * Batch Screenshot Capture Script
 *
 * 複数のHTMLファイルを一括でPNG化します。
 *
 * Usage: node capture-batch.js <file1.html:output1.png> <file2.html:output2.png> ...
 *
 * Example:
 *   node capture-batch.js \
 *     /tmp/summary.html:/tmp/summary.png \
 *     /tmp/timeline.html:/tmp/timeline.png \
 *     /tmp/commits.html:/tmp/commits.png
 */

const { chromium } = require('playwright');
const path = require('path');

// 設定
const CONFIG = {
  scale: parseInt(process.env.SCREENSHOT_SCALE || '2', 10),
  width: parseInt(process.env.SCREENSHOT_WIDTH || '450', 10),
  wait: parseInt(process.env.SCREENSHOT_WAIT || '500', 10),
};

async function captureAll(files) {
  console.log(`Capturing ${files.length} files...`);
  console.log(`Scale: ${CONFIG.scale}x, Width: ${CONFIG.width}px`);
  console.log('');

  const browser = await chromium.launch({ headless: true });

  try {
    // 高解像度コンテキストを作成（ブラウザは1つを再利用）
    const context = await browser.newContext({
      deviceScaleFactor: CONFIG.scale,
      viewport: { width: CONFIG.width, height: 800 },
    });

    const results = [];

    for (const { input, output } of files) {
      const page = await context.newPage();

      try {
        const fileUrl = input.startsWith('file://')
          ? input
          : `file://${path.resolve(input)}`;

        console.log(`[${results.length + 1}/${files.length}] ${path.basename(input)}`);

        await page.goto(fileUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(CONFIG.wait);

        // コンテンツの高さを取得
        const contentHeight = await page.evaluate(() => {
          const container = document.body.firstElementChild;
          if (container) {
            const rect = container.getBoundingClientRect();
            const style = window.getComputedStyle(document.body);
            const paddingTop = parseFloat(style.paddingTop) || 0;
            const paddingBottom = parseFloat(style.paddingBottom) || 0;
            return Math.ceil(rect.height + paddingTop + paddingBottom);
          }
          return document.body.scrollHeight;
        });

        // ビューポートをコンテンツサイズに合わせる
        await page.setViewportSize({
          width: CONFIG.width,
          height: contentHeight
        });
        await page.waitForTimeout(100);

        // スクリーンショット撮影
        await page.screenshot({ path: output, type: 'png' });

        results.push({ input, output, success: true, height: contentHeight });
        console.log(`   -> ${output} (${contentHeight}px)`);

      } catch (error) {
        results.push({ input, output, success: false, error: error.message });
        console.error(`   -> Error: ${error.message}`);
      } finally {
        await page.close();
      }
    }

    await context.close();
    return results;

  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node capture-batch.js <input.html:output.png> ...');
    console.error('');
    console.error('Example:');
    console.error('  node capture-batch.js \\');
    console.error('    /tmp/summary.html:/tmp/summary.png \\');
    console.error('    /tmp/timeline.html:/tmp/timeline.png');
    process.exit(1);
  }

  // 引数をパース
  const files = args.map(arg => {
    const [input, output] = arg.split(':');
    if (!input || !output) {
      console.error(`Invalid argument: ${arg}`);
      console.error('Format should be: input.html:output.png');
      process.exit(1);
    }
    return { input, output };
  });

  try {
    const results = await captureAll(files);

    console.log('');
    console.log('Summary:');
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`  Success: ${success}, Failed: ${failed}`);

    // 結果をJSON出力（パイプ処理用）
    if (process.env.OUTPUT_JSON === '1') {
      console.log(JSON.stringify(results));
    }

    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
