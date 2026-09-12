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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDemoConfigKeyForObsidianExpenseTracker",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "obsidian-expense-tracker.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "obsidian-expense-tracker",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "obsidian-expense-tracker.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1029384756",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1029384756:web:abcd1234efgh5678"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    }
  });
} catch (e) {
  console.log('IndexedDB persistence setup skipped');
}

// User Profile State Management
export const USER_PROFILES = {
  alex: { id: 'alex_mercer', name: 'Alex Mercer', role: 'Pro Quantitative', initials: 'AM' },
  test: { id: 'test_user', name: 'Test User', role: 'Sandbox Tester', initials: 'TU' },
  finance: { id: 'finance_admin', name: 'Finance Lead', role: 'Corporate Vault', initials: 'FL' }
};

let activeProfileKey = localStorage.getItem('obsidian_active_user') || 'alex';

export function getActiveUser() {
  return USER_PROFILES[activeProfileKey] || USER_PROFILES.alex;
}

export function setActiveUser(profileKey) {
  if (USER_PROFILES[profileKey]) {
    activeProfileKey = profileKey;
    localStorage.setItem('obsidian_active_user', profileKey);
  }
  return getActiveUser();
}

let firebaseAuthUser = null;

export const initAuth = () => {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        firebaseAuthUser = user;
        resolve(user);
      } else {
        signInAnonymously(auth)
          .then((cred) => {
            firebaseAuthUser = cred.user;
            resolve(cred.user);
          })
          .catch(() => {
            firebaseAuthUser = { uid: getActiveUser().id };
            resolve(firebaseAuthUser);
          });
      }
    });
  });
};

export const getCurrentUserId = () => getActiveUser().id;

export { app, db, auth };
