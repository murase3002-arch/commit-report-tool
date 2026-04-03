#!/usr/bin/env node
/**
 * 前日(JST)のコミットを確実に取得するスクリプト
 *
 * 使い方:
 *   node get-commits.js <owner> <repo> [branch]
 *
 * 環境変数:
 *   GH_TOKEN: GitHub API認証トークン
 *   TARGET_DATE: 対象日（省略時は前日JST）形式: YYYY-MM-DD
 *
 * 出力:
 *   正規化されたJSONを標準出力に出力（jq処理不要）
 *   - sha, message, date, author.login, author.avatar_url, html_url を保証
 */

const { execSync } = require('child_process');
const { normalizeCommits } = require('./lib/normalize');
const { getYesterdayJST, getTargetDateJST } = require('./lib/date-utils');

// メイン処理
function main() {
  const [owner, repo, branch = 'main'] = process.argv.slice(2);

  if (!owner || !repo) {
    console.error('Usage: node get-commits.js <owner> <repo> [branch]');
    console.error('');
    console.error('Environment variables:');
    console.error('  GH_TOKEN: GitHub API token (required)');
    console.error('  TARGET_DATE: Target date in YYYY-MM-DD format (optional, defaults to yesterday JST)');
    process.exit(1);
  }

  // 日付計算
  const targetDate = process.env.TARGET_DATE;
  const { date, startUTC, endUTC } = targetDate
    ? getTargetDateJST(targetDate)
    : getYesterdayJST();

  // ログ出力（デバッグ用、標準エラーへ）
  console.error('=== 検索期間 ===');
  console.error(`対象日(JST): ${date}`);
  console.error(`開始(UTC): ${startUTC}`);
  console.error(`終了(UTC): ${endUTC}`);
  console.error(`ブランチ: ${branch}`);
  console.error('================');

  // gh API呼び出し
  const cmd = `gh api "repos/${owner}/${repo}/commits?sha=${branch}&since=${startUTC}&until=${endUTC}" --paginate`;

  try {
    const rawResult = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    const rawCommits = JSON.parse(rawResult);
    const normalized = normalizeCommits(rawCommits);
    // 正規化されたJSON出力（標準出力）
    console.log(JSON.stringify(normalized, null, 2));
  } catch (error) {
    console.error('API呼び出しエラー:', error.message);
    process.exit(1);
  }
}

main();
