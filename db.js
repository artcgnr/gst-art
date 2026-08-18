import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDoc, getDocs, query, where, orderBy, doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBA0eSQposFN_YhB4F3K2Q4uUzwSPcnZCc",
    authDomain: "mytest-db-615d2.firebaseapp.com",
    databaseURL: "https://mytest-db-615d2-default-rtdb.firebaseio.com",
    projectId: "mytest-db-615d2",
    storageBucket: "mytest-db-615d2.firebasestorage.app",
    messagingSenderId: "7667456156",
    appId: "1:7667456156:web:9daa4c020a486db62fb559"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, addDoc, getDoc, getDocs, query, where, orderBy, doc, setDoc, updateDoc, deleteDoc };