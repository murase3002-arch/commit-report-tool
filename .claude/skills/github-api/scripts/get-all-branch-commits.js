#!/usr/bin/env node
/**
 * 全ブランチの前日(JST)コミットを一括取得するスクリプト
 *
 * 最適化: GraphQLで最近アクティブなブランチのみを抽出してからコミット取得
 *
 * 使い方:
 *   node get-all-branch-commits.js <owner> <repo> [--output <file>]
 *
 * 環境変数:
 *   GH_TOKEN: GitHub API認証トークン
 *   TARGET_DATE: 対象日（省略時は前日JST）形式: YYYY-MM-DD
 *   ACTIVE_DAYS: アクティブとみなす日数（省略時は7日）
 *
 * 出力:
 *   全ブランチのコミットをJSON形式で出力
 *   --output 指定時はファイルに書き込み（シェルリダイレクトより確実）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const { normalizeCommits } = require('./lib/normalize');
const { getYesterdayJST, getTargetDateJST } = require('./lib/date-utils');

// 除外するブランチのプレフィックス
const EXCLUDED_PREFIXES = ['dependabot/', 'renovate/'];

// GraphQLでブランチ一覧と最終コミット日を取得（ページネーション対応）
function getAllBranchesWithDates(owner, repo) {
  const allBranches = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `
    {
      repository(owner: "${owner}", name: "${repo}") {
        defaultBranchRef {
          name
        }
        refs(refPrefix: "refs/heads/", first: 100${afterClause}) {
          nodes {
            name
            target {
              ... on Commit {
                committedDate
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`;

    try {
      const result = execSync(
        `gh api graphql -f query='${query.replace(/'/g, "'\\''")}'`,
        { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
      );
      const data = JSON.parse(result);
      const refs = data.data.repository.refs;
      const defaultBranch = data.data.repository.defaultBranchRef?.name || 'main';

      for (const node of refs.nodes) {
        if (!EXCLUDED_PREFIXES.some(prefix => node.name.startsWith(prefix))) {
          allBranches.push({
            name: node.name,
            lastCommitDate: node.target?.committedDate || null,
            isDefault: node.name === defaultBranch
          });
        }
      }

      hasNextPage = refs.pageInfo.hasNextPage;
      cursor = refs.pageInfo.endCursor;
    } catch (error) {
      console.error('GraphQLエラー:', error.message);
      process.exit(1);
    }
  }

  return allBranches;
}

// 特定ブランチのコミットを取得（リトライ機能付き）
function getBranchCommits(owner, repo, branch, startUTC, endUTC, maxRetries = 3) {
  const cmd = `gh api "repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&since=${startUTC}&until=${endUTC}" --paginate`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const rawResult = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
      const rawCommits = JSON.parse(rawResult);
      return { success: true, commits: normalizeCommits(rawCommits) };
    } catch (error) {
      const errorMsg = error.message.split('\n')[0];
      if (attempt < maxRetries) {
        console.error(`[${branch}] リトライ ${attempt}/${maxRetries}: ${errorMsg}`);
        const waitMs = Math.pow(2, attempt - 1) * 1000;
        execSync(`sleep ${waitMs / 1000}`);
      } else {
        console.error(`[${branch}] ⚠️ 取得失敗（${maxRetries}回リトライ後）: ${errorMsg}`);
        return { success: false, commits: [], error: errorMsg };
      }
    }
  }
  return { success: false, commits: [], error: 'Unknown error' };
}

// アクティブブランチをフィルタリング
function filterActiveBranches(allBranches, activeDays, targetDateStr) {
  const targetDate = new Date(targetDateStr);
  const cutoffDate = new Date(targetDate);
  cutoffDate.setDate(cutoffDate.getDate() - activeDays);
  const cutoffStr = cutoffDate.toISOString();

  return allBranches.filter(branch => {
    // デフォルトブランチは常に含める
    if (branch.isDefault) return true;
    // 最終コミット日がない場合はスキップ
    if (!branch.lastCommitDate) return false;
    // 最終コミット日がカットオフ以降なら含める
    return branch.lastCommitDate >= cutoffStr;
  });
}

// 引数パース
function parseArgs() {
  const args = process.argv.slice(2);
  let owner = null;
  let repo = null;
  let outputFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputFile = args[++i];
    } else if (!owner) {
      owner = args[i];
    } else if (!repo) {
      repo = args[i];
    }
  }

  return { owner, repo, outputFile };
}

// メイン処理
function main() {
  const { owner, repo, outputFile } = parseArgs();

  if (!owner || !repo) {
    console.error('Usage: node get-all-branch-commits.js <owner> <repo> [--output <file>]');
    console.error('');
    console.error('Options:');
    console.error('  --output, -o <file>  Write JSON to file instead of stdout (recommended)');
    console.error('');
    console.error('Environment variables:');
    console.error('  GH_TOKEN: GitHub API token (required)');
    console.error('  TARGET_DATE: Target date in YYYY-MM-DD format (optional, defaults to yesterday JST)');
    console.error('  ACTIVE_DAYS: Days to consider a branch active (optional, defaults to 7)');
    process.exit(1);
  }

  // 日付計算
  const targetDate = process.env.TARGET_DATE;
  const activeDays = parseInt(process.env.ACTIVE_DAYS || '7', 10);
  const { date, startUTC, endUTC } = targetDate
    ? getTargetDateJST(targetDate)
    : getYesterdayJST();

  console.error('=== 全ブランチコミット取得（最適化版） ===');
  console.error(`対象日(JST): ${date}`);
  console.error(`開始(UTC): ${startUTC}`);
  console.error(`終了(UTC): ${endUTC}`);
  console.error(`アクティブ判定: 過去${activeDays}日以内`);
  console.error('==========================================');

  // ステップ1: GraphQLで全ブランチと最終コミット日を取得
  console.error('');
  console.error('[ステップ1] GraphQLでブランチ一覧を取得中...');
  const allBranches = getAllBranchesWithDates(owner, repo);
  const defaultBranch = allBranches.find(b => b.isDefault)?.name || 'main';
  console.error(`総ブランチ数: ${allBranches.length}`);
  console.error(`デフォルトブランチ: ${defaultBranch}`);

  // ステップ2: アクティブブランチをフィルタリング
  console.error('');
  console.error('[ステップ2] アクティブブランチをフィルタリング...');
  const activeBranches = filterActiveBranches(allBranches, activeDays, date);
  console.error(`アクティブブランチ: ${activeBranches.length}件（${allBranches.length}件中）`);
  activeBranches.forEach(b => {
    const marker = b.isDefault ? '(default)' : '';
    console.error(`  - ${b.name} ${marker}`);
  });

  // ステップ3: アクティブブランチのコミットを取得
  console.error('');
  console.error('[ステップ3] コミットを取得中...');
  const branches = {};
  let activeBranchCount = 0;
  let totalCommits = 0;
  let failedBranches = [];

  for (let i = 0; i < activeBranches.length; i++) {
    const branch = activeBranches[i];
    console.error(`[${i + 1}/${activeBranches.length}] [${branch.name}] コミット取得中...`);
    const result = getBranchCommits(owner, repo, branch.name, startUTC, endUTC);

    if (!result.success) {
      failedBranches.push({ name: branch.name, error: result.error });
    }

    if (result.commits.length > 0) {
      branches[branch.name] = {
        commits: result.commits,
        is_default: branch.isDefault
      };
      activeBranchCount++;
      totalCommits += result.commits.length;
      console.error(`[${branch.name}] ${result.commits.length}件のコミットを検出`);
    }
  }

  // 失敗したブランチがあれば、10秒待ってから再試行
  if (failedBranches.length > 0) {
    console.error('');
    console.error(`=== 失敗ブランチの再取得 (${failedBranches.length}件) ===`);
    console.error('10秒待機してから再試行...');
    execSync('sleep 10');

    const stillFailed = [];
    for (let i = 0; i < failedBranches.length; i++) {
      const branchName = failedBranches[i].name;
      const branchInfo = activeBranches.find(b => b.name === branchName);
      console.error(`[再試行 ${i + 1}/${failedBranches.length}] [${branchName}] コミット取得中...`);
      const result = getBranchCommits(owner, repo, branchName, startUTC, endUTC);

      if (!result.success) {
        stillFailed.push({ name: branchName, error: result.error });
      } else if (result.commits.length > 0) {
        branches[branchName] = {
          commits: result.commits,
          is_default: branchInfo?.isDefault || false
        };
        activeBranchCount++;
        totalCommits += result.commits.length;
        console.error(`[${branchName}] ✅ 再取得成功: ${result.commits.length}件のコミット`);
      } else {
        console.error(`[${branchName}] ✅ 再取得成功: コミットなし`);
      }
    }

    failedBranches = stillFailed;
    console.error(`再取得完了: 残り失敗 ${failedBranches.length}件`);
  }

  // 結果を出力
  const result = {
    metadata: {
      target_date: date,
      start_utc: startUTC,
      end_utc: endUTC,
      total_branches: allBranches.length,
      checked_branches: activeBranches.length,
      active_branches: activeBranchCount,
      total_commits: totalCommits,
      default_branch: defaultBranch,
      active_days_filter: activeDays,
      failed_branches: failedBranches.length,
      has_errors: failedBranches.length > 0
    },
    branches: branches
  };

  if (failedBranches.length > 0) {
    result.errors = failedBranches;
  }

  console.error('');
  console.error(`=== 結果 ===`);
  console.error(`総ブランチ: ${allBranches.length}`);
  console.error(`チェック対象: ${activeBranches.length}（最適化で${Math.round((1 - activeBranches.length / allBranches.length) * 100)}%削減）`);
  console.error(`コミットあり: ${activeBranchCount}`);
  console.error(`総コミット数: ${totalCommits}`);
  if (failedBranches.length > 0) {
    console.error(`❌ 取得失敗ブランチ: ${failedBranches.length}件`);
    failedBranches.forEach(fb => {
      console.error(`  - ${fb.name}: ${fb.error}`);
    });
  }
  console.error('============');

  // JSON出力
  const jsonOutput = JSON.stringify(result, null, 2);
  if (outputFile) {
    // ファイルに書き込み（stdout/stderrの混在を防ぐ）
    fs.writeFileSync(outputFile, jsonOutput, 'utf-8');
    console.error(`✅ 出力ファイル: ${outputFile}`);
  } else {
    // 標準出力（後方互換性）
    console.log(jsonOutput);
  }

  // 失敗があれば exit 1 で終了
  if (failedBranches.length > 0) {
    console.error('');
    console.error('❌ 一部ブランチの取得に失敗しました。処理を中断します。');
    process.exit(1);
  }
}

main();
