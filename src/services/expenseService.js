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
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db, getCurrentUserId } from '../firebase.js';

let activeVault = 'primary_expenses';
let localExpenses = [];
let listeners = [];

function notifyLocalListeners() {
  listeners.forEach(cb => cb(localExpenses));
}

export function setActiveVault(vaultName) {
  activeVault = vaultName;
}

export function getActiveVault() {
  return activeVault;
}

/**
 * Subscribes to real-time expense updates from Firestore.
 * Does NOT auto-seed sample data. Stays completely empty until user logs an expense.
 */
export function subscribeToExpenses(onUpdate) {
  const collectionRef = collection(db, activeVault);
  
  try {
    const q = query(collectionRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      onUpdate(items);
    }, (error) => {
      console.warn('Firestore snapshot listener notice:', error.message);
      listeners.push(onUpdate);
      onUpdate(localExpenses);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Using local reactive store fallback:', err.message);
    listeners.push(onUpdate);
    onUpdate(localExpenses);
    return () => {
      listeners = listeners.filter(l => l !== onUpdate);
    };
  }
}

/**
 * Adds a new user-logged expense document to Firestore or local store.
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
    status: expenseData.status || 'addressed',
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

export async function toggleExpenseStatusDoc(id, currentStatus) {
  const newStatus = currentStatus === 'addressed' ? 'pending' : 'addressed';
  try {
    const docRef = doc(db, activeVault, id);
    await updateDoc(docRef, { status: newStatus, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Toggling expense status failed, updating local store:', err.message);
    localExpenses = localExpenses.map(item => item.id === id ? { ...item, status: newStatus } : item);
    notifyLocalListeners();
  }
  return newStatus;
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
  try {
    const collectionRef = collection(db, activeVault);
    const snapshot = await getDocs(collectionRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (err) {
    console.warn('Clearing Firestore vault failed, clearing local store:', err.message);
    localExpenses = [];
    notifyLocalListeners();
  }
}
