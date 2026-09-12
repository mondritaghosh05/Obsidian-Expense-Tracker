import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db, getCurrentUserId } from '../firebase.js';

let activeVault = 'primary_expenses';
let localExpenses = [];
let listeners = [];

function notifyLocalListeners() {
  const currentUserId = getCurrentUserId();
  const userFiltered = localExpenses.filter(e => e.userId === currentUserId);
  listeners.forEach(cb => cb(userFiltered));
}

export function setActiveVault(vaultName) {
  activeVault = vaultName;
}

export function getActiveVault() {
  return activeVault;
}

/**
 * Subscribes to real-time expense updates for the current active user profile.
 */
export function subscribeToExpenses(onUpdate) {
  const collectionRef = collection(db, activeVault);
  const currentUserId = getCurrentUserId();
  
  try {
    const q = query(
      collectionRef, 
      where('userId', '==', currentUserId),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      onUpdate(items);
    }, (error) => {
      console.warn('Firestore snapshot listener notice (offline fallback):', error.message);
      listeners.push(onUpdate);
      notifyLocalListeners();
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Using local store fallback:', err.message);
    listeners.push(onUpdate);
    notifyLocalListeners();
    return () => {
      listeners = listeners.filter(l => l !== onUpdate);
    };
  }
}

/**
 * Adds a new user-logged expense document (completed or future/scheduled).
 */
export async function addExpenseDoc(expenseData) {
  const payload = {
    title: expenseData.title,
    category: expenseData.category,
    cadence: expenseData.cadence,
    amount: parseFloat(expenseData.amount),
    type: expenseData.type || 'completed', // 'completed' vs 'scheduled'
    dueDate: expenseData.dueDate || 'Pending',
    paymentMethod: expenseData.paymentMethod || 'Amex Corp (••9901)',
    note: expenseData.note || `${expenseData.category} Entry`,
    userId: getCurrentUserId(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    const collectionRef = collection(db, activeVault);
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

export async function updateExpenseDoc(id, updateData) {
  const payload = {
    ...updateData,
    amount: parseFloat(updateData.amount),
    type: updateData.type || 'completed',
    updatedAt: serverTimestamp()
  };

  try {
    const docRef = doc(db, activeVault, id);
    await updateDoc(docRef, payload);
  } catch (err) {
    console.warn('Updating Firestore document failed, updating local store:', err.message);
    localExpenses = localExpenses.map(item => item.id === id ? { ...item, ...payload } : item);
    notifyLocalListeners();
  }
}

export async function deleteExpenseDoc(id) {
  try {
    const docRef = doc(db, activeVault, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Deleting Firestore document failed, updating local store:', err.message);
    localExpenses = localExpenses.filter(item => item.id !== id);
    notifyLocalListeners();
  }
}

export async function clearAllExpenses() {
  const currentUserId = getCurrentUserId();
  try {
    const collectionRef = collection(db, activeVault);
    const q = query(collectionRef, where('userId', '==', currentUserId));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (err) {
    console.warn('Clearing Firestore vault failed, clearing local store:', err.message);
    localExpenses = localExpenses.filter(e => e.userId !== currentUserId);
    notifyLocalListeners();
  }
}
