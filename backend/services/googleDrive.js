const { google } = require('googleapis');

/**
 * Returns an authenticated Google Drive API client
 * using a Service Account via environment variables.
 */
function getDriveClient() {
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

  return { drive: google.drive({ version: 'v3', auth }), authClient: auth };
}

module.exports = { getDriveClient };
