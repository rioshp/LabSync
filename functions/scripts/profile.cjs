'use strict';

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

async function provisionAssistant(db, account, name) {
  if (!account.emailVerified || account.disabled) {
    throw new Error('Akun asisten harus aktif dan emailnya sudah terverifikasi.');
  }

  const ref = db.collection('users').doc(account.uid);
  return db.runTransaction(async (tx) => {
    const existing = (await tx.get(ref)).data();
    if (existing?.role === 'asisten') return false;
    const timestamp = FieldValue.serverTimestamp();

    if (!existing) {
      const displayName = (name ?? account.displayName ?? '').trim();
      if (!displayName || displayName.length > 100) {
        throw new Error('Masukkan nama asisten, maksimal 100 karakter.');
      }
      tx.create(ref, {
        displayName,
        role: 'asisten',
        accountStatus: 'active',
        nim: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return true;
    }

    if (existing.role !== 'praktikan' || existing.accountStatus !== 'active' || !existing.nim) {
      throw new Error('Gunakan akun baru atau profil praktikan yang aktif.');
    }
    const collections = ['enrollments', 'attendances', 'permits', 'reviews'];
    const records = await Promise.all(
      collections.map((collection) =>
        tx.get(db.collection(collection).where('studentUid', '==', account.uid).limit(1)),
      ),
    );
    if (records.some((record) => !record.empty)) {
      throw new Error('Akun sudah memiliki catatan akademik. Gunakan akun asisten terpisah.');
    }
    const key = db.collection('studentKeys').doc(existing.nim);
    const reservation = (await tx.get(key)).data();
    if (reservation && reservation.studentUid !== account.uid) {
      throw new Error('Klaim NIM tidak cocok dengan akun.');
    }
    tx.update(ref, { role: 'asisten', nim: null, updatedAt: timestamp });
    if (reservation) tx.delete(key);
    return true;
  });
}

async function main() {
  const [, , action, uid, value] = process.argv;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (
    !projectId ||
    !uid ||
    uid.includes('/') ||
    !['provisionAssistant', 'setAccountStatus'].includes(action)
  ) {
    throw new Error(
      'Set GOOGLE_CLOUD_PROJECT and run: node scripts/profile.cjs <provisionAssistant|setAccountStatus> <uid> [name|status]',
    );
  }

  const app = initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore(app);
  if (action === 'provisionAssistant') {
    const account = await getAuth(app).getUser(uid);
    const provisioned = await provisionAssistant(db, account, value);
    console.log(provisioned ? 'Profil asisten siap.' : 'Akun sudah memiliki profil asisten.');
    return;
  }

  if (value !== 'active' && value !== 'disabled') throw new Error('Gunakan active atau disabled.');
  await db.collection('users').doc(uid).update({
    accountStatus: value,
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log('Status profil diperbarui.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
