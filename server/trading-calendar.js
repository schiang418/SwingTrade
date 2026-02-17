/**
 * US Stock Market (NYSE/NASDAQ) Trading Calendar
 *
 * Provides:
 *  - Dynamic computation of market holidays for any year
 *  - Trading-day checks (excludes weekends + holidays)
 *  - Week-relative trading-day helpers for the weekly portfolio workflow
 *  - DST-aware cron scheduling helpers
 */

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get today's date string in US Eastern timezone (YYYY-MM-DD). */
function getEasternDateStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// Holiday computation
// ---------------------------------------------------------------------------

/** Easter Sunday via the anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
function getEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Nth weekday of a month (e.g. 3rd Monday of January). dayOfWeek: 0=Sun..6=Sat */
function getNthDayOfMonth(year, month, dayOfWeek, n) {
  const first = new Date(year, month, 1);
  let offset = dayOfWeek - first.getDay();
  if (offset < 0) offset += 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** Last weekday of a month (e.g. last Monday of May). */
function getLastDayOfMonth(year, month, dayOfWeek) {
  const last = new Date(year, month + 1, 0); // last calendar day
  let offset = last.getDay() - dayOfWeek;
  if (offset < 0) offset += 7;
  return new Date(year, month + 1, -offset);
}

/** Weekend-observation rule: Sat → preceding Fri, Sun → following Mon. */
function observedDate(year, month, day) {
  const date = new Date(year, month, day);
  const dow = date.getDay();
  if (dow === 6) return new Date(year, month, day - 1);
  if (dow === 0) return new Date(year, month, day + 1);
  return date;
}

/**
 * Compute all NYSE market holidays for a given year.
 * Returns a Set of YYYY-MM-DD strings.
 */
function getMarketHolidays(year) {
  const holidays = [];

  // New Year's Day – Jan 1 (observed)
  holidays.push(observedDate(year, 0, 1));

  // Martin Luther King Jr. Day – 3rd Monday of January
  holidays.push(getNthDayOfMonth(year, 0, 1, 3));

  // Presidents' Day – 3rd Monday of February
  holidays.push(getNthDayOfMonth(year, 1, 1, 3));

  // Good Friday – 2 days before Easter Sunday
  const easter = getEasterDate(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  holidays.push(goodFriday);

  // Memorial Day – last Monday of May
  holidays.push(getLastDayOfMonth(year, 4, 1));

  // Juneteenth – June 19 (observed)
  holidays.push(observedDate(year, 5, 19));

  // Independence Day – July 4 (observed)
  holidays.push(observedDate(year, 6, 4));

  // Labor Day – 1st Monday of September
  holidays.push(getNthDayOfMonth(year, 8, 1, 1));

  // Thanksgiving Day – 4th Thursday of November
  holidays.push(getNthDayOfMonth(year, 10, 4, 4));

  // Christmas Day – Dec 25 (observed)
  holidays.push(observedDate(year, 11, 25));

  return new Set(holidays.map(formatDate));
}

// Per-year cache
const holidayCache = {};
function getHolidaysForYear(year) {
  if (!holidayCache[year]) {
    holidayCache[year] = getMarketHolidays(year);
  }
  return holidayCache[year];
}

// ---------------------------------------------------------------------------
// Trading-day queries
// ---------------------------------------------------------------------------

/** Is the given YYYY-MM-DD string a market holiday? */
function isMarketHoliday(dateStr) {
  const year = parseInt(dateStr.substring(0, 4), 10);
  return getHolidaysForYear(year).has(dateStr);
}

/** Is the given YYYY-MM-DD string a trading day (weekday + not a holiday)? */
function isTradingDay(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !isMarketHoliday(dateStr);
}

/** Convenience: is *today* (Eastern) a trading day? */
function isTradingDayToday() {
  return isTradingDay(getEasternDateStr());
}

// ---------------------------------------------------------------------------
// Week-relative helpers (for the weekly portfolio workflow)
// ---------------------------------------------------------------------------

/**
 * Which trading day of the current week is `dateStr`?
 * Returns 1 (first), 2 (second), … 5, or 0 if it is not a trading day.
 */
function getTradingDayOfWeek(dateStr) {
  const today = new Date(dateStr + 'T12:00:00');
  const dow = today.getDay();
  if (dow === 0 || dow === 6) return 0;

  // Monday of this ISO week
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow - 1));

  let count = 0;
  for (let i = 0; i < 5; i++) {
    const check = new Date(monday);
    check.setDate(monday.getDate() + i);
    const checkStr = formatDate(check);
    if (isTradingDay(checkStr)) {
      count++;
      if (checkStr === dateStr) return count;
    }
  }
  return 0;
}

/**
 * Return the YYYY-MM-DD of the first trading day of the week
 * that contains `dateStr`.
 */
function getFirstTradingDayOfWeek(dateStr) {
  const today = new Date(dateStr + 'T12:00:00');
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow - 1));

  for (let i = 0; i < 5; i++) {
    const check = new Date(monday);
    check.setDate(monday.getDate() + i);
    const checkStr = formatDate(check);
    if (isTradingDay(checkStr)) return checkStr;
  }
  return null;
}

// ---------------------------------------------------------------------------
// DST-aware cron scheduling
// ---------------------------------------------------------------------------

/**
 * Determine whether US Eastern is currently in EDT (UTC-4) or EST (UTC-5).
 *
 * Works by comparing the UTC offset of the current instant in America/New_York.
 */
function isEDT() {
  const now = new Date();
  // Get UTC offset for America/New_York in minutes
  // We do this by formatting to parts and computing the difference.
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const diffMinutes = (eastern - now) / 60000 + now.getTimezoneOffset();
  // EDT offset from UTC = -240 minutes, EST = -300 minutes
  // But we're computing (localReparsed - original) which gives a positive number
  // Simpler: just check the timezone abbreviation
  const tzStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' });
  return tzStr.includes('EDT');
}

/**
 * Build a cron expression that fires at the given Eastern Time, adjusted for
 * the current DST state.
 *
 * @param {number} etHour   – desired hour in Eastern Time (0-23)
 * @param {number} etMinute – desired minute (0-59)
 * @param {string} daySpec  – cron day-of-week field, e.g. '1-5' for Mon-Fri
 * @returns {string} cron expression in UTC
 */
function easternCron(etHour, etMinute, daySpec) {
  const utcOffset = isEDT() ? 4 : 5;
  let utcHour = etHour + utcOffset;
  let utcMinute = etMinute;
  // Handle day rollover (shouldn't happen for our use cases but be safe)
  if (utcHour >= 24) utcHour -= 24;
  return `${utcMinute} ${utcHour} * * ${daySpec}`;
}

/**
 * Schedule a node-cron job that fires at a fixed Eastern Time, automatically
 * re-scheduling itself twice a year when DST transitions occur.
 *
 * Checks for DST change every hour and reschedules if needed.
 *
 * @param {object} cronLib   – the node-cron module
 * @param {number} etHour    – desired Eastern hour
 * @param {number} etMinute  – desired Eastern minute
 * @param {string} daySpec   – cron day-of-week field
 * @param {Function} handler – async function to run
 * @param {string} label     – human-readable label for logging
 * @returns {{ task: object, stop: Function }} control handle
 */
function scheduleEastern(cronLib, etHour, etMinute, daySpec, handler, label) {
  let currentDST = isEDT();
  let currentExpr = easternCron(etHour, etMinute, daySpec);
  let task = cronLib.schedule(currentExpr, handler);

  console.log(`[Scheduler] ${label}: cron="${currentExpr}" (${currentDST ? 'EDT' : 'EST'})`);

  // Check for DST transitions every hour and reschedule if needed
  const dstChecker = setInterval(() => {
    const nowDST = isEDT();
    if (nowDST !== currentDST) {
      currentDST = nowDST;
      const newExpr = easternCron(etHour, etMinute, daySpec);
      console.log(`[Scheduler] DST changed to ${currentDST ? 'EDT' : 'EST'}, rescheduling ${label}: "${currentExpr}" → "${newExpr}"`);
      task.stop();
      currentExpr = newExpr;
      task = cronLib.schedule(currentExpr, handler);
    }
  }, 60 * 60 * 1000); // every hour

  return {
    task,
    stop() {
      task.stop();
      clearInterval(dstChecker);
    },
  };
}

module.exports = {
  // Holiday / trading-day
  isTradingDay,
  isTradingDayToday,
  isMarketHoliday,
  getMarketHolidays,
  getEasternDateStr,
  // Week-relative
  getTradingDayOfWeek,
  getFirstTradingDayOfWeek,
  // DST-aware scheduling
  isEDT,
  easternCron,
  scheduleEastern,
};
