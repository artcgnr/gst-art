import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDoc, getDocs, query, where, orderBy, doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
    // art db ----
    apiKey: "AIzaSyBSyI6_dHpJCdQuTU9pdcCsvpLFUwhRnVc",
    authDomain: "gst-billing-e17b3.firebaseapp.com",
    projectId: "gst-billing-e17b3",
    storageBucket: "gst-billing-e17b3.firebasestorage.app",
    messagingSenderId: "110456904589",
    appId: "1:110456904589:web:428c2be8fdd08c2662bbc4"

   
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, addDoc, getDoc, getDocs, query, where, orderBy, doc, setDoc, updateDoc, deleteDoc };