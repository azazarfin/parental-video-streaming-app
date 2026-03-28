/**
 * Utility: Bangladesh time helpers (UTC+6).
 */

/**
 * Get current date/time in Bangladesh timezone (GMT+6).
 * @returns {Date} JS Date shifted to represent Bangladesh local time.
 */
function getBangladeshNow() {
  const now = new Date();
  // UTC time + 6 hours offset
  const bdTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return bdTime;
}

/**
 * Get the day-of-week name in Bangladesh timezone.
 * @returns {string} e.g. "Sunday", "Monday", "Friday"
 */
function getBangladeshDayName() {
  const bdNow = getBangladeshNow();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[bdNow.getUTCDay()];
}

/**
 * Get the date string (YYYY-MM-DD) in Bangladesh timezone.
 * Used to compare whether it's a "new day" for watch limit resets.
 * @returns {string}
 */
function getBangladeshDateString() {
  const bdNow = getBangladeshNow();
  return bdNow.toISOString().slice(0, 10);
}

/**
 * Determine if the given Bangladesh day name is a weekend.
 * Bangladesh weekends: Friday and Saturday.
 * @param {string} dayName
 * @returns {boolean}
 */
function isWeekend(dayName) {
  return dayName === 'Friday' || dayName === 'Saturday';
}

/**
 * Get the watch limit for today based on the user's schedule.
 * @param {Object} watchSchedule - { weekday: Number, weekend: Number }
 * @returns {number} minutes
 */
function getTodayLimit(watchSchedule) {
  const dayName = getBangladeshDayName();
  if (isWeekend(dayName)) {
    return watchSchedule.weekend || 120;
  }
  return watchSchedule.weekday || 60;
}

/**
 * Check if lastWatchedDate is a different day than today (in Bangladesh time).
 * @param {Date|null} lastWatchedDate
 * @returns {boolean}
 */
function isNewDayBD(lastWatchedDate) {
  const todayStr = getBangladeshDateString();
  if (!lastWatchedDate) return true;
  // Convert lastWatchedDate to Bangladesh time and compare date strings
  const lastBD = new Date(new Date(lastWatchedDate).getTime() + 6 * 60 * 60 * 1000);
  const lastStr = lastBD.toISOString().slice(0, 10);
  return lastStr !== todayStr;
}

module.exports = {
  getBangladeshNow,
  getBangladeshDayName,
  getBangladeshDateString,
  isWeekend,
  getTodayLimit,
  isNewDayBD,
};
