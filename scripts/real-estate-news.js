#!/usr/bin/env node

const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');

// --- Config loader (yaml not required; hand-parse or use env fallback) ---
function loadConfig() {
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '..', 'configs', 'news', 'real-estate.yml');
    const text = fs.readFileSync(configPath, 'utf8');

    // Simple YAML list parser for the keywords array
    const keywords = [];
    let inKeywords = false;
    for (const line of text.split('\n')) {
      if (line.trim().startsWith('keywords:')) { inKeywords = true; continue; }
      if (inKeywords) {
        const m = line.match(/^\s+-\s+(.+)/);
        if (m) keywords.push(m[1].trim());
        else if (line.match(/^\S/)) inKeywords = false;
      }
    }

    const toMatch = text.match(/to:\s*(.+)/);
    const perMatch = text.match(/per_keyword:\s*(\d+)/);
    const maxMatch = text.match(/max_articles:\s*(\d+)/);

    return {
      to: toMatch ? toMatch[1].trim() : '',
      keywords: keywords.length ? keywords : ['不動産', '住宅ローン', '地価', 'マンション', 'REIT'],
      perKeyword: perMatch ? parseInt(perMatch[1]) : 5,
      maxArticles: maxMatch ? parseInt(maxMatch[1]) : 10,
    };
  } catch (e) {
    console.warn('Config load failed, using defaults:', e.message);
    return {
      to: '',
      keywords: ['不動産', '住宅ローン', '地価', 'マンション', 'REIT'],
      perKeyword: 5,
      maxArticles: 10,
    };
  }
}

// --- RSS fetch ---
function fetchRSS(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   block.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const link  = (block.match(/<link>(.*?)<\/link>/)  || [])[1] || '';
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const source = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
    if (title) items.push({ title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), link, pubDate, source });
  }
  return items;
}

async function fetchNews(keywords, perKeyword) {
  const seenTitles = new Set();
  const articles = [];

  for (const kw of keywords) {
    const query = encodeURIComponent(kw);
    const url = `https://news.google.com/rss/search?q=${query}&hl=ja&gl=JP&ceid=JP:ja`;
    try {
      const xml = await fetchRSS(url);
      const items = parseRSS(xml).slice(0, perKeyword);
      for (const item of items) {
        if (!seenTitles.has(item.title)) {
          seenTitles.add(item.title);
          articles.push(item);
        }
      }
    } catch (e) {
      console.warn(`Fetch failed for "${kw}":`, e.message);
    }
    await new Promise(r => setTimeout(r, 300)); // rate limit
  }

  return articles;
}

// --- Claude summarize ---
async function summarize(articles, maxArticles) {
  const client = new Anthropic();

  const list = articles.map((a, i) =>
    `${i + 1}. ${a.title}\n   ${a.link}\n   ${a.pubDate}`
  ).join('\n\n');

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `以下は今日の不動産関連ニュース一覧です。
重要度の高い順に最大${maxArticles}件を選び、各記事を1〜2行で要約してください。

${list}

JSON配列で出力してください:
[
  {
    "title": "元のタイトル（そのまま）",
    "summary": "1〜2行の要約",
    "link": "記事URL",
    "importance": "high|medium|low"
  }
]

重要度の基準:
- high: 金利・政策・市場全体に影響する大きな動き
- medium: 地域・特定セグメントの動向
- low: 個別事例・軽微なニュース

JSON以外は出力しないこと。`
    }],
  });

  const text = msg.content[0].text;

  // [ から ] を直接取り出す（コードブロック有無にかかわらず動く）
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || start >= end) {
    throw new Error('Claude returned no JSON array: ' + text.slice(0, 300));
  }
  return JSON.parse(text.slice(start, end + 1));
}

// --- HTML email ---
function buildEmail(articles, dateLabel) {
  const badge = {
    high:   { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', label: '重要' },
    medium: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', label: '注目' },
    low:    { bg: '#f1f5f9', border: '#94a3b8', text: '#475569', label: '参考' },
  };

  const rows = articles.map(a => {
    const b = badge[a.importance] || badge.low;
    return `
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
          <div style="margin-bottom:5px;">
            <span style="display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:bold;background:${b.bg};color:${b.text};border:1px solid ${b.border};">${b.label}</span>
          </div>
          <a href="${a.link}" style="color:#1e40af;text-decoration:none;font-size:14px;font-weight:600;line-height:1.5;">${a.title}</a>
          <p style="margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.6;">${a.summary}</p>
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#059669,#0d9488);padding:22px 24px;">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:bold;">不動産ニュースまとめ</h1>
      <p style="margin:4px 0 0;color:#a7f3d0;font-size:13px;">${dateLabel}</p>
    </div>

    <div style="padding:10px 24px;background:#f0fdf4;border-bottom:1px solid #d1fae5;">
      <p style="margin:0;color:#065f46;font-size:13px;">本日 <strong>${articles.length}件</strong> をお届けします</p>
    </div>

    <table style="width:100%;border-collapse:collapse;">
      ${rows}
    </table>

    <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">このメールは自動送信です。配信停止はリポジトリの設定をご確認ください。</p>
    </div>

  </div>
</body>
</html>`;
}

// --- Send ---
async function sendMail(html, dateLabel, toEmail) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"不動産ニュース" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `【不動産ニュース】${dateLabel}`,
    html,
  });

  console.log(`Email sent to ${toEmail}`);
}

// --- Main ---
async function main() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateLabel = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;

  const config = loadConfig();
  const toEmail = process.env.NEWS_TO_EMAIL || config.to;
  if (!toEmail) throw new Error('NEWS_TO_EMAIL is not set');

  console.log(`Date: ${dateLabel}`);
  console.log(`To: ${toEmail}`);

  console.log('Fetching news...');
  const articles = await fetchNews(config.keywords, config.perKeyword);
  console.log(`Fetched ${articles.length} articles (before dedup)`);
  if (articles.length === 0) { console.log('No articles, skipping.'); return; }

  console.log('Summarizing with Claude...');
  const summarized = await summarize(articles, config.maxArticles);
  console.log(`Summarized to ${summarized.length} articles`);

  const html = buildEmail(summarized, dateLabel);

  console.log('Sending email...');
  await sendMail(html, dateLabel, toEmail);

  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
