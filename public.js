import { db, collection, getDocs, getDoc, doc } from "./db.js";

// Format Date dd/mm/yyyy
export function formatDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Branch Drop List using Firebase
export async function getBranchDropList(userBranch, branchDrop) {
    const snapshot = await getDocs(collection(db, "branches"));
    if (userBranch) userBranch.innerHTML = '<option value="" disabled selected>Select Branch</option>';
    snapshot.forEach((doc) => {
        const option = document.createElement("option");
        option.text = doc.data().name;
        option.value = doc.id;
        if (userBranch) userBranch.appendChild(option);
    });
}


export async function getBranchName(branchKey) {
    if (!branchKey || branchKey === 'none') return '';
    try {
        const branchDoc = await getDoc(doc(db, "branches", branchKey));
        if (branchDoc.exists()) {
            const branchData = branchDoc.data();
            return branchData.name || branchData.branchName || branchKey;
        }
    } catch (error) {
        console.error("Error fetching branch doc:", error);
    }
    return branchKey;
}