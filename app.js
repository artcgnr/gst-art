import { db, collection, addDoc, getDoc, getDocs, query, where, orderBy, doc, setDoc, updateDoc, deleteDoc } from "./db.js";
import { formatDate, getBranchDropList, getBranchName } from "./public.js";
// State
let currentUser = null; // { username, role, branch }

// branch drop list
const userBranch = document.getElementById("userBranch");
const branchDrop = document.getElementById("branchFilter");
getBranchDropList(userBranch, branchDrop);



// DOM Elements
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginSpinner = document.getElementById('loginSpinner');
const loginBtn = document.getElementById('loginBtn');

// Initialize Session on Load
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);

            // Skip login view
            loginView.classList.remove('active-view');
            loginView.style.display = 'none';
            loginView.classList.add('hidden');

            dashboardView.classList.remove('hidden');
            dashboardView.style.display = 'flex';
            dashboardView.classList.add('active-view');

            setupDashboard(currentUser);
        } catch (e) {
            console.error("Error parsing session data", e);
            localStorage.removeItem('currentUser');
        }
    }
});


// Login Handler
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    loginSpinner.classList.remove('hidden');
    loginBtn.querySelector('span').textContent = 'Authenticating...';
    loginBtn.disabled = true;

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
        const userRef = doc(db, "users", username);
        const userSnap = await getDocs(query(collection(db, "users"), where("username", "==", username), where("password", "==", password)));

        if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            currentUser = userData;

            // Persist session with limited fields
            const sessionData = {
                branch: userData.branch,
                username: userData.username,
                role: userData.role
            };
            localStorage.setItem('currentUser', JSON.stringify(sessionData));

            // Setup Dashboard
            setupDashboard(userData);

            // Switch views
            loginView.classList.remove('active-view');
            setTimeout(() => {
                loginView.style.display = 'none';
                loginView.classList.add('hidden');

                dashboardView.classList.remove('hidden');
                dashboardView.style.display = 'flex';
                // Trigger reflow
                void dashboardView.offsetWidth;
                dashboardView.classList.add('active-view');
            }, 300);

            // Load initial report
            loadReports();
        } else {
            throw new Error('Invalid username or password');
        }
    } catch (error) {
        loginError.textContent = error.message;
        loginError.classList.remove('hidden');
    } finally {
        loginSpinner.classList.add('hidden');
        loginBtn.querySelector('span').textContent = 'Login';
        loginBtn.disabled = false;
    }
});


// Submenu Toggle logic attached to window for inline onclick use
window.toggleSubmenu = function (event, submenuId) {
    event.preventDefault();
    const submenu = document.getElementById(submenuId);
    if (submenu) {
        submenu.classList.toggle('open');
        submenu.parentElement.classList.toggle('open'); // For arrow rotation
    }
};

// Tab Switching logic attached to window for inline onclick use
window.switchTab = function (tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active-tab');
        tab.classList.add('hidden');
    });

    // Remove active class from nav
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });

    // Show selected tab
    const activeTab = document.getElementById(`tab-${tabName}`);
    activeTab.classList.remove('hidden');
    activeTab.classList.add('active-tab');

    // Highlight nav
    document.querySelector(`#nav-${tabName} a`).classList.add('active');

    if (tabName === 'report') {
        loadReports();
    }
    if (tabName === 'branches') {
        loadBranches();
    }
    if (tabName === 'users') {
        loadUsers();
    }
    if (tabName === 'dash') {
        // loadchits();
    }
    if (tabName === 'schemes') {
        loadSchemes();
    }
    if (tabName === 'billing') {
        const billDateInput = document.getElementById('billDate');
        if (billDateInput && !billDateInput.value) {
            billDateInput.value = new Date().toISOString().split('T')[0];
        }
        loadAutoInvoiceNumber();
    }
};


function setupDashboard(user) {
    document.getElementById('currentBranchDisplay').innerHTML = ` ${user.username}`;

    // Role-based UI visibility
    const filterBox = document.getElementById('adminFilterBox');
    const dashboard = document.getElementById('tab-dash');
    const navDash = document.getElementById('nav-dash');
    const navBranches = document.getElementById('nav-branches');
    const navUsers = document.getElementById('nav-users');
    const navSchemes = document.getElementById('nav-schemes');


    if (user.role === 'admin' || user.role === 'headoffice') {
        // Admin/HO can see filter box
        filterBox.style.display = 'flex';
        navDash.style.display = 'flex';
        navBranches.style.display = 'flex';
        navUsers.style.display = 'flex';
        if (navSchemes) navSchemes.style.display = 'flex';
        populateBranchFilter();
        window.switchTab('dash');
    } else {
        // Branch
        filterBox.style.display = 'none';
        navDash.style.display = 'none';
        dashboard.classList.add('hidden');
        dashboard.classList.remove('active-tab');
        navBranches.style.display = 'none';
        navUsers.style.display = 'none';
        if (navSchemes) navSchemes.style.display = 'none';
        window.switchTab('billing');
    }
    loadAutoInvoiceNumber();
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', (e) => {
    e.preventDefault();
    currentUser = null;
    localStorage.removeItem('currentUser');

    dashboardView.classList.remove('active-view');
    setTimeout(() => {
        dashboardView.style.display = 'none';
        dashboardView.classList.add('hidden');

        loginView.classList.remove('hidden');
        loginView.style.display = 'flex';
        void loginView.offsetWidth;
        loginView.classList.add('active-view');

        // Reset form
        document.getElementById('loginForm').reset();
    }, 300);
});

// -------------------------------------------------------------
// Reports Handling
// -------------------------------------------------------------
async function loadReports() {
    if (!currentUser) return;

    const tbody = document.getElementById('reportTbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" class="loading-td"><div class="spinner" style="margin: 0 auto; border-top-color: var(--primary);"></div></td></tr>';

    try {
        const querySnapshot = await getDocs(collection(db, "invoices"));

        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No records found.</td></tr>';
            return;
        }

        const allDocs = [];
        querySnapshot.forEach(docSnap => {
            allDocs.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Filter based on User Role & Selection
        let filteredDocs = [];

        if (currentUser.role === 'branch') {
            const userBranchStr = (currentUser.branch || '').trim().toLowerCase();
            filteredDocs = allDocs.filter(d => {
                const bName = (d.branchName || '').trim().toLowerCase();
                return bName === userBranchStr || d.branchId === currentUser.branch;
            });
        } else {
            // Admin or HeadOffice
            const branchSelect = document.getElementById('branchFilter');
            const selectedBranch = branchSelect ? branchSelect.value : 'All';
            if (selectedBranch && selectedBranch !== 'All') {
                const selectedLower = selectedBranch.trim().toLowerCase();
                filteredDocs = allDocs.filter(d => {
                    const bName = (d.branchName || '').trim().toLowerCase();
                    return bName === selectedLower || d.id === selectedBranch;
                });
            } else {
                filteredDocs = allDocs;
            }
        }

        // Date Filtering
        const fromDateInput = document.getElementById('fromDate');
        const toDateInput = document.getElementById('toDate');
        const fromDateVal = fromDateInput ? fromDateInput.value : '';
        const toDateVal = toDateInput ? toDateInput.value : '';

        if (fromDateVal || toDateVal) {
            filteredDocs = filteredDocs.filter(d => {
                const docDateStr = d.billDate || d.date;
                if (!docDateStr) return false;

                const docDate = new Date(docDateStr);
                docDate.setHours(0, 0, 0, 0);

                let isAfterFrom = true;
                let isBeforeTo = true;

                if (fromDateVal) {
                    const fromDate = new Date(fromDateVal);
                    fromDate.setHours(0, 0, 0, 0);
                    isAfterFrom = docDate >= fromDate;
                }

                if (toDateVal) {
                    const toDate = new Date(toDateVal);
                    toDate.setHours(23, 59, 59, 999);
                    isBeforeTo = docDate <= toDate;
                }

                return isAfterFrom && isBeforeTo;
            });
        }

        if (filteredDocs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No records found for this criteria.</td></tr>';
            return;
        }

        // Sort by timestamp descending
        filteredDocs.sort((a, b) => new Date(b.timestamp || b.billDate) - new Date(a.timestamp || a.billDate));

        const showDelete = (currentUser.role === 'admin' || currentUser.role === 'headoffice');

        let html = '';
        filteredDocs.forEach((data) => {
            html += `
                <tr>                    
                    <td>${formatDate(data.billDate)}</td>
                    <td>${data.invoiceNo || ''}</td>
                    <td>${data.loanNo || ''}</td>
                    <td>${data.customerName || ''}</td>
                    <td>₹${Number(data.loanAmount || 0).toLocaleString('en-IN')}</td>
                    <td>₹${Number(data.charges || 0).toLocaleString('en-IN')}</td>
                    <td>₹${Number(data.sgst || 0).toLocaleString('en-IN')}</td>                    
                    <td>₹${Number(data.cgst || 0).toLocaleString('en-IN')}</td>                    
                    <td>₹${Number(data.total || 0).toLocaleString('en-IN')}</td>
                    <td class="hidden">
                        <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
                            <button class="btn-primary" onclick="printInvoice('${data.id}')" title="Print Invoice" style="padding: 4px 8px; font-size: 0.75rem;"><i class="fa-solid fa-print"></i></button>
                            ${showDelete ? `<button class="btn-secondary" onclick="deleteInvoice('${data.id}')" title="Delete Invoice" style="padding: 4px 8px; font-size: 0.75rem; background: var(--error); border: none; color: white;"><i class="fa-solid fa-trash"></i></button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

    } catch (error) {
        console.error("Error loading reports: ", error);
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: var(--error);">Error loading data.</td></tr>';
    }
}


// Populate Branch Filter for Admin
async function populateBranchFilter() {
    try {
        const branchesSnap = await getDocs(collection(db, "branches"));
        const branchSelect = document.getElementById('branchFilter');

        // Keep "All Branches"
        branchSelect.innerHTML = '<option value="All">All Branches</option>';

        const branches = new Set();
        branchesSnap.forEach(doc => {
            if (doc.data().name) {
                branches.add(doc.data().name);
            }
        });

        const sortedBranches = Array.from(branches).sort();
        sortedBranches.forEach(branch => {
            const opt = document.createElement('option');
            opt.value = branch;
            opt.textContent = branch;
            branchSelect.appendChild(opt);
        });

        // Add event listener to reload auto invoice number on change
        branchSelect.addEventListener('change', () => {
            loadAutoInvoiceNumber();
        });

    } catch (error) {
        console.error("Error populating branch filter: ", error);
    }
}

// -------------------------------------------------------------
// Branch Handling
// -------------------------------------------------------------
// branch popup open
const addBranch = document.getElementById('addBranch');
const popup = document.getElementById('branchPopup');

addBranch.addEventListener('click', function () {
    document.getElementById('branchPopupTitle').innerText = 'New Branch';
    document.getElementById('branchDocId').value = '';
    branchForm.reset();
    const nextBillNoBox = document.getElementById('nextBillNoBox');
    if (nextBillNoBox) nextBillNoBox.classList.add('hidden');
    popup.classList.remove('hidden');
});
// popup close
document.getElementById('cancelBranchBtn').addEventListener('click', function () {
    closePopup();
});
function closePopup() {
    popup.classList.add('hidden');
}

// -------------------------------------------------------------
// New Branch & Staff Form Submission
// -------------------------------------------------------------


const autoBillNo = document.getElementById('autoBillNo');

autoBillNo.addEventListener('change', function () {
    if (autoBillNo.value === 'yes') {
        nextBillNoBox.classList.remove('hidden');
    } else {
        nextBillNoBox.classList.add('hidden');
        nextBillNo.value = '';
    }
});


const branchForm = document.getElementById('branchForm');
const addBranchBtn = document.getElementById('addBranchBtn');

branchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const docId = document.getElementById('branchDocId').value;

    const branchName = document.getElementById('branchName').value.trim();
    const branchCode = document.getElementById('branchCode').value.trim();
    const printEnable = document.getElementById('printEnable').value.trim();
    const autoBillNo = document.getElementById('autoBillNo').value.trim();
    const nextBillNo = document.getElementById('nextBillNo').value.trim();


    addBranchBtn.disabled = true;
    addBranchBtn.innerHTML = 'Saving...';

    try {
        if (docId) {
            // ================= EDIT MODE =================
            const docRef = doc(db, "branches", docId);
            await updateDoc(docRef, {
                name: branchName,
                branchCode: branchCode,
                printEnable: printEnable,
                autoBillNo: autoBillNo,
                nextBillNo: nextBillNo,
                updatedAt: new Date()
            });

            alert("Branch updated successfully!");

        } else {
            // ================= ADD NEW MODE =================
            // Check if branch already exists 
            const branchesSnap = await getDocs(query(collection(db, "branches"), where("name", "==", branchName)));
            if (!branchesSnap.empty) {
                alert("Branch already exists!");
                addBranchBtn.disabled = false;
                addBranchBtn.innerHTML = 'Save';
                return;
            }

            await addDoc(collection(db, "branches"), {
                name: branchName,
                branchCode: branchCode,
                printEnable: printEnable,
                autoBillNo: autoBillNo,
                nextBillNo: nextBillNo,
                createdAt: new Date()
            });

            alert("Branch added successfully!");
        }

        branchForm.reset();
        document.getElementById('branchDocId').value = ''; // ID clear 
        closePopup();

        // Refresh Lists & Auto Invoice Number
        if (typeof populateBranchFilter === 'function') populateBranchFilter();
        if (typeof loadBranches === 'function') loadBranches(); // Table reload 
        loadAutoInvoiceNumber();

    } catch (error) {
        console.error("Error saving branch:", error);
        alert("Error saving branch: " + error.message);
    } finally {
        addBranchBtn.disabled = false;
        addBranchBtn.innerHTML = 'Save';
    }
});
//-----------------------------
// branch list table 
//--------------------------------------
async function loadBranches() {
    if (!currentUser) return;

    const tbody = document.getElementById('branchesTbody');
    tbody.innerHTML = '<tr><td colspan="3" class="loading-td"><div class="spinner" style="margin: 0 auto; border-top-color: var(--primary);"></div></td></tr>';

    try {
        const branchesSnap = await getDocs(query(collection(db, "branches")));
        if (branchesSnap.empty) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No branches found.</td></tr>';
            return;
        }
        //sort table (A to Z)
        const sortedBranches = branchesSnap.docs.sort((a, b) => {
            const nameA = a.data().name.toUpperCase();
            const nameB = b.data().name.toUpperCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });


        let html = '';

        sortedBranches.forEach((doc) => {
            const data = doc.data();
            html += `
                <tr>
                    <td>${data.name}</td>
                    <td>${data.branchCode}</td>
                    <td>${data.printEnable}</td>
                    <td>${data.autoBillNo}</td>
                   <td style="display: flex; justify-content: center; align-items: center;"><button class="btn-secondary edit-branch" data-id="${doc.id}" title="Edit"><i class="fa-solid fa-edit"></i></button></td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

    } catch (error) {
        console.error("Error loading branches: ", error);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--error);">Error loading data.</td></tr>';
    }
}
// branch details editing
//-------------------------
document.getElementById('branchesTbody').addEventListener('click', async function (e) {
    const editBtn = e.target.closest('.edit-branch');

    if (editBtn) {
        const docId = editBtn.getAttribute('data-id');


        document.getElementById('branchPopupTitle').innerText = 'Edit Branch';
        document.getElementById('branchDocId').value = docId;
        const row = editBtn.closest('tr');
        const cells = row.querySelectorAll('td');

        document.getElementById('branchName').value = cells[0].innerText;
        document.getElementById('branchCode').value = cells[1].innerText;
        document.getElementById('printEnable').value = cells[2].innerText;
        document.getElementById('autoBillNo').value = cells[3].innerText;


        popup.classList.remove('hidden');
    }
});
branchForm.addEventListener('submit', async (e) => {
    document.getElementById('branchPopupTitle').innerText = 'New Branch';
    document.getElementById('branchDocId').value = '';
    document.getElementById('branchForm').reset();


    popup.classList.remove('hidden');
});

//-----------------------------------------
// user handling
//------------------------------------------

// user popup open
/**********************************/
const addUser = document.getElementById('addUser');
const userpopup = document.getElementById('userPopup');

addUser.addEventListener('click', function () {
    userpopup.classList.remove('hidden');
});
// user popup close
document.getElementById('cancelUserBtn').addEventListener('click', function () {
    closeUserPopup();
});
function closeUserPopup() {
    userpopup.classList.add('hidden');
}

// User Add Form Submission
/********************************************/
const userForm = document.getElementById('userForm');
userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Basic validation
    const username = document.getElementById('newUserName').value.trim();
    const password = document.getElementById('userPassword').value.trim();
    const role = document.getElementById('userRole').value;
    let userBranch = document.getElementById('userBranch').value;

    // if user role is admin or headoffice the branch is not required.
    if (role === 'admin' || role === 'headoffice') {
        userBranch = 'none';
    } else if (role === 'branch' && !userBranch) {
        alert('Branch is required for branch role.');
        return;
    }

    if (!username || !role) {
        alert('All fields are required.');
        return;
    }

    try {
        const docId = document.getElementById('userDocId').value;
        const userData = {
            username: username,
            role: role,
            branch: userBranch
        };

        if (password) {
            userData.password = password;
        }

        if (docId) {
            await updateDoc(doc(db, "users", docId), userData);
            alert('User updated successfully!');
        } else {
            if (!password) {
                alert('Password is required for new users.');
                return;
            }
            const usersCollection = collection(db, "users");
            await addDoc(usersCollection, userData);
            alert('User added successfully!');
        }

        userForm.reset();
        closeUserPopup();
        loadUsers();

    } catch (error) {
        console.error("Error saving user: ", error);
        alert('Error saving user: ' + error.message);
    }
});

// User List table
/**************************************************/
async function loadUsers() {
    const usersCollection = collection(db, "users");
    const userList = document.getElementById("usersTbody");
    userList.innerHTML = ""; // Clear existing rows

    const snapshot = await getDocs(usersCollection);

    for (const docSnap of snapshot.docs) {
        const user = docSnap.data();
        const row = document.createElement("tr");
        const branchName = await getBranchName(user.branch);

        row.innerHTML = `
            <td>${user.username}</td>
            <td>${branchName}</td>
            <td>${user.role}</td>
            <td style="display: flex; justify-content: center; align-items: center;">
                <button class="btn-secondary edit-btn" data-id="${docSnap.id}"><i class="fa-solid fa-edit"></i></button>
            </td>
        `;

        userList.appendChild(row);
    }
}

// edit and delete user
/********************************************/
document.getElementById('usersTbody').addEventListener('click', async function (e) {
    const editBtn = e.target.closest('.edit-btn');

    if (editBtn) {
        const docId = editBtn.getAttribute('data-id');


        document.getElementById('userPopupTitle').innerText = 'Update User';
        document.getElementById('userDocId').value = docId;
        const row = editBtn.closest('tr');
        const cells = row.querySelectorAll('td');

        document.getElementById('newUserName').value = cells[0].innerText;
        document.getElementById('userBranch').value = cells[1].innerText;
        document.getElementById('userRole').value = cells[2].innerText;
        document.getElementById('userPassword').value = '';

        userpopup.classList.remove('hidden');
    }
});
document.getElementById('addUser').addEventListener('click', async (e) => {
    document.getElementById('userPopupTitle').innerText = 'Add New User';
    document.getElementById('userDocId').value = '';
    document.getElementById('userForm').reset();


    userpopup.classList.remove('hidden');
});


// -------------------------------------------------------------
// GST Schemes Management
// -------------------------------------------------------------

const schemePopup = document.getElementById('SchemePopup');
const addSchemeBtn = document.getElementById('addScheme');
const closeSchemeBtn = document.getElementById('closeSchemeBtn');
const cancelSchemeBtn = document.getElementById('cancelSchemeBtn');
const schemeForm = document.getElementById('schemeForm');
const slabsContainer = document.getElementById('slabsContainer');
const addSlabBtn = document.getElementById('addSlabBtn');

let currentSlabCount = 0;
let defaultSchemeCache = null;

if (addSchemeBtn) {
    addSchemeBtn.addEventListener('click', () => {
        schemeForm.reset();
        document.getElementById('schemeDocId').value = '';
        slabsContainer.innerHTML = '';
        addSlabRow(); // add one default empty row
        schemePopup.classList.remove('hidden');
    });
}

if (closeSchemeBtn) {
    closeSchemeBtn.addEventListener('click', () => {
        schemePopup.classList.add('hidden');
    });
}

if (cancelSchemeBtn) {
    cancelSchemeBtn.addEventListener('click', () => {
        schemePopup.classList.add('hidden');
    });
}

if (addSlabBtn) {
    addSlabBtn.addEventListener('click', () => {
        addSlabRow();
    });
}

function addSlabRow(data = {}) {
    currentSlabCount++;
    const rowId = `slab-${currentSlabCount}`;
    const minAmount = data.minAmount !== undefined ? data.minAmount : '';
    const maxAmount = data.maxAmount !== undefined ? data.maxAmount : '';
    const fee = data.fee !== undefined ? data.fee : '';
    const sgst = data.sgst !== undefined ? data.sgst : '';
    const cgst = data.cgst !== undefined ? data.cgst : '';
    const total = data.total !== undefined ? data.total : '';

    const div = document.createElement('div');
    div.className = 'slab-row';
    div.id = rowId;
    div.style.display = 'grid';
    div.style.gridTemplateColumns = 'repeat(6, 1fr) 40px';
    div.style.gap = '0.5rem';
    div.style.alignItems = 'center';

    div.innerHTML = `
        <input type="number" name="minAmount[]" placeholder="Min Amt" value="${minAmount}" required style="padding: 5px; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05); ">
        <input type="number" name="maxAmount[]" placeholder="Max Amt" value="${maxAmount}" required style="padding: 5px; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05);">
        <input type="number" step="0.01" name="fee[]" placeholder="Fee" value="${fee}" required style="padding: 5px; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05);">
        <input type="number" step="0.01" name="sgst[]" placeholder="SGST" value="${sgst}" required style="padding: 5px; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05);">
        <input type="number" step="0.01" name="cgst[]" placeholder="CGST" value="${cgst}" required style="padding: 5px; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05);">
        <input type="number" step="0.01" name="total[]" placeholder="Total" value="${total}" required style="padding: 5px; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05);">
        <button type="button" class="btn-secondary remove-slab-btn" style="padding: 5px; color: #ef4444;" onclick="document.getElementById('${rowId}').remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    slabsContainer.appendChild(div);
}

if (schemeForm) {
    schemeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const docId = document.getElementById('schemeDocId').value;
        const schemeName = document.getElementById('schemeName').value.trim();
        const isDefault = document.getElementById('isDefaultScheme').checked;

        // gather slabs
        const slabRows = document.querySelectorAll('.slab-row');
        if (slabRows.length === 0) {
            alert('Please add at least one slab.');
            return;
        }

        const slabs = [];
        let hasError = false;
        slabRows.forEach(row => {
            const minAmount = parseFloat(row.querySelector('input[name="minAmount[]"]').value);
            const maxAmount = parseFloat(row.querySelector('input[name="maxAmount[]"]').value);
            const fee = parseFloat(row.querySelector('input[name="fee[]"]').value);
            const sgst = parseFloat(row.querySelector('input[name="sgst[]"]').value);
            const cgst = parseFloat(row.querySelector('input[name="cgst[]"]').value);
            const total = parseFloat(row.querySelector('input[name="total[]"]').value);

            if (minAmount > maxAmount) {
                alert('Min amount cannot be greater than max amount.');
                hasError = true;
                return;
            }

            slabs.push({ minAmount, maxAmount, fee, sgst, cgst, total });
        });

        if (hasError) return;

        try {
            // Handle Default Scheme Logic
            if (isDefault) {
                // Find and unset any existing default schemes
                const q = query(collection(db, "gst_schemes"), where("isDefault", "==", true));
                const snap = await getDocs(q);
                snap.forEach(async (d) => {
                    if (d.id !== docId) {
                        await updateDoc(doc(db, "gst_schemes", d.id), { isDefault: false });
                    }
                });
            }

            const schemeData = {
                name: schemeName,
                isDefault: isDefault,
                slabs: slabs,
                updatedAt: new Date()
            };

            if (docId) {
                await updateDoc(doc(db, "gst_schemes", docId), schemeData);
                alert('Scheme updated successfully');
            } else {
                schemeData.createdAt = new Date();
                await addDoc(collection(db, "gst_schemes"), schemeData);
                alert('Scheme added successfully');
            }

            schemePopup.classList.add('hidden');
            loadSchemes();
            fetchDefaultScheme(); // Refresh cache

        } catch (error) {
            console.error("Error saving scheme:", error);
            alert("Error saving scheme: " + error.message);
        }
    });
}

async function loadSchemes() {
    if (!currentUser) return;
    const tbody = document.getElementById('schemesTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="loading-td">Loading data...</td></tr>';

    try {
        const q = query(collection(db, "gst_schemes"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        let html = '';
        if (snapshot.empty) {
            html = '<tr><td colspan="4" style="text-align:center;">No schemes found</td></tr>';
        } else {
            snapshot.forEach((doc) => {
                const data = doc.data();
                html += `
                    <tr>
                        <td>${data.name}</td>
                        <td>${data.isDefault ? '<span style="color: #10b981; font-weight: bold;">Yes</span>' : 'No'}</td>
                        <td>${data.slabs ? data.slabs.length : 0} Slabs</td>
                        <td style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                           <button class="btn-secondary edit-scheme" data-id="${doc.id}" title="Edit"><i class="fa-solid fa-edit"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
        tbody.innerHTML = html;

        // attach edit handlers
        document.querySelectorAll('.edit-scheme').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.currentTarget.getAttribute('data-id');
                // Fetch latest data for this doc
                try {
                    const snap = await getDocs(query(collection(db, "gst_schemes")));
                    let schemeData = null;
                    snap.forEach(d => { if (d.id === docId) schemeData = d.data(); });

                    if (schemeData) {
                        document.getElementById('schemeDocId').value = docId;
                        document.getElementById('schemeName').value = schemeData.name;
                        document.getElementById('isDefaultScheme').checked = schemeData.isDefault;

                        slabsContainer.innerHTML = '';
                        if (schemeData.slabs && schemeData.slabs.length > 0) {
                            schemeData.slabs.forEach(s => addSlabRow(s));
                        } else {
                            addSlabRow();
                        }

                        schemePopup.classList.remove('hidden');
                    }
                } catch (err) {
                    console.error(err);
                }
            });
        });

    } catch (error) {
        console.error("Error loading schemes: ", error);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--error);">Error loading data.</td></tr>';
    }
}

// Fetch default scheme on load to cache it for billing
async function fetchDefaultScheme() {
    try {
        const q = query(collection(db, "gst_schemes"), where("isDefault", "==", true));
        const snap = await getDocs(q);
        if (!snap.empty) {
            defaultSchemeCache = snap.docs[0].data();
        } else {
            defaultSchemeCache = null;
        }
    } catch (err) {
        console.error("Error fetching default scheme", err);
    }
}

// Call on startup
document.addEventListener('DOMContentLoaded', () => {
    fetchDefaultScheme();
});

// Auto Calculate Billing based on Loan Amount
const loanAmountInput = document.getElementById('loanAmount');
if (loanAmountInput) {
    loanAmountInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (isNaN(val) || !defaultSchemeCache || !defaultSchemeCache.slabs) {
            document.getElementById('Charges').value = '';
            document.getElementById('CGST').value = '';
            document.getElementById('SGST').value = '';
            document.getElementById('Total').value = '';
            return;
        }

        // Find matching slab
        let matchedSlab = null;
        for (let slab of defaultSchemeCache.slabs) {
            if (val >= slab.minAmount && val <= slab.maxAmount) {
                matchedSlab = slab;
                break;
            }
        }

        if (matchedSlab) {
            document.getElementById('Charges').value = matchedSlab.fee;
            document.getElementById('CGST').value = matchedSlab.cgst;
            document.getElementById('SGST').value = matchedSlab.sgst;
            document.getElementById('Total').value = matchedSlab.total;
        } else {
            // No matching slab
            document.getElementById('Charges').value = '';
            document.getElementById('CGST').value = '';
            document.getElementById('SGST').value = '';
            document.getElementById('Total').value = '';
        }
    });
}

// Auto Bill Number & Print Management
let activeBranchDocId = null;
let isAutoBillEnabled = false;
let activeBranchPrintEnable = false;
let currentNextBillNoVal = 1;
let currentBranchName = '';

async function loadAutoInvoiceNumber() {
    const invoiceNoInput = document.getElementById('invoiceNo');
    if (!invoiceNoInput) return;

    let userObj = currentUser;
    if (!userObj) {
        const saved = localStorage.getItem('currentUser');
        if (saved) {
            try { userObj = JSON.parse(saved); } catch (e) { }
        }
    }

    let targetBranchName = userObj ? userObj.branch : null;

    // For admin or headoffice users without a fixed branch, check branchFilter dropdown
    if ((!targetBranchName || targetBranchName === 'none') && userObj && userObj.role !== 'branch') {
        const branchFilter = document.getElementById('branchFilter');
        if (branchFilter && branchFilter.value && branchFilter.value !== 'All') {
            targetBranchName = branchFilter.value;
        }
    }

    try {
        const branchesSnap = await getDocs(collection(db, "branches"));
        if (branchesSnap.empty) {
            isAutoBillEnabled = false;
            activeBranchPrintEnable = false;
            activeBranchDocId = null;
            invoiceNoInput.readOnly = false;
            invoiceNoInput.style.backgroundColor = '#ffffff';
            invoiceNoInput.style.color = '#0f172a';
            invoiceNoInput.style.cursor = 'text';
            return;
        }

        let matchedBranchDoc = null;

        if (targetBranchName && targetBranchName !== 'none' && targetBranchName !== 'All') {
            const targetLower = targetBranchName.trim().toLowerCase();
            branchesSnap.forEach((d) => {
                const bData = d.data() || {};
                const nameLower = (bData.name || '').trim().toLowerCase();
                const codeLower = (bData.branchCode || '').trim().toLowerCase();
                if (d.id === targetBranchName || nameLower === targetLower || codeLower === targetLower) {
                    matchedBranchDoc = { id: d.id, ...bData };
                }
            });
        }

        // Fallback: If no specific branch matched yet (e.g. admin viewing billing without selecting a branch), use first branch
        if (!matchedBranchDoc && !branchesSnap.empty) {
            const firstDoc = branchesSnap.docs[0];
            matchedBranchDoc = { id: firstDoc.id, ...firstDoc.data() };
        }

        if (matchedBranchDoc) {
            activeBranchDocId = matchedBranchDoc.id;
            currentBranchName = matchedBranchDoc.name || targetBranchName || 'HeadOffice';
            const autoBillSetting = (matchedBranchDoc.autoBillNo || '').trim().toLowerCase();
            const printSetting = (matchedBranchDoc.printEnable || '').trim().toLowerCase();

            activeBranchPrintEnable = (printSetting === 'yes');

            if (autoBillSetting === 'yes') {
                isAutoBillEnabled = true;

                // Format branch code: e.g. "cgnr" -> "CGNR"
                let code = (matchedBranchDoc.branchCode || matchedBranchDoc.name || 'INV').trim().toUpperCase();

                // Format next bill no: e.g. 1 -> "001"
                let rawNum = parseInt(matchedBranchDoc.nextBillNo, 10);
                if (isNaN(rawNum) || rawNum < 1) {
                    rawNum = 1;
                }
                currentNextBillNoVal = rawNum;

                const formattedNum = String(rawNum).padStart(3, '0');
                const invoiceStr = `${code}/${formattedNum}`;

                invoiceNoInput.value = invoiceStr;
                invoiceNoInput.readOnly = true;
                invoiceNoInput.style.backgroundColor = '#e2e8f0';
                invoiceNoInput.style.color = '#0f172a';
                invoiceNoInput.style.fontWeight = '700';
                invoiceNoInput.style.cursor = 'not-allowed';
            } else {
                isAutoBillEnabled = false;
                invoiceNoInput.readOnly = false;
                invoiceNoInput.style.backgroundColor = '#ffffff';
                invoiceNoInput.style.color = '#0f172a';
                invoiceNoInput.style.cursor = 'text';
            }
        }
    } catch (err) {
        console.error("Error loading auto invoice number:", err);
    }
}
// Function to handle auto printing matching the exact ART Leasing Limited PDF template
function printInvoiceData(data) {
    let printSection = document.getElementById('print-section');
    if (!printSection) {
        printSection = document.createElement('div');
        printSection.id = 'print-section';
        document.body.appendChild(printSection);
    }

    const formatHalf = (copyType) => {
        const totalTax = (Number(data.cgst || 0) + Number(data.sgst || 0)).toFixed(2);
        const rateVal = Number(data.charges || data.taxableAmount || 0).toFixed(2);
        const totalVal = Number(data.total || data.grossProcessingCharge || 0).toFixed(2);
        const dateStr = data.billDate ? formatDate(data.billDate) : (data.date ? formatDate(data.date) : '');
        const loanStr = data.loanNo || data.pledgeNo || '';

        return `
            <div class="receipt-box">
                <div class="copy-badge">${copyType} COPY</div>
                <div class="art-header-box">
                    <h1 class="art-company-name">A R T Leasing Limited</h1>
                    <div class="art-address">Govt.Hospital .JN, M.C Road ,Chengannur</div>
                    <div class="art-domain">admn@artleasingltd.in | www.artleasingltd.in</div>
                    <div class="art-cin-gst">CIN: 12345678925422 &nbsp;&nbsp;&nbsp;&nbsp; GST: 152154215462</div>
                </div>
                
                <div class="art-info-grid">
                    <div class="art-cust-box">
                        <div class="art-field-label">Name & Address of Customer</div>
                        <div class="art-field-value"><strong>${data.customerName || ''}</strong></div>
                    </div>
                    <div class="art-inv-box">
                    <div class="art-info-row"><span>Date :</span> <strong>${dateStr}</strong></div>
                        <div class="art-info-row"><span>Branch :</span> <strong>${data.branchName || ''}</strong></div>                        
                        <div class="art-info-row"><span>Invoice No:</span> <strong>${data.invoiceNo || ''}</strong></div>
                    </div>
                </div>

                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th class="th-desc">Description</th>
                            <th class="th-rate">Rate</th>
                             <th class="th-rate">SGST(9%)</th>
                              <th class="th-rate">CGST(9%)</th>
                            <th class="th-tax">Tax(18%)</th>
                            <th class="th-total">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="item-row">
                            <td class="td-desc">Processing Charges (Loan No: ${loanStr})</td>
                            <td class="td-rate">₹ ${rateVal}</td>
                            <td class="td-sgst">₹ ${totalTax / 2}</td>
                            <td class="td-cgst">₹ ${totalTax / 2}</td>
                             <td class="td-tax">₹ ${totalTax}</td>
                            <td class="td-total">₹ ${totalVal}</td>
                        </tr>
                        <tr class="spacer-row">
                            <td class="td-desc"></td>
                            <td class="td-rate"></td>
                            <td class="td-sgst"></td>
                            <td class="td-cgst"></td>
                            <td class="td-tax"></td>
                            <td class="td-total"></td>
                        </tr>
                        <tr class="grand-total-row">
                            <td colspan="5" class="grand-total-label">Grand Total</td>
                            <td class="grand-total-val">₹ ${totalVal}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="art-footer-box">
                    <div class="art-notes-area"></div>
                    <div class="art-sign-area">Authorised Signatory</div>
                </div>
            </div>
        `;
    };

    const printHTML = `
        ${formatHalf('OFFICE')}
        <div class="tear-line-container">
            <span>&nbsp;&#9986; - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - </span>
        </div>
        ${formatHalf('CUSTOMER')}
    `;

    printSection.innerHTML = printHTML;

    const afterPrintHandler = () => {
        printSection.innerHTML = '';
        window.removeEventListener('afterprint', afterPrintHandler);
    };
    window.addEventListener('afterprint', afterPrintHandler);

    window.print();
}
// ---------------------------------------------------
// Delete Invoice
//---------------------------------------------

window.deleteInvoice = async function (id) {
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    try {
        await deleteDoc(doc(db, "invoices", id));
        alert("Invoice deleted successfully.");
        loadReports();
    } catch (err) {
        console.error("Error deleting invoice:", err);
        alert("Error deleting invoice: " + err.message);
    }
};


// -------------------------------------------------------------
// Billing Form Submission Handler
// -------------------------------------------------------------
const billingForm = document.getElementById('billing-form');
if (billingForm) {
    billingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const saveBtn = document.getElementById('saveInvoiceBtn');
        if (saveBtn) saveBtn.disabled = true;

        const billDate = document.getElementById('billDate').value;
        const invoiceNo = document.getElementById('invoiceNo').value.trim();
        const loanNo = document.getElementById('loanNo').value.trim();
        const customerName = document.getElementById('customerName').value.trim();
        const loanAmount = parseFloat(document.getElementById('loanAmount').value) || 0;
        const charges = parseFloat(document.getElementById('Charges').value) || 0;
        const sgst = parseFloat(document.getElementById('SGST').value) || 0;
        const cgst = parseFloat(document.getElementById('CGST').value) || 0;
        const total = parseFloat(document.getElementById('Total').value) || 0;

        if (!billDate || !invoiceNo || !loanNo || !customerName || loanAmount <= 0) {
            alert("Please fill all required billing fields.");
            if (saveBtn) saveBtn.disabled = false;
            return;
        }

        let branchName = currentBranchName;
        let branchId = activeBranchDocId;

        if (currentUser) {
            if (currentUser.role === 'branch' && currentUser.branch) {
                branchName = currentUser.branch;
            }
        }

        const invoiceData = {
            billDate,
            invoiceNo,
            loanNo,
            customerName,
            loanAmount,
            charges,
            sgst,
            cgst,
            total,
            branchName: branchName || 'HeadOffice',
            branchId: branchId || '',
            timestamp: new Date()
        };

        try {
            await addDoc(collection(db, "invoices"), invoiceData);

            // Update next bill number if auto billing is enabled for active branch
            if (isAutoBillEnabled && activeBranchDocId) {
                try {
                    const branchRef = doc(db, "branches", activeBranchDocId);
                    await updateDoc(branchRef, {
                        nextBillNo: currentNextBillNoVal + 1
                    });
                } catch (updateErr) {
                    console.error("Error updating next bill no:", updateErr);
                }
            }

            alert("Invoice saved successfully!");

            // Print invoice if print is enabled for active branch
            if (activeBranchPrintEnable) {
                await printInvoiceData(invoiceData);
            }

            // Reset form
            billingForm.reset();
            document.getElementById('billDate').value = new Date().toISOString().split('T')[0];
            loadAutoInvoiceNumber();

        } catch (error) {
            console.error("Error saving invoice:", error);
            alert("Error saving invoice: " + error.message);
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    });
}

// Invoice Printing
window.printInvoice = async function (entryId) {
    try {
        const docRef = doc(db, "invoices", entryId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            alert("Invoice data not found.");
            return;
        }
        printInvoiceData(docSnap.data());
    } catch (err) {
        console.error("Error printing invoice:", err);
        alert("Failed to load invoice for printing.");
    }
};

// -------------------------------------------------------------
// Report Controls (Search, Print, Excel Export)
// -------------------------------------------------------------
const searchReportBtn = document.getElementById('searchReportBtn');
if (searchReportBtn) {
    searchReportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loadReports();
    });
}

const fromDateInput = document.getElementById('fromDate');
const toDateInput = document.getElementById('toDate');

// Print Report Table
const printPdfBtn = document.getElementById('printPdfBtn');
if (printPdfBtn) {
    printPdfBtn.addEventListener('click', () => {
        window.print();
    });
}

// Export Report Table to Excel (CSV)
const exportExcelBtn = document.getElementById('exportExcelBtn');
if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', () => {
        const table = document.getElementById('reportTable');
        if (!table) return;

        let csv = [];
        const rows = table.querySelectorAll('tr');

        for (let i = 0; i < rows.length; i++) {
            const row = [], cols = rows[i].querySelectorAll('td, th');
            // Skip action column (last column)
            for (let j = 0; j < cols.length - 1; j++) {
                let text = cols[j].innerText.replace(/"/g, '""').trim();
                row.push('"' + text + '"');
            }
            if (row.length > 0) {
                csv.push(row.join(','));
            }
        }

        const csvFile = new Blob([csv.join('\n')], { type: 'text/csv' });
        const downloadLink = document.createElement('a');
        downloadLink.download = `Invoice_Report_${new Date().toISOString().split('T')[0]}.csv`;
        downloadLink.href = window.URL.createObjectURL(csvFile);
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    });
}
