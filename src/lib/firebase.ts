import { getApp } from '@react-native-firebase/app';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';

const app = getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
if (__DEV__ && emulatorHost) {
  connectAuthEmulator(auth, 'http://' + emulatorHost + ':9099');
  connectFirestoreEmulator(db, emulatorHost, 8080);
}
