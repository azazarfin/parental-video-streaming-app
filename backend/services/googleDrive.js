const { google } = require('googleapis');

let cachedDriveClient = null;

/**
 * Returns an authenticated Google Drive API client
 * using a Service Account via environment variables.
 * Uses a singleton to leverage the internal token cache.
 */
function getDriveClient() {
  if (cachedDriveClient) {
    return cachedDriveClient;
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY environment variables.'
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, '\n').replace(/"/g, ''), // Strip possible extraneous quotes just in case
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });

  cachedDriveClient = { drive: google.drive({ version: 'v3', auth }), authClient: auth };
  return cachedDriveClient;
}
function resetDriveClient() {
  cachedDriveClient = null;
}

module.exports = { getDriveClient, resetDriveClient };
