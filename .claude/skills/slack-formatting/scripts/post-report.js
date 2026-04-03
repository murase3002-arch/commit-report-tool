#!/usr/bin/env node
/**
 * Slack レポート投稿スクリプト
 *
 * 複数の画像を1メッセージにまとめてSlackチャンネルに投稿します。
 * ※スレッドではなく、チャンネルに直接投稿します
 *
 * Required Environment Variables:
 *   SLACK_BOT_TOKEN - Bot User OAuth Token (xoxb-...)
 *   SLACK_CHANNEL   - Channel ID (C...)
 *
 * Usage:
 *   node post-report.js --message "テキスト" <image1.png> <image2.png> ...
 *
 * Example:
 *   node post-report.js --message "📊 今日のレポート" \
 *     /tmp/daily-summary.png /tmp/by-app.png /tmp/timeline.png
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 環境変数（SLACK_CHANNEL または SLACK_CHANNEL_ID をサポート）
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL_ID = process.env.SLACK_CHANNEL || process.env.SLACK_CHANNEL_ID;
const DEBUG_CHANNEL = 'YOUR_DEBUG_CHANNEL_ID';

// ========================================
// ログ出力（原因特定用）
// ========================================
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function logSection(title) {
  console.log('');
  console.log('========================================');
  console.log(`=== ${title} ===`);
  console.log('========================================');
}

// ========================================
// HTTPS リクエスト
// ========================================
function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ ok: false, error: 'parse_error', raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData, 'utf8');
    req.end();
  });
}

// ========================================
// Slack API 関数
// ========================================
async function getUploadUrl(filename, fileSize) {
  const params = new URLSearchParams({
    filename,
    length: fileSize.toString()
  });

  return await httpsRequest({
    hostname: 'slack.com',
    path: '/api/files.getUploadURLExternal',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }, params.toString());
}

async function uploadFile(uploadUrl, filePath) {
  const fileContent = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(header, 'utf-8'),
    fileContent,
    Buffer.from(footer, 'utf-8')
  ]);

  const url = new URL(uploadUrl);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function completeUpload(fileIds, message, channelId) {
  const files = fileIds.map(id => ({ id }));

  const body = JSON.stringify({
    files,
    channel_id: channelId,
    initial_comment: message || ''
  });

  return await httpsRequest({
    hostname: 'slack.com',
    path: '/api/files.completeUploadExternal',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
}

// ========================================
// メイン処理
// ========================================
async function postReport(imagePaths, message) {
  const channelId = CHANNEL_ID || DEBUG_CHANNEL;

  logSection('SLACK投稿開始');
  log(`投稿先チャンネル: ${channelId}`);
  log(`画像数: ${imagePaths.length}`);
  log(`メッセージ: ${message.length > 50 ? message.substring(0, 50) + '...' : message}`);

  // 画像一覧を表示
  imagePaths.forEach((p, i) => {
    log(`  [${i + 1}] ${path.basename(p)}`);
  });

  const fileIds = [];

  // 各画像をアップロード
  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    const filename = path.basename(imagePath);
    const fileSize = fs.statSync(imagePath).size;

    log(`アップロード中: ${filename} (${Math.round(fileSize / 1024)}KB)`);

    // Step 1: Get upload URL
    const urlResponse = await getUploadUrl(filename, fileSize);
    if (!urlResponse.ok) {
      log(`  エラー: ${urlResponse.error}`);
      continue;
    }

    // Step 2: Upload file
    await uploadFile(urlResponse.upload_url, imagePath);
    log(`  完了: ${urlResponse.file_id}`);

    fileIds.push(urlResponse.file_id);
  }

  if (fileIds.length === 0) {
    logSection('SLACK投稿エラー');
    log('アップロードされたファイルがありません');
    return { ok: false, error: 'no_files_uploaded' };
  }

  // Step 3: Complete upload (posts all files at once to channel, NOT thread)
  log('');
  log('チャンネルに投稿中...');
  const result = await completeUpload(fileIds, message, channelId);

  if (result.ok) {
    logSection('SLACK投稿完了');
    log(`チャンネル: ${channelId}`);
    log(`画像数: ${fileIds.length}`);
    log('✅ 投稿成功！');
  } else {
    logSection('SLACK投稿エラー');
    log(`エラー: ${result.error}`);
    if (result.raw) log(`詳細: ${result.raw}`);
  }

  return result;
}

async function main() {
  // 環境変数チェック
  if (!SLACK_TOKEN) {
    console.error('エラー: SLACK_BOT_TOKEN 環境変数が必要です');
    process.exit(1);
  }

  if (!CHANNEL_ID) {
    log(`警告: SLACK_CHANNEL が未設定のため、デバッグチャンネル (${DEBUG_CHANNEL}) に投稿します`);
  }

  // 引数パース
  const args = process.argv.slice(2);
  let message = '';
  const imagePaths = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--message' || args[i] === '-m') {
      message = args[++i] || '';
    } else if (args[i].startsWith('-')) {
      console.error(`不明なオプション: ${args[i]}`);
      process.exit(1);
    } else {
      imagePaths.push(args[i]);
    }
  }

  // 使い方表示
  if (imagePaths.length === 0) {
    console.error('使い方: node post-report.js --message "テキスト" <image1.png> ...');
    console.error('');
    console.error('必須環境変数:');
    console.error('  SLACK_BOT_TOKEN - Bot OAuth Token');
    console.error('  SLACK_CHANNEL   - チャンネルID');
    process.exit(1);
  }

  // ファイル存在確認
  const missingFiles = imagePaths.filter(p => !fs.existsSync(p));
  if (missingFiles.length > 0) {
    console.error('ファイルが見つかりません:');
    missingFiles.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }

  // 投稿実行
  const result = await postReport(imagePaths, message);
  process.exit(result.ok ? 0 : 1);
}

main();
