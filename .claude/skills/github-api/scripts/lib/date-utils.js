function getYesterdayJST() {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);

  const yesterday = new Date(jstNow);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const year = yesterday.getUTCFullYear();
  const month = yesterday.getUTCMonth();
  const day = yesterday.getUTCDate();

  const start = new Date(Date.UTC(year, month, day, 0, 0, 0));
  start.setTime(start.getTime() - jstOffset);

  const end = new Date(Date.UTC(year, month, day, 23, 59, 59));
  end.setTime(end.getTime() - jstOffset);

  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return {
    date: dateStr,
    startUTC: start.toISOString().replace('.000Z', 'Z'),
    endUTC: end.toISOString().replace('.000Z', 'Z')
  };
}

function getTargetDateJST(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const jstOffset = 9 * 60 * 60 * 1000;

  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  start.setTime(start.getTime() - jstOffset);

  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
  end.setTime(end.getTime() - jstOffset);

  return {
    date: dateStr,
    startUTC: start.toISOString().replace('.000Z', 'Z'),
    endUTC: end.toISOString().replace('.000Z', 'Z')
  };
}

module.exports = { getYesterdayJST, getTargetDateJST };
