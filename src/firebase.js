import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  enableIndexedDbPersistence 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';

// Read config from Vite environment variables or use fallback demo config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDemoConfigKeyForObsidianExpenseTracker",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "obsidian-expense-tracker.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "obsidian-expense-tracker",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "obsidian-expense-tracker.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1029384756",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1029384756:web:abcd1234efgh5678"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Attempt offline persistence
try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence is not supported by current browser');
    }
  });
} catch (e) {
  console.log('IndexedDB persistence setup skipped');
}

// Authenticate user automatically (Anonymous Auth fallback)
let currentUser = null;

export const initAuth = () => {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        console.log('Firebase Auth initialized. User UID:', user.uid);
        resolve(user);
      } else {
        signInAnonymously(auth)
          .then((cred) => {
            currentUser = cred.user;
            console.log('Signed in anonymously as:', cred.user.uid);
            resolve(cred.user);
          })
          .catch((error) => {
            console.warn('Anonymous Auth fallback notice:', error.message);
            // Fallback mock user for unconfigured sandbox offline testing
            currentUser = { uid: 'guest_user_obsidian_vault' };
            resolve(currentUser);
          });
      }
    });
  });
};

export const getCurrentUserId = () => currentUser?.uid || 'guest_user_obsidian_vault';

export { app, db, auth };
