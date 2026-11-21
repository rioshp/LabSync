import { getApp } from '@react-native-firebase/app';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from '@react-native-firebase/functions';

const app = getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
if (__DEV__ && emulatorHost) {
  connectAuthEmulator(auth, 'http://' + emulatorHost + ':9099');
  connectFirestoreEmulator(db, emulatorHost, 8080);
  connectFunctionsEmulator(functions, emulatorHost, 5001);
}
