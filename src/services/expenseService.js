import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy,
  getDocs
} from 'firebase/firestore';
import { db, getCurrentUserId } from '../firebase.js';

const INITIAL_SEED_EXPENSES = [
  {
    title: "Blue Bottle Coffee",
    category: "Dining",
    cadence: "regular",
    amount: 6.50,
    dueDate: "Daily (Recurring)",
    paymentMethod: "Apple Pay (••8492)",
    note: "Daily Roastery espresso"
  },
  {
    title: "Whole Foods Market",
    category: "Provisions",
    cadence: "regular",
    amount: 142.30,
    dueDate: "Every Sunday",
    paymentMethod: "Amex Gold (••1004)",
    note: "Weekly organic pantry"
  },
  {
    title: "Uber Transit & Commute",
    category: "Transit",
    cadence: "regular",
    amount: 34.20,
    dueDate: "Weekly avg",
    paymentMethod: "Chase Sapphire (••3011)",
    note: "Weekly city travel"
  },
  {
    title: "Studio Apartment Lease",
    category: "Housing",
    cadence: "monthly",
    amount: 2400.00,
    dueDate: "1st of month",
    paymentMethod: "ACH Direct Debit",
    note: "Primary residential rent"
  },
  {
    title: "Figma Enterprise Org",
    category: "Software",
    cadence: "monthly",
    amount: 45.00,
    dueDate: "Dec 01, 2024",
    paymentMethod: "Amex Corp (••9901)",
    note: "Design system & seats"
  },
  {
    title: "Equinox Fitness Club",
    category: "Health",
    cadence: "monthly",
    amount: 280.00,
    dueDate: "Dec 08, 2024",
    paymentMethod: "Chase Sapphire (••3011)",
    note: "Tier X All-Access club"
  },
  {
    title: "Claude Pro Subscription",
    category: "Software",
    cadence: "monthly",
    amount: 20.00,
    dueDate: "Dec 14, 2024",
    paymentMethod: "Apple Pay (••8492)",
    note: "AI research workflow"
  },
  {
    title: "Apple Developer Program",
    category: "Dev Ops",
    cadence: "yearly",
    amount: 99.00,
    dueDate: "Jul 18, 2025",
    paymentMethod: "Apple Card (••2910)",
    note: "Annual iOS / macOS distribution"
  },
  {
    title: "Annual Auto Insurance",
    category: "Insurance",
    cadence: "yearly",
    amount: 1450.00,
    dueDate: "Mar 22, 2025",
    paymentMethod: "ACH Escrow Vault",
    note: "Geico comprehensive policy"
  },
  {
    title: "JetBrains All Products Pack",
    category: "Software",
    cadence: "yearly",
    amount: 289.00,
    dueDate: "Oct 11, 2025",
    paymentMethod: "Amex Corp (••9901)",
    note: "Annual IDE workstation suite"
  }
];

// Fallback in-memory store if Firestore network is unconfigured/blocked
let localExpenses = [...INITIAL_SEED_EXPENSES.map((item, index) => ({
  id: 'local_' + (index + 1),
  ...item,
  createdAt: new Date().toISOString()
}))];

let listeners = [];

function notifyLocalListeners() {
  listeners.forEach(cb => cb(localExpenses));
}

/**
 * Subscribes to real-time expense updates from Firestore.
 * Automatically handles seeding default dataset if Firestore is empty.
 */
export function subscribeToExpenses(onUpdate) {
  const collectionRef = collection(db, 'expenses');
  
  try {
    const q = query(collectionRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        // Seed initial data
        console.log('Seeding initial expense directory to Cloud Firestore...');
        for (const item of INITIAL_SEED_EXPENSES) {
          try {
            await addDoc(collectionRef, {
              ...item,
              userId: getCurrentUserId(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            console.warn('Seeding row skipped:', e.message);
          }
        }
      } else {
        const items = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        onUpdate(items);
      }
    }, (error) => {
      console.warn('Firestore snapshot listener error. Falling back to reactive local state:', error.message);
      listeners.push(onUpdate);
      onUpdate(localExpenses);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Using local reactive fallback store:', err.message);
    listeners.push(onUpdate);
    onUpdate(localExpenses);
    return () => {
      listeners = listeners.filter(l => l !== onUpdate);
    };
  }
}

/**
 * Adds a new expense document to Firestore or fallback store.
 */
export async function addExpenseDoc(expenseData) {
  const payload = {
    title: expenseData.title,
    category: expenseData.category,
    cadence: expenseData.cadence,
    amount: parseFloat(expenseData.amount),
    dueDate: expenseData.dueDate || 'Pending',
    paymentMethod: expenseData.paymentMethod || 'Amex Corp (••9901)',
    note: expenseData.note || `${expenseData.category} Entry`,
    userId: getCurrentUserId(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    const collectionRef = collection(db, 'expenses');
    const docRef = await addDoc(collectionRef, payload);
    return docRef.id;
  } catch (err) {
    console.warn('Adding document to Firestore failed, updating local store:', err.message);
    const newLocalItem = {
      id: 'local_' + Date.now(),
      ...payload,
      createdAt: new Date().toISOString()
    };
    localExpenses = [newLocalItem, ...localExpenses];
    notifyLocalListeners();
    return newLocalItem.id;
  }
}

/**
 * Updates an existing expense document in Firestore or fallback store.
 */
export async function updateExpenseDoc(id, updateData) {
  const payload = {
    ...updateData,
    amount: parseFloat(updateData.amount),
    updatedAt: serverTimestamp()
  };

  try {
    const docRef = doc(db, 'expenses', id);
    await updateDoc(docRef, payload);
  } catch (err) {
    console.warn('Updating Firestore document failed, updating local store:', err.message);
    localExpenses = localExpenses.map(item => item.id === id ? { ...item, ...payload } : item);
    notifyLocalListeners();
  }
}

/**
 * Deletes an expense document from Firestore or fallback store.
 */
export async function deleteExpenseDoc(id) {
  try {
    const docRef = doc(db, 'expenses', id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Deleting Firestore document failed, updating local store:', err.message);
    localExpenses = localExpenses.filter(item => item.id !== id);
    notifyLocalListeners();
  }
}
