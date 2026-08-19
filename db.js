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

    /*    
    //---nidhi
    apiKey: "AIzaSyBccHBwl_wcr80w96lkiUyeieBzmd2uKGs",
    authDomain: "nidhi-gst.firebaseapp.com",
    projectId: "nidhi-gst",
    storageBucket: "nidhi-gst.firebasestorage.app",
    messagingSenderId: "503817715778",
    appId: "1:503817715778:web:395213b4faab86d56d2ddb"
    */

/*
    // test---
    apiKey: "AIzaSyBA0eSQposFN_YhB4F3K2Q4uUzwSPcnZCc",
    authDomain: "mytest-db-615d2.firebaseapp.com",
    databaseURL: "https://mytest-db-615d2-default-rtdb.firebaseio.com",
    projectId: "mytest-db-615d2",
    storageBucket: "mytest-db-615d2.firebasestorage.app",
    messagingSenderId: "7667456156",
    appId: "1:7667456156:web:9daa4c020a486db62fb559"
*/
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, addDoc, getDoc, getDocs, query, where, orderBy, doc, setDoc, updateDoc, deleteDoc };