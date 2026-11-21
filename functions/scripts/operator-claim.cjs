'use strict';

const admin = require('firebase-admin');

async function main() {
  const [, , uid, operation = 'grant'] = process.argv;
  if (!uid || uid.includes('/') || !['grant', 'revoke'].includes(operation)) {
    throw new Error('Usage: node scripts/operator-claim.cjs <firebase-auth-uid> [grant|revoke]');
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  }
  const auth = admin.auth();
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}) };
  if (operation === 'grant') claims.labsyncOperator = true;
  else delete claims.labsyncOperator;
  await auth.setCustomUserClaims(uid, claims);
  process.stdout.write(
    `${operation === 'grant' ? 'Granted' : 'Revoked'} labsyncOperator for ${uid}. Sign in again to refresh the ID token.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
