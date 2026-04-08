/**
 * Middleware: checkAppVersion
 *
 * Blocks requests from mobile app versions older than the minimum required.
 * The app sends its version via the `x-app-version` header.
 * If the header is missing or the version is too old, playback is blocked.
 */

const MIN_APP_VERSION = '1.1.0';

function parseVersion(v) {
  if (!v || typeof v !== 'string') return null;
  const parts = v.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return parts;
}

function isVersionAllowed(appVersion) {
  const app = parseVersion(appVersion);
  const min = parseVersion(MIN_APP_VERSION);
  if (!app || !min) return false;

  for (let i = 0; i < 3; i++) {
    if (app[i] > min[i]) return true;
    if (app[i] < min[i]) return false;
  }
  return true; // equal
}

function checkAppVersion(req, res, next) {
  const appVersion = req.query.appVersion || req.headers['x-app-version'];

  if (!appVersion) {
    return res.status(426).json({
      error: 'App update required. Please install the latest version.',
      updateRequired: true,
    });
  }

  if (!isVersionAllowed(appVersion)) {
    return res.status(426).json({
      error: `App version ${appVersion} is no longer supported. Please update to v${MIN_APP_VERSION} or later.`,
      updateRequired: true,
      minVersion: MIN_APP_VERSION,
    });
  }

  next();
}

module.exports = checkAppVersion;
