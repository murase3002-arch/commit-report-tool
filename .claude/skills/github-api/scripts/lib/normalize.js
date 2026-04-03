const crypto = require('crypto');

function normalizeCommits(rawCommits) {
  return rawCommits.map(commit => {
    let author;
    if (commit.author?.login && commit.author?.avatar_url) {
      author = { login: commit.author.login, avatar_url: commit.author.avatar_url };
    } else {
      const email = commit.commit?.author?.email || '';
      const name = commit.commit?.author?.name || 'Unknown';
      const hash = email
        ? crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex')
        : '00000000000000000000000000000000';
      author = {
        login: name,
        avatar_url: `https://www.gravatar.com/avatar/${hash}?d=identicon&s=80`
      };
      console.error(`[Avatar] フォールバック: ${name} (${commit.sha.substring(0, 7)})`);
    }
    return {
      sha: commit.sha,
      message: commit.commit.message,
      date: commit.commit.author.date,
      author,
      html_url: commit.html_url
    };
  });
}

module.exports = { normalizeCommits };
