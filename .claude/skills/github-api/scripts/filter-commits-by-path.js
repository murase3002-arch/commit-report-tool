#!/usr/bin/env node
/**
 * コミットをパスでフィルタリングするスクリプト
 *
 * get-all-branch-commits.js の出力を受け取り、指定パスに関連するコミットのみを抽出。
 * 各コミットの変更ファイルを GitHub API で取得し、パスマッチングを行う。
 *
 * 使い方:
 *   # パイプライン
 *   node get-all-branch-commits.js owner repo | node filter-commits-by-path.js --owner owner --repo repo --paths "app/,web/"
 *
 *   # ファイル入力
 *   node filter-commits-by-path.js --input /tmp/commits.json --owner owner --repo repo --paths "app/,web/"
 *
 * 引数:
 *   --input <file>      入力ファイル（省略時stdin）
 *   --owner <name>      リポジトリオーナー（必須）
 *   --repo <name>       リポジトリ名（必須）
 *   --paths <list>      カンマ区切りパス（必須）例: "app/,web/"
 *   --concurrency <n>   並列数（デフォルト: 5）
 */

const { execSync } = require('child_process');
const fs = require('fs');

/**
 * コマンドライン引数を解析する
 * @returns {{ input: string|null, owner: string, repo: string, paths: string[], concurrency: number }}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { input: null, owner: null, repo: null, paths: null, concurrency: 5 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        parsed.input = args[++i];
        break;
      case '--owner':
        parsed.owner = args[++i];
        break;
      case '--repo':
        parsed.repo = args[++i];
        break;
      case '--paths':
        parsed.paths = args[++i];
        break;
      case '--concurrency':
        parsed.concurrency = parseInt(args[++i], 10);
        break;
    }
  }

  if (!parsed.owner || !parsed.repo || !parsed.paths) {
    console.error('Usage: node filter-commits-by-path.js --owner <owner> --repo <repo> --paths <paths>');
    console.error('');
    console.error('Required:');
    console.error('  --owner <name>      Repository owner');
    console.error('  --repo <name>       Repository name');
    console.error('  --paths <list>      Comma-separated paths (e.g. "app/,web/,supabase/")');
    console.error('');
    console.error('Optional:');
    console.error('  --input <file>      Input file (default: stdin)');
    console.error('  --concurrency <n>   Parallel requests (default: 5)');
    process.exit(1);
  }

  return {
    input: parsed.input,
    owner: parsed.owner,
    repo: parsed.repo,
    paths: parsed.paths.split(',').map(p => p.trim()).filter(Boolean),
    concurrency: parsed.concurrency
  };
}

/**
 * stdinまたはファイルからJSONを読み込む
 * @param {string|null} inputFile
 * @returns {object}
 */
function readInput(inputFile) {
  let raw;
  if (inputFile) {
    raw = fs.readFileSync(inputFile, 'utf-8');
  } else {
    raw = fs.readFileSync(0, 'utf-8'); // stdin
  }

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('JSON解析エラー:', e.message);
    process.exit(1);
  }
}

/**
 * コミットの変更ファイル一覧を GitHub API で取得する
 * @param {string} owner
 * @param {string} repo
 * @param {string} sha
 * @returns {{ filename: string, status: string, additions: number, deletions: number }[] | null}
 */
function getCommitFiles(owner, repo, sha) {
  const cmd = `gh api "repos/${owner}/${repo}/commits/${sha}" --jq '[.files[] | {filename, status, additions, deletions}]'`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (error) {
    console.error(`[${sha.substring(0, 7)}] ファイル取得エラー: ${error.message.split('\n')[0]}`);
    return null;
  }
}

/**
 * セマフォパターンで並列数を制限しながら処理を実行する
 * @param {Array} items
 * @param {function} processor
 * @param {number} concurrency
 * @returns {Promise<Array>}
 */
async function processWithConcurrency(items, processor, concurrency) {
  const results = new Array(items.length);
  let index = 0;
  let completed = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await processor(items[i], i);
      completed++;
      if (completed % 10 === 0) {
        console.error(`  進捗: ${completed}/${items.length}`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

/**
 * メイン処理
 */
async function main() {
  const { input, owner, repo, paths, concurrency } = parseArgs();

  console.error('=== パスフィルタリング ===');
  console.error(`リポジトリ: ${owner}/${repo}`);
  console.error(`対象パス: ${paths.join(', ')}`);
  console.error(`並列数: ${concurrency}`);
  console.error('=========================');

  // 入力読み込み
  const data = readInput(input);

  // 全ブランチから全コミットを収集（重複排除）
  /** @type {{ sha: string, message: string, date: string, author: object, html_url: string, branch: string }[]} */
  const allCommits = [];
  const seenShas = new Set();

  for (const [branchName, branchData] of Object.entries(data.branches)) {
    for (const commit of branchData.commits) {
      if (!seenShas.has(commit.sha)) {
        seenShas.add(commit.sha);
        allCommits.push({ ...commit, branch: branchName });
      }
    }
  }

  const originalCount = allCommits.length;
  console.error(`全コミット数: ${originalCount}（重複排除済み）`);

  if (originalCount === 0) {
    // コミットがない場合はそのまま出力
    const result = {
      metadata: {
        ...data.metadata,
        filter_paths: paths,
        original_commits: 0,
        filtered_commits: 0
      },
      branches: {}
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 並列でファイル取得 & パスマッチング
  console.error(`ファイル情報を取得中（並列数: ${concurrency}）...`);

  const matchResults = await processWithConcurrency(
    allCommits,
    (commit) => {
      const files = getCommitFiles(owner, repo, commit.sha);
      if (!files) return { commit, matchedFiles: [] };

      const matchedFiles = files.filter(f =>
        paths.some(p => f.filename.startsWith(p))
      );
      return { commit, matchedFiles };
    },
    concurrency
  );

  // マッチしたコミットのみでブランチ構造を再構築
  const filteredBranches = {};
  let filteredCount = 0;

  for (const { commit, matchedFiles } of matchResults) {
    if (matchedFiles.length === 0) continue;

    filteredCount++;
    const branchName = commit.branch;

    if (!filteredBranches[branchName]) {
      const originalBranch = data.branches[branchName];
      filteredBranches[branchName] = {
        commits: [],
        is_default: originalBranch.is_default
      };
    }

    // ブランチ情報はコミットから除外（出力形式を元の構造と合わせる）
    const { branch, ...commitData } = commit;
    filteredBranches[branchName].commits.push({
      ...commitData,
      matched_files: matchedFiles
    });
  }

  // 結果出力
  const result = {
    metadata: {
      ...data.metadata,
      filter_paths: paths,
      original_commits: originalCount,
      filtered_commits: filteredCount
    },
    branches: filteredBranches
  };

  // 更新されたメタデータ
  result.metadata.active_branches = Object.keys(filteredBranches).length;
  result.metadata.total_commits = filteredCount;

  console.error('');
  console.error(`=== フィルタ結果 ===`);
  console.error(`元のコミット: ${originalCount}`);
  console.error(`フィルタ後: ${filteredCount}`);
  console.error(`アクティブブランチ: ${Object.keys(filteredBranches).length}`);
  console.error('====================');

  console.log(JSON.stringify(result, null, 2));
}

main();
