import { db, collection, addDoc, getDoc, getDocs, query, where, orderBy, doc, setDoc, updateDoc, deleteDoc } from "./db.js";
import { formatDate, getBranchDropList, getBranchName } from "./public.js";

// Toast Notification Function (In-app HTML Alert - 2-3s display)
export function showToast(message, type = 'success', duration = 2500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;

    let iconClass = 'fa-circle-check';
    if (type === 'error' || type === 'danger') iconClass = 'fa-circle-xmark';
    else if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    else if (type === 'info') iconClass = 'fa-circle-info';

    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
        <div class="toast-text">${message}</div>
        <button type="button" class="toast-close"><i class="fa-solid fa-xmark"></i></button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-show');
    });

    // Auto dismiss after 2-3 seconds (default 2.5s)
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }, duration);
}

// Global window.alert override so any popup displays inside HTML for 2-3 seconds
window.alert = function (message) {
    let type = 'info';
    const lower = String(message).toLowerCase();
    if (lower.includes('success') || lower.includes('added') || lower.includes('updated') || lower.includes('deleted')) {
        type = 'success';
    } else if (lower.includes('error') || lower.includes('failed')) {
        type = 'error';
    } else if (lower.includes('required') || lower.includes('cannot') || lower.includes('please')) {
        type = 'warning';
    }
    showToast(message, type, 2500);
};

window.showToast = showToast;

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
        loadDashboardData();
    }
    if (tabName === 'schemes') {
        loadSchemes();
    }
    if (tabName === 'monthlock') {
        loadMonthLocks();
    }
    if (tabName === 'billing') {
        const billDateInput = document.getElementById('billDate');
        if (billDateInput && !billDateInput.value) {
            billDateInput.value = new Date().toISOString().split('T')[0];
        }
        loadAutoInvoiceNumber();
        refreshBillDateLockState();
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
    const navMonthLock = document.getElementById('nav-monthlock');
    const navTrash = document.getElementById('nav-trash');


    if (user.role === 'admin' || user.role === 'headoffice') {
        // Admin/HO can see filter box
        filterBox.style.display = 'flex';
        navDash.style.display = 'flex';
        navBranches.style.display = 'flex';
        navUsers.style.display = 'flex';
        if (navSchemes) navSchemes.style.display = 'flex';
        if (navMonthLock) navMonthLock.style.display = 'flex';
        // Only admin / head office can delete invoices, so only they restore them
        if (navTrash) navTrash.style.display = 'flex';
        populateBranchFilter();
        window.switchTab('dash');
        loadDashboardData();
    } else {
        // Branch
        filterBox.style.display = 'none';
        navDash.style.display = 'none';
        dashboard.classList.add('hidden');
        dashboard.classList.remove('active-tab');
        navBranches.style.display = 'none';
        navUsers.style.display = 'none';
        if (navSchemes) navSchemes.style.display = 'none';
        // Only admin / head office manage month locks
        if (navMonthLock) navMonthLock.style.display = 'none';
        if (navTrash) navTrash.style.display = 'none';
        window.switchTab('billing');
    }

    // Arriving from Trash with a number to re-enter: land on Billing, not here
    if (hasReenterHandoff()) {
        window.switchTab('billing');
    }

    loadAutoInvoiceNumber();
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', (e) => {
    e.preventDefault();
    currentUser = null;
    localStorage.clear();

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
// Business Dashboard Data Calculation & Rendering
// -------------------------------------------------------------
async function loadDashboardData() {
    if (!currentUser) return;

    const dashTotalInvoices = document.getElementById('dashTotalInvoices');
    const dashTotalLoan = document.getElementById('dashTotalLoan');
    const dashTotalGst = document.getElementById('dashTotalGst');
    const dashTotalCharges = document.getElementById('dashTotalCharges');
    const dashBranchTbody = document.getElementById('dashBranchTbody');
    const dashRecentInvoicesTbody = document.getElementById('dashRecentInvoicesTbody');
    const dashBranchCount = document.getElementById('dashBranchCount');

    if (!dashTotalInvoices) return;

    try {
        const [invoicesSnap, branchesSnap] = await Promise.all([
            getDocs(collection(db, "invoices")),
            getDocs(collection(db, "branches"))
        ]);

        const allInvoices = [];
        invoicesSnap.forEach(d => allInvoices.push({ id: d.id, ...d.data() }));

        if (dashBranchCount) {
            dashBranchCount.textContent = `${branchesSnap.size} Branch${branchesSnap.size !== 1 ? 'es' : ''}`;
        }

        let totalLoanSum = 0;
        let totalGstSum = 0;
        let totalChargesSum = 0;

        const branchStats = {};

        allInvoices.forEach(inv => {
            const loan = parseFloat(inv.loanAmount) || 0;
            const sgst = parseFloat(inv.sgst) || 0;
            const cgst = parseFloat(inv.cgst) || 0;
            const charges = parseFloat(inv.charges) || 0;
            const gst = sgst + cgst;

            totalLoanSum += loan;
            totalGstSum += gst;
            totalChargesSum += charges;

            const bName = inv.branchName || 'HeadOffice';
            if (!branchStats[bName]) {
                branchStats[bName] = { count: 0, loan: 0, gst: 0 };
            }
            branchStats[bName].count += 1;
            branchStats[bName].loan += loan;
            branchStats[bName].gst += gst;
        });

        dashTotalInvoices.textContent = allInvoices.length.toLocaleString('en-IN');
        dashTotalLoan.textContent = `₹${totalLoanSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        dashTotalGst.textContent = `₹${totalGstSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        dashTotalCharges.textContent = `₹${totalChargesSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Render Branch Performance
        if (dashBranchTbody) {
            const branchEntries = Object.entries(branchStats);
            if (branchEntries.length === 0) {
                dashBranchTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 1.5rem; color: var(--text-muted);">No branch activity recorded yet.</td></tr>';
            } else {
                let bHtml = '';
                branchEntries.sort((a, b) => a[0].localeCompare(b[0]));
                branchEntries.forEach(([bName, stats]) => {
                    bHtml += `
                        <tr>
                            <td style="font-weight: 600; text-align: left;"><i class="fa-solid fa-building" style="margin-right: 8px; color: #818cf8;"></i>${bName}</td>
                            <td><span class="badge">${stats.count}</span></td>
                            <td style="font-weight: 600;">₹${stats.loan.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td style="color: #34d399; font-weight: 600;">₹${stats.gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                    `;
                });
                dashBranchTbody.innerHTML = bHtml;
            }
        }

        // Render Recent Invoices
        if (dashRecentInvoicesTbody) {
            if (allInvoices.length === 0) {
                dashRecentInvoicesTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 1.5rem; color: var(--text-muted);">No invoices generated yet.</td></tr>';
            } else {
                allInvoices.sort((a, b) => {
                    const dateA = getDocDateMs(a);
                    const dateB = getDocDateMs(b);
                    if (dateA !== dateB) return dateB - dateA;
                    return getDocTimeMs(b) - getDocTimeMs(a);
                });

                const recent = allInvoices.slice(0, 5);
                let rHtml = '';
                recent.forEach(inv => {
                    const dateDisplay = inv.billDate ? formatDate(inv.billDate) : '';
                    const totalVal = parseFloat(inv.total) || 0;
                    rHtml += `
                        <tr>
                            <td style="font-weight: 600; color: #818cf8;">${inv.invoiceNo || '-'}</td>
                            <td style="font-size: 0.8rem; color: var(--text-muted);">${dateDisplay}</td>
                            <td>${inv.customerName || '-'}</td>
                            <td style="font-weight: 700; color: #818cf8;">₹${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                    `;
                });
                dashRecentInvoicesTbody.innerHTML = rHtml;
            }
        }

    } catch (err) {
        console.error("Error loading dashboard data:", err);
    }
}

// -------------------------------------------------------------
// Reports Handling & Date-based Sorting
// -------------------------------------------------------------
let currentReportDocs = [];
let currentBranchCodeMap = new Map();
let reportSortKey = 'date';
let reportSortOrder = 'desc';

function getDocDateMs(doc) {
    const dateStr = doc.billDate || doc.date;
    if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d.getTime();
    }
    if (doc.timestamp) {
        if (typeof doc.timestamp.toDate === 'function') {
            return doc.timestamp.toDate().getTime();
        }
        if (typeof doc.timestamp.seconds === 'number') {
            return doc.timestamp.seconds * 1000;
        }
        const d = new Date(doc.timestamp);
        if (!isNaN(d.getTime())) return d.getTime();
    }
    return 0;
}

function getDocTimeMs(doc) {
    if (doc.timestamp) {
        if (typeof doc.timestamp.toDate === 'function') {
            return doc.timestamp.toDate().getTime();
        }
        if (typeof doc.timestamp.seconds === 'number') {
            return doc.timestamp.seconds * 1000;
        }
        const d = new Date(doc.timestamp);
        if (!isNaN(d.getTime())) return d.getTime();
    }
    return 0;
}

function sortReportDocs(docs, key = 'date', order = 'desc') {
    const dir = order === 'asc' ? 1 : -1;
    return docs.sort((a, b) => {
        if (key === 'date') {
            const dateA = getDocDateMs(a);
            const dateB = getDocDateMs(b);
            if (dateA !== dateB) return (dateA - dateB) * dir;

            const timeA = getDocTimeMs(a);
            const timeB = getDocTimeMs(b);
            if (timeA !== timeB) return (timeA - timeB) * dir;

            return String(a.invoiceNo || '').localeCompare(String(b.invoiceNo || '')) * dir;
        } else if (key === 'invoiceNo') {
            return String(a.invoiceNo || '').localeCompare(String(b.invoiceNo || '')) * dir;
        } else if (key === 'loanNo') {
            return String(a.loanNo || '').localeCompare(String(b.loanNo || '')) * dir;
        } else if (key === 'customerName') {
            return String(a.customerName || '').localeCompare(String(b.customerName || '')) * dir;
        } else if (key === 'loanAmount') {
            return ((parseFloat(a.loanAmount) || 0) - (parseFloat(b.loanAmount) || 0)) * dir;
        } else if (key === 'charges') {
            return ((parseFloat(a.charges) || 0) - (parseFloat(b.charges) || 0)) * dir;
        } else if (key === 'sgst') {
            return ((parseFloat(a.sgst) || 0) - (parseFloat(b.sgst) || 0)) * dir;
        } else if (key === 'cgst') {
            return ((parseFloat(a.cgst) || 0) - (parseFloat(b.cgst) || 0)) * dir;
        } else if (key === 'total') {
            return ((parseFloat(a.total) || 0) - (parseFloat(b.total) || 0)) * dir;
        }
        return 0;
    });
}

function updateSortIcons(activeKey, order) {
    const keys = ['date', 'invoiceNo', 'loanNo', 'customerName', 'loanAmount', 'charges', 'sgst', 'cgst', 'total'];
    keys.forEach(k => {
        const icon = document.getElementById(`sortIcon-${k}`);
        if (icon) {
            if (k === activeKey) {
                icon.className = `fa-solid ${order === 'asc' ? 'fa-sort-up' : 'fa-sort-down'}`;
            } else {
                icon.className = 'fa-solid fa-sort';
            }
        }
    });
}

function renderReportTotals(docs) {
    const tfoot = document.getElementById('reportTfoot');
    if (!tfoot) return;

    if (!docs || docs.length === 0) {
        tfoot.classList.add('hidden');
        return;
    }

    const sum = (key) => docs.reduce((acc, d) => acc + (parseFloat(d[key]) || 0), 0);
    const loanTotal = sum('loanAmount');
    const chargesTotal = sum('charges');
    const sgstTotal = sum('sgst');
    const cgstTotal = sum('cgst');
    const grandTotal = sum('total');

    const fmt = (val) => val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById('totalCountLabel').textContent = `Total (${docs.length} invoice${docs.length !== 1 ? 's' : ''})`;
    document.getElementById('totalLoanAmount').textContent = fmt(loanTotal);
    document.getElementById('totalCharges').textContent = fmt(chargesTotal);
    document.getElementById('totalSgst').textContent = fmt(sgstTotal);
    document.getElementById('totalCgst').textContent = fmt(cgstTotal);

    const grandCell = document.getElementById('totalGrand');
    grandCell.textContent = fmt(grandTotal);
    grandCell.classList.add('grand');

    tfoot.classList.remove('hidden');
}

// Resolve the display form of an invoice number (e.g. "ABC/001").
// Shared by the table renderer and the Excel export so both agree.
function computeDisplayInvoiceNo(data, branchCodeMap) {
    let displayInvoiceNo = (data.invoiceNo || '').trim();
    if (!displayInvoiceNo) return '';

    const parts = displayInvoiceNo.split('/');
    const rawPrefix = parts.length > 1 ? parts[0] : '';
    const rawNum = parts.length > 1 ? parts[1] : parts[0];

    const resolvedCode = (branchCodeMap && branchCodeMap.get(rawPrefix.toLowerCase())) ||
        (branchCodeMap && branchCodeMap.get((data.branchId || '').trim().toLowerCase())) ||
        (branchCodeMap && branchCodeMap.get((data.branchName || '').trim().toLowerCase())) ||
        (data.branchCode || rawPrefix || 'INV');

    return `${String(resolvedCode).toUpperCase()}/${String(rawNum).padStart(3, '0')}`;
}

// Strict dd/mm/yyyy parser. Avoids `new Date("2026-09-15")`, which is parsed as
// UTC and lands on the previous day in negative-offset timezones.
function parseDdMmYyyy(dateStr) {
    if (!dateStr) return null;
    const m = String(dateStr).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        const d = new Date(year, month - 1, day);
        // Reject overflow like 31/02
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
        return d;
    }

    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function renderReportTable(docs, branchCodeMap) {
    const tbody = document.getElementById('reportTbody');
    if (!tbody) return;

    if (!docs || docs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No records found for this criteria.</td></tr>';
        renderReportTotals(docs);
        return;
    }

    const showDelete = (currentUser && (currentUser.role === 'admin' || currentUser.role === 'headoffice'));

    let html = '';
    docs.forEach((data) => {
        const displayInvoiceNo = computeDisplayInvoiceNo(data, branchCodeMap);

        html += `
            <tr>                    
                <td>${formatDate(data.billDate)}</td>
                <td>${displayInvoiceNo}</td>
                <td>${data.loanNo || ''}</td>
                <td>${data.customerName || ''}</td>
                <td>${Number(data.loanAmount || 0).toLocaleString('en-IN')}</td>
                <td>${Number(data.charges || 0).toLocaleString('en-IN')}</td>
                <td>${Number(data.sgst || 0).toLocaleString('en-IN')}</td>                    
                <td>${Number(data.cgst || 0).toLocaleString('en-IN')}</td>                    
                <td>${Number(data.total || 0).toLocaleString('en-IN')}</td>
                <td>
                    <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
                        <button class="btn-primary" onclick="printInvoice('${data.id}')" title="Print Invoice" style="padding: 4px 8px; font-size: 0.75rem;"><i class="fa-solid fa-print"></i></button>
                        ${showDelete ? `<button class="btn-secondary" onclick="deleteInvoice('${data.id}')" title="Delete Invoice" style="padding: 4px 8px; font-size: 0.75rem; background: var(--error); border: none; color: white;"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    renderReportTotals(docs);
    updateSortIcons(reportSortKey, reportSortOrder);
}

window.sortReportTable = function (key) {
    if (reportSortKey === key) {
        reportSortOrder = reportSortOrder === 'desc' ? 'asc' : 'desc';
    } else {
        reportSortKey = key;
        reportSortOrder = (key === 'date' || key === 'total' || key === 'loanAmount') ? 'desc' : 'asc';
    }

    sortReportDocs(currentReportDocs, reportSortKey, reportSortOrder);
    renderReportTable(currentReportDocs, currentBranchCodeMap);
};

async function loadReports() {
    if (!currentUser) return;

    const tbody = document.getElementById('reportTbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" class="loading-td"><div class="spinner" style="margin: 0 auto; border-top-color: var(--primary);"></div></td></tr>';

    try {
        const querySnapshot = await getDocs(collection(db, "invoices"));

        if (querySnapshot.empty) {
            currentReportDocs = [];
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No records found.</td></tr>';
            renderReportTotals([]);
            return;
        }

        const allDocs = [];
        querySnapshot.forEach(docSnap => {
            allDocs.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Build branch map linking branch id, name, and branchCode
        const branchesSnap = await getDocs(collection(db, "branches"));
        const branchMap = new Map();
        const branchCodeMap = new Map();

        branchesSnap.forEach(d => {
            const data = d.data() || {};
            const bId = d.id.trim().toLowerCase();
            const bName = (data.name || '').trim().toLowerCase();
            const bCode = (data.branchCode || data.name || '').trim().toUpperCase();

            if (bCode) {
                branchCodeMap.set(bId, bCode);
                if (bName) branchCodeMap.set(bName, bCode);
                if (data.branchCode) branchCodeMap.set(data.branchCode.trim().toLowerCase(), bCode);
            }

            const identifiers = new Set([bId, bName, (data.branchCode || '').trim().toLowerCase()].filter(Boolean));
            identifiers.forEach(idKey => {
                if (!branchMap.has(idKey)) {
                    branchMap.set(idKey, identifiers);
                } else {
                    identifiers.forEach(val => branchMap.get(idKey).add(val));
                }
            });
        });

        currentBranchCodeMap = branchCodeMap;

        // Filter based on User Role & Selection
        let filteredDocs = [];

        if (currentUser.role === 'branch') {
            const userBranchStr = (currentUser.branch || '').trim().toLowerCase();
            const allowedIdentifiers = branchMap.get(userBranchStr) || new Set([userBranchStr]);

            filteredDocs = allDocs.filter(d => {
                const docBName = (d.branchName || '').trim().toLowerCase();
                const docBId = (d.branchId || '').trim().toLowerCase();
                const docBCode = (d.branchCode || '').trim().toLowerCase();

                return allowedIdentifiers.has(docBName) ||
                    allowedIdentifiers.has(docBId) ||
                    allowedIdentifiers.has(docBCode);
            });
        } else {
            // Admin or HeadOffice
            const branchSelect = document.getElementById('branchFilter');
            const selectedBranch = branchSelect ? branchSelect.value : 'All';
            if (selectedBranch && selectedBranch !== 'All') {
                const selectedLower = selectedBranch.trim().toLowerCase();
                const selectedIdentifiers = branchMap.get(selectedLower) || new Set([selectedLower]);

                filteredDocs = allDocs.filter(d => {
                    const docBName = (d.branchName || '').trim().toLowerCase();
                    const docBId = (d.branchId || '').trim().toLowerCase();
                    const docBCode = (d.branchCode || '').trim().toLowerCase();

                    return selectedIdentifiers.has(docBName) ||
                        selectedIdentifiers.has(docBId) ||
                        selectedIdentifiers.has(docBCode);
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

        const reportSubtitle = document.getElementById('reportSubtitle');
        if (reportSubtitle) {
            const branchSelect = document.getElementById('branchFilter');
            const selectedBranch = branchSelect ? branchSelect.value : 'All';
            if (selectedBranch && selectedBranch !== 'All') {
                reportSubtitle.textContent = `Showing reports for ${selectedBranch}`;
            } else {
                reportSubtitle.textContent = `Showing reports for All Branches`;
            }
            reportSubtitle.classList.remove('hidden');
        }

        if (filteredDocs.length === 0) {
            currentReportDocs = [];
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No records found for this criteria.</td></tr>';
            renderReportTotals([]);
            return;
        }

        // Save current filtered documents and sort by active key (default Date descending)
        currentReportDocs = filteredDocs;
        sortReportDocs(currentReportDocs, reportSortKey, reportSortOrder);

        // Render report table
        renderReportTable(currentReportDocs, currentBranchCodeMap);

    } catch (error) {
        console.error("Error loading reports: ", error);
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: var(--error);">Error loading data.</td></tr>';
    }
}


// Populate Branch Filter for Admin & HeadOffice
async function populateBranchFilter() {
    try {
        const branchesSnap = await getDocs(collection(db, "branches"));
        const branchSelect = document.getElementById('branchFilter');
        if (!branchSelect) return;

        branchSelect.innerHTML = '<option value="All">All Branches</option>';

        const branchList = [];
        branchesSnap.forEach(doc => {
            const bData = doc.data() || {};
            if (bData.name) {
                branchList.push({
                    name: bData.name,
                    id: doc.id,
                    code: bData.branchCode || ''
                });
            }
        });

        // Deduplicate by name and sort
        const uniqueBranches = [];
        const seen = new Set();
        branchList.forEach(b => {
            const key = b.name.trim().toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                uniqueBranches.push(b);
            }
        });

        uniqueBranches.sort((a, b) => a.name.localeCompare(b.name));

        uniqueBranches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.name;
            opt.textContent = b.name;
            branchSelect.appendChild(opt);
        });

        // Attach change listener to update auto invoice number when branch selection changes
        if (!branchSelect.dataset.listenerAttached) {
            branchSelect.addEventListener('change', () => {
                loadAutoInvoiceNumber();
            });
            branchSelect.dataset.listenerAttached = "true";
        }

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

            showToast("Branch updated successfully!", "success");

        } else {
            // ================= ADD NEW MODE =================
            // Check if branch already exists 
            const branchesSnap = await getDocs(query(collection(db, "branches"), where("name", "==", branchName)));
            if (!branchesSnap.empty) {
                showToast("Branch already exists!", "warning");
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

            showToast("Branch added successfully!", "success");
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
        showToast("Error saving branch: " + error.message, "error");
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
        showToast('Branch is required for branch role.', 'warning');
        return;
    }

    if (!username || !role) {
        showToast('All fields are required.', 'warning');
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
            showToast('User updated successfully!', 'success');
        } else {
            if (!password) {
                showToast('Password is required for new users.', 'warning');
                return;
            }
            const usersCollection = collection(db, "users");
            await addDoc(usersCollection, userData);
            showToast('User added successfully!', 'success');
        }

        userForm.reset();
        closeUserPopup();
        loadUsers();

    } catch (error) {
        console.error("Error saving user: ", error);
        showToast('Error saving user: ' + error.message, 'error');
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
            showToast('Please add at least one slab.', 'warning');
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
                showToast('Min amount cannot be greater than max amount.', 'warning');
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
                showToast('Scheme updated successfully', 'success');
            } else {
                schemeData.createdAt = new Date();
                await addDoc(collection(db, "gst_schemes"), schemeData);
                showToast('Scheme added successfully', 'success');
            }

            schemePopup.classList.add('hidden');
            loadSchemes();
            fetchDefaultScheme(); // Refresh cache

        } catch (error) {
            console.error("Error saving scheme:", error);
            showToast("Error saving scheme: " + error.message, "error");
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
let currentBranchCode = '';

// -------------------------------------------------------------
// Re-entering a deleted invoice number
// A number that is not the latest cannot be handed back to the counter,
// so it is carried from the Trash page into this form instead. The
// handoff is one-shot: it is consumed the first time the form loads.
// -------------------------------------------------------------
const REENTER_STORAGE_KEY = 'artReenterInvoice';
let reenterState = null;   // set only while a re-entry is in progress

function splitInvoiceNo(full) {
    const s = String(full || '').trim();
    if (!s) return { prefix: '', numeric: '' };
    const i = s.lastIndexOf('/');
    if (i === -1) return { prefix: '', numeric: s };
    return { prefix: s.slice(0, i).trim(), numeric: s.slice(i + 1).trim() };
}

function setReenterHandoff(payload) {
    try { sessionStorage.setItem(REENTER_STORAGE_KEY, JSON.stringify(payload)); } catch (e) { }
}

function readReenterHandoff() {
    try {
        const raw = sessionStorage.getItem(REENTER_STORAGE_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(REENTER_STORAGE_KEY);   // one-shot
        const p = JSON.parse(raw);
        return (p && p.invoiceNo) ? p : null;
    } catch (e) { return null; }
}

// Checks for a pending re-entry without consuming it, so the landing tab can
// be chosen before the form reads it
function hasReenterHandoff() {
    try {
        const raw = sessionStorage.getItem(REENTER_STORAGE_KEY);
        if (!raw) return false;
        const p = JSON.parse(raw);
        return !!(p && p.invoiceNo);
    } catch (e) { return false; }
}

function clearReenterHandoff() {
    try { sessionStorage.removeItem(REENTER_STORAGE_KEY); } catch (e) { }
}

// Looks up a branch by id, then by name, then by code
async function findBranchDoc({ branchId, branchName, branchCode }) {
    const id = (branchId || '').trim();
    const name = (branchName || '').trim().toLowerCase();
    const code = (branchCode || '').trim().toLowerCase();
    if (!id && !name && !code) return null;

    const snap = await getDocs(collection(db, "branches"));
    let found = null;
    snap.forEach(d => {
        const b = d.data() || {};
        const bId = d.id.trim().toLowerCase();
        const bName = (b.name || '').trim().toLowerCase();
        const bCode = (b.branchCode || '').trim().toLowerCase();
        if ((id && (bId === id.toLowerCase() || d.id === id)) ||
            (name && bName === name) || (code && bCode === code)) {
            found = { id: d.id, ...b };
        }
    });
    return found;
}

// The branch dropdown stores branch names, so pin it to the deleted branch.
// Setting .value does not fire 'change', so this cannot loop back into here.
async function ensureBranchFilterValue(branchName) {
    const sel = document.getElementById('branchFilter');
    if (!sel || !branchName) return;
    const has = () => Array.from(sel.options).some(o => o.value === branchName);
    if (!has()) {
        try { await populateBranchFilter(); } catch (e) { }
    }
    if (has()) sel.value = branchName;
}

// Put the carried-over number into the form and pin it to the deleted branch.
// A re-entry belongs to exactly one branch, so this never falls back to the
// first branch the way the normal admin path does. Returns false when the
// branch cannot be resolved, so the caller can stop instead of saving into the
// wrong branch.
async function applyReenterHandoff(h) {
    const invoiceNoInput = document.getElementById('invoiceNo');
    if (!invoiceNoInput) return false;

    const { prefix, numeric } = splitInvoiceNo(h.invoiceNo);

    let branch = null;
    try {
        branch = await findBranchDoc({ branchId: h.branchId, branchName: h.branchName, branchCode: h.branchCode });
    } catch (err) {
        console.error("Error resolving branch for re-entry:", err);
    }

    if (!branch) return false;

    reenterState = {
        ...h,
        numeric,
        resolvedBranchId: branch.id,
        resolvedBranchName: branch.name || h.branchName || 'HeadOffice',
        resolvedBranchCode: (branch.branchCode || branch.name || prefix || 'INV').trim().toUpperCase()
    };

    activeBranchDocId = reenterState.resolvedBranchId;
    currentBranchName = reenterState.resolvedBranchName;
    currentBranchCode = reenterState.resolvedBranchCode;
    activeBranchPrintEnable = ((branch.printEnable || '').trim().toLowerCase() === 'yes');
    // The number is fixed for this entry, so nothing here may advance the counter
    isAutoBillEnabled = true;
    currentNextBillNoVal = parseInt(numeric, 10) || 0;

    // Keep the original digits exactly, including any zero padding
    invoiceNoInput.value = numeric;
    invoiceNoInput.readOnly = true;
    invoiceNoInput.style.backgroundColor = '#e2e8f0';
    invoiceNoInput.style.color = '#0f172a';
    invoiceNoInput.style.fontWeight = '700';
    invoiceNoInput.style.cursor = 'not-allowed';

    // Show the branch this entry is locked to, so it is never ambiguous
    await ensureBranchFilterValue(reenterState.resolvedBranchName);

    // Lock the branch selector: this entry belongs to the deleted invoice's
    // branch only, so it must not be pointed somewhere else
    const branchSel = document.getElementById('branchFilter');
    if (branchSel) {
        branchSel.disabled = true;
        branchSel.title = `Locked to ${reenterState.resolvedBranchName} for this re-entry`;
    }

    const note = document.getElementById('reenterNote');
    if (note) {
        note.textContent = `Re-entering deleted invoice ${h.invoiceNo} in ${reenterState.resolvedBranchName}. `
            + `Enter the new amount and save - the number stays ${h.invoiceNo}.`;
        note.classList.remove('hidden');
    }
    return true;
}

// Re-assert the pinned branch and number without touching Firestore, so a later
// call (branch dropdown change, branch list refresh) cannot move the entry
// back to the first branch
function reassertReenterPins() {
    if (!reenterState) return;
    const invoiceNoInput = document.getElementById('invoiceNo');
    if (invoiceNoInput) {
        invoiceNoInput.value = reenterState.numeric;
        invoiceNoInput.readOnly = true;
    }
    activeBranchDocId = reenterState.resolvedBranchId || '';
    currentBranchName = reenterState.resolvedBranchName || 'HeadOffice';
    currentBranchCode = reenterState.resolvedBranchCode || 'INV';
    isAutoBillEnabled = true;
    currentNextBillNoVal = parseInt(reenterState.numeric, 10) || 0;
}

// Drop the re-entry hint and release the number back to normal auto numbering
function endReenterMode() {
    reenterState = null;
    clearReenterHandoff();
    const note = document.getElementById('reenterNote');
    if (note) { note.textContent = ''; note.classList.add('hidden'); }
    const branchSel = document.getElementById('branchFilter');
    if (branchSel) { branchSel.disabled = false; branchSel.title = ''; }
}

async function loadAutoInvoiceNumber() {
    const invoiceNoInput = document.getElementById('invoiceNo');
    if (!invoiceNoInput) return;

    // A carried-over number wins over the normal counter
    const handoff = readReenterHandoff();
    if (handoff) {
        const applied = await applyReenterHandoff(handoff);
        if (applied) return;

        // Never fall back to another branch - that would file the invoice wrongly.
        // Cancel the re-entry and hand back a normal, usable form instead.
        showToast(`Could not match a branch for invoice ${handoff.invoiceNo}. `
            + `Re-entry cancelled - re-enter it from that branch.`, "error");
        endReenterMode();
        // fall through to the normal numbering below
    }

    // A re-entry in progress is pinned to the deleted invoice's branch
    if (reenterState) {
        reassertReenterPins();
        return;
    }

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
            currentBranchCode = (matchedBranchDoc.branchCode || matchedBranchDoc.name || 'INV').trim().toUpperCase();
            const autoBillSetting = (matchedBranchDoc.autoBillNo || '').trim().toLowerCase();
            const printSetting = (matchedBranchDoc.printEnable || '').trim().toLowerCase();

            activeBranchPrintEnable = (printSetting === 'yes');

            if (autoBillSetting === 'yes') {
                isAutoBillEnabled = true;

                // Format next bill no: e.g. 1 -> "001"
                let rawNum = parseInt(matchedBranchDoc.nextBillNo, 10);
                if (isNaN(rawNum) || rawNum < 1) {
                    rawNum = 1;
                }
                currentNextBillNoVal = rawNum;

                const formattedNum = String(rawNum).padStart(3, '0');

                // Display only bill number in billing input field
                invoiceNoInput.value = formattedNum;
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
async function getResolvedBranchCode(data) {
    if (data.branchCode && data.branchCode.length < 10) {
        return data.branchCode.trim().toUpperCase();
    }

    try {
        const branchesSnap = await getDocs(collection(db, "branches"));
        let foundCode = '';
        const targetId = (data.branchId || data.branchName || '').trim().toLowerCase();

        branchesSnap.forEach(d => {
            const bData = d.data() || {};
            const bId = d.id.trim().toLowerCase();
            const bName = (bData.name || '').trim().toLowerCase();
            const bCode = (bData.branchCode || '').trim().toLowerCase();

            if (bId === targetId || bName === targetId || bCode === targetId || d.id === data.branchId) {
                foundCode = (bData.branchCode || bData.name || '').trim().toUpperCase();
            }
        });

        if (foundCode) return foundCode;
    } catch (e) {
        console.error("Error resolving branch code:", e);
    }

    if (data.invoiceNo && data.invoiceNo.includes('/')) {
        const prefix = data.invoiceNo.split('/')[0].trim().toUpperCase();
        if (prefix && prefix.length < 10) return prefix;
    }

    return (currentBranchCode || 'INV').trim().toUpperCase();
}

// Function to handle auto printing matching the exact ART Leasing Limited PDF template
async function printInvoiceData(data) {
    let printSection = document.getElementById('print-section');
    if (!printSection) {
        printSection = document.createElement('div');
        printSection.id = 'print-section';
        document.body.appendChild(printSection);
    }

    const branchCodeToUse = await getResolvedBranchCode(data);

    let rawNum = '001';
    if (data.invoiceNo) {
        const parts = String(data.invoiceNo).trim().split('/');
        rawNum = parts.length > 1 ? parts[1] : parts[0];
    }
    const formattedNum = String(rawNum).padStart(3, '0');
    const printInvoiceNo = `${branchCodeToUse}/${formattedNum}`;

    let printBranchName = data.branchName || '';
    if (!printBranchName || printBranchName.length > 15) {
        printBranchName = currentBranchName || branchCodeToUse;
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
                    <div class="art-address">HO:Govt.Hospital .JN, M.C Road ,Chengannur</div>
                    <div class="art-domain">admn@artleasingltd.in | www.artleasingltd.in</div>
                    <div class="art-cin-gst">CIN:U65910KL1990PLC005904 &nbsp;&nbsp; GST:32AACCA6821G2Z3</div>
                </div>
                
                <div class="art-info-grid">
                    <div class="art-cust-box">
                        <div class="art-field-label">Name & Address of Customer</div>
                        <div class="art-field-value"><strong>${data.customerName || ''}</strong></div>
                    </div>
                    <div class="art-inv-box">
                    <div class="art-info-row"><span>Date :</span> <strong>${dateStr}</strong></div>
                        <div class="art-info-row"><span>Branch :</span> <strong>${printBranchName}</strong></div>                        
                        <div class="art-info-row"><span>Invoice No:</span> <strong>${printInvoiceNo}</strong></div>
                    </div>
                </div>

                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th class="th-desc">Description</th>
                            <th class="th-rate">Rate</th>
                             <th class="th-rate">SGST(9%)</th>
                              <th class="th-rate">CGST(9%)</th>
                            <th class="th-total">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="item-row">
                            <td class="th-desc">Processing Charges (Loan No: ${loanStr})</td>
                            <td class="th-rate">₹ ${rateVal}</td>
                            <td class="th-sgst">₹ ${totalTax / 2}</td>
                            <td class="th-cgst">₹ ${totalTax / 2}</td>
                            <td class="th-total">₹ ${totalVal}</td>
                        </tr>
                        <tr class="spacer-row">
                            <td class="th-desc"></td>
                            <td class="th-rate"></td>
                            <td class="th-sgst"></td>
                            <td class="th-cgst"></td>
                            <td class="th-total"></td>
                        </tr>
                        <tr class="grand-total-row">
                            <td colspan="4" class="grand-total-label">Grand Total</td>
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

// Hand a deleted invoice's number back so the same number can be re-entered
// with a corrected amount. The branch counter only ever moves forward, so a
// deleted number would otherwise be burnt for good.
//
// Rolling the counter back is only safe when the deleted invoice is the most
// recent number the counter issued. If it is not, lowering the counter would
// eventually reissue numbers that are still in use, so we leave it alone and
// report "not-latest" so the caller can offer a manual re-entry instead.
async function releaseInvoiceNumber(invoice) {
    const raw = String((invoice && invoice.invoiceNo) || '').trim();
    if (!raw) return { released: null, reason: 'no-number' };

    // Stored as "BRANCHCODE/123" - the counter only governs the numeric part
    const num = parseInt(raw.split('/').pop().trim(), 10);
    if (isNaN(num) || num < 1) return { released: null, reason: 'unparseable' };

    // Resolve the branch from the deleted invoice, never from the billing form,
    // because an invoice can be deleted from a report showing other branches.
    let branchDocId = (invoice.branchId || '').trim();
    if (!branchDocId) {
        const name = (invoice.branchName || '').trim().toLowerCase();
        const code = (invoice.branchCode || '').trim().toLowerCase();
        if (!name && !code) return { released: null, reason: 'unknown-branch' };
        const branchesSnap = await getDocs(collection(db, "branches"));
        branchesSnap.forEach(d => {
            const b = d.data() || {};
            const bName = (b.name || '').trim().toLowerCase();
            const bCode = (b.branchCode || '').trim().toLowerCase();
            if ((name && bName === name) || (code && bCode === code)) branchDocId = d.id;
        });
    }
    if (!branchDocId) return { released: null, reason: 'unknown-branch' };

    const branchRef = doc(db, "branches", branchDocId);
    const snap = await getDoc(branchRef);
    if (!snap.exists()) return { released: null, reason: 'unknown-branch' };

    const branch = snap.data() || {};
    // Only branches that auto-number can hand a number back
    if ((branch.autoBillNo || '').trim().toLowerCase() !== 'yes') {
        return { released: null, reason: 'manual-numbering', num };
    }

    const next = parseInt(branch.nextBillNo, 10);
    if (isNaN(next) || next - 1 !== num) {
        return { released: null, reason: 'not-latest', num, next };
    }

    await updateDoc(branchRef, { nextBillNo: num });
    return { released: num, reason: 'released', num, next };
}

window.deleteInvoice = async function (id) {
    // Find the invoice in the loaded report rows, else read it from Firestore
    let invoice = (currentReportDocs || []).find(d => d.id === id) || null;
    if (!invoice) {
        try {
            const snap = await getDoc(doc(db, "invoices", id));
            if (snap.exists()) invoice = snap.data();
        } catch (err) {
            console.error("Error loading invoice for delete check:", err);
        }
    }

    // Without the invoice body we cannot archive it, so refuse rather than lose it
    if (!invoice) {
        showToast("Could not read this invoice. Refresh and try again.", "error");
        return;
    }

    const billDate = invoice.billDate || invoice.date;

    // Verify the lock against fresh data, not the cached map, so a month locked in
    // another tab still blocks the delete. If the check itself fails we deny.
    let locked;
    try {
        locked = await isMonthLockedFresh(billDate);
    } catch (err) {
        console.error("Error checking month lock:", err);
        showToast("Could not verify month locks. Deletion blocked - try again.", "error");
        return;
    }

    if (locked) {
        const label = monthLabelFromKey(monthKeyFromDate(billDate));
        showToast(`${label} is locked. Unlock it in Settings > Month Lock to delete invoices.`, "warning");
        return;
    }

    if (!confirm("Are you sure you want to delete this invoice?")) return;
    try {
        // Soft delete: archive a restorable copy under the same id, then drop the original
        const payload = { ...invoice };
        delete payload.id;

        await setDoc(doc(db, "deleted_invoices", id), {
            ...payload,
            originalId: id,
            deletedAt: new Date(),
            deletedBy: (currentUser && currentUser.username) ? currentUser.username : ''
        });
        await deleteDoc(doc(db, "invoices", id));

        // Give the number back so it can be re-entered with a new amount
        let outcome = { released: null, reason: 'unknown' };
        try {
            outcome = await releaseInvoiceNumber(invoice) || outcome;
        } catch (releaseErr) {
            console.error("Error releasing invoice number:", releaseErr);
        }

        if (outcome.released) {
            const numStr = String(outcome.released).padStart(3, '0');
            showToast(`Invoice ${numStr} deleted. Number ${numStr} is free - re-enter it with the new amount.`, "success");
        } else if (outcome.reason === 'not-latest') {
            // The number is below the counter, so it will not be offered again on
            // its own. Ask whether a copy was issued, because that decides whether
            // re-using the number is acceptable at all.
            await handleNotLatestDelete(invoice, id, outcome);
        } else {
            showToast("Invoice deleted. Restore it from Settings > Trash.", "success");
        }

        loadReports();
        loadDashboardData();
        loadAutoInvoiceNumber();
    } catch (err) {
        console.error("Error deleting invoice:", err);
        showToast("Error deleting invoice: " + err.message, "error");
    }
};

// A number that is not the latest cannot go back on the counter, so offer the
// re-entry path. The user decides case by case, because re-using a number whose
// copy has already reached a customer is a duplicate-number problem.
async function handleNotLatestDelete(invoice, id, outcome) {
    const numStr = String(outcome.num).padStart(3, '0');
    const full = String(invoice.invoiceNo || '').trim();

    const copyIssued = confirm(
        `Invoice ${numStr} is not the most recent number, so ${numStr} will NOT be offered automatically again.\n\n` +
        `Has a printed or given copy of invoice ${numStr} already reached the customer?\n\n` +
        `OK = YES, a copy was issued\n` +
        `     Keep ${numStr} in Trash with its original amount. Do not re-use the number.\n\n` +
        `Cancel = NO copy was issued\n` +
        `     Open Billing to re-enter ${numStr} with a new amount.`
    );

    if (copyIssued) {
        showToast(`Invoice ${numStr} deleted. Kept in Trash - number not re-used.`, "success");
        return;
    }

    // Only carry the entry over if its branch resolves, otherwise the form would
    // have to guess a branch and the invoice would be filed against the wrong one
    let branch = null;
    try {
        branch = await findBranchDoc({
            branchId: invoice.branchId,
            branchName: invoice.branchName,
            branchCode: invoice.branchCode
        });
    } catch (err) {
        console.error("Error resolving branch for re-entry:", err);
    }
    if (!branch) {
        showToast(`Could not match a branch for invoice ${numStr}. `
            + `It is kept in Trash - re-enter it from that branch.`, "error");
        return;
    }

    setReenterHandoff({
        invoiceNo: full,
        trashId: id,
        branchId: branch.id,
        branchName: branch.name || invoice.branchName || '',
        branchCode: (branch.branchCode || branch.name || '').trim()
    });
    showToast(`Opening Billing to re-enter ${numStr} in ${branch.name}. Enter the new amount and save.`, "success");
    if (typeof window.switchTab === 'function') window.switchTab('billing');
}


// -------------------------------------------------------------
// Month Lock
// Locks are stored in the "month_locks" collection, one doc per month.
// The doc id is the month key "YYYY-MM"; data: { month, locked, lockedAt, lockedBy }
// -------------------------------------------------------------
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

let monthLocks = new Map(); // "YYYY-MM" -> { locked, lockedAt, lockedBy }

// "2026-09-28" -> "2026-09"
function monthKeyFromDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthKeyFromParts(year, monthIndex) {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key) {
    const [y, m] = key.split('-');
    const idx = parseInt(m, 10) - 1;
    if (!y || isNaN(idx) || idx < 0 || idx > 11) return key;
    return `${MONTH_NAMES[idx]} ${y}`;
}

function isMonthLocked(dateStr) {
    const key = monthKeyFromDate(dateStr);
    if (!key) return false;
    const entry = monthLocks.get(key);
    return !!(entry && entry.locked);
}

// Reads the month_locks collection into a fresh map. Throws on failure so that
// callers guarding a destructive action can deny instead of assuming "unlocked".
async function readMonthLocks() {
    const snap = await getDocs(collection(db, "month_locks"));
    const next = new Map();
    snap.forEach(d => {
        const data = d.data() || {};
        const key = (data.month || d.id || '').trim();
        if (!/^\d{4}-\d{2}$/.test(key)) return;
        next.set(key, {
            locked: data.locked === true,
            lockedAt: data.lockedAt || null,
            lockedBy: data.lockedBy || ''
        });
    });
    return next;
}

// Authoritative check for destructive actions: re-reads locks so a lock set in
// another tab is honoured, and refuses to answer "unlocked" if the read fails.
async function isMonthLockedFresh(dateStr) {
    const key = monthKeyFromDate(dateStr);
    if (!key) return false;

    const fresh = await readMonthLocks();
    monthLocks = fresh;

    const entry = fresh.get(key);
    return !!(entry && entry.locked);
}

async function fetchMonthLocks() {
    try {
        monthLocks = await readMonthLocks();
    } catch (err) {
        console.error("Error fetching month locks:", err);
    }
}

// Reflect the lock state of the currently chosen bill date on the form
function refreshBillDateLockState() {
    const billDateInput = document.getElementById('billDate');
    const saveBtn = document.getElementById('saveInvoiceBtn');
    if (!billDateInput) return;

    const locked = isMonthLocked(billDateInput.value);
    const note = document.getElementById('billDateLockNote');
    const box = billDateInput.closest('.input-box');

    if (box) box.classList.toggle('locked-date', locked);
    if (note) {
        note.textContent = locked
            ? `${monthLabelFromKey(monthKeyFromDate(billDateInput.value))} is locked. Unlock it in Settings > Month Lock to save invoices.`
            : '';
        note.classList.toggle('hidden', !locked);
    }
    if (saveBtn) saveBtn.disabled = locked;
}

// -------------------------------------------------------------
// Month Lock Tab Rendering
// -------------------------------------------------------------
// Years added with the "Add Year" button. The default range only reaches one
// year ahead of today, and a lockdown may be needed further out, so these are
// remembered here and merged into the list on every rebuild.
const extraLockYears = new Set();

// Default range plus any added years, newest first
function lockYearOptions() {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear + 1; y >= currentYear - 2; y--) years.push(y);
    extraLockYears.forEach(y => {
        if (!years.includes(y)) years.push(y);
    });
    return years.sort((a, b) => b - a);
}

// Rebuilds the dropdown. Without an explicit year the current selection is
// kept, so reopening the tab does not jump back to the current year.
function renderLockYearSelect(preferredYear) {
    const select = document.getElementById('lockYearSelect');
    if (!select) return;

    const currentYear = new Date().getFullYear();
    const years = lockYearOptions();
    const wanted = preferredYear !== undefined ? parseInt(preferredYear, 10) : parseInt(select.value, 10);
    const selected = years.includes(wanted) ? wanted : currentYear;

    select.innerHTML = '';
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === selected) opt.selected = true;
        select.appendChild(opt);
    });
}

function populateLockYearSelect() {
    renderLockYearSelect();
}

// Adds the year after the highest one currently listed and shows it
function addLockYear() {
    const years = lockYearOptions();
    const next = years[0] + 1;

    if (extraLockYears.has(next)) {
        showToast(`${next} is already the highest year in the list.`, "warning");
        return;
    }

    extraLockYears.add(next);
    renderLockYearSelect(next);
    renderMonthLockGrid();
    showToast(`${next} added to the year list.`, "success");
}

async function loadMonthLocks() {
    if (!currentUser) return;

    const grid = document.getElementById('monthLockGrid');
    if (!grid) return;

    populateLockYearSelect();
    grid.innerHTML = '<div class="loading-td">Loading months...</div>';

    await fetchMonthLocks();
    renderMonthLockGrid();
}

function renderMonthLockGrid() {
    const grid = document.getElementById('monthLockGrid');
    const yearSelect = document.getElementById('lockYearSelect');
    const badge = document.getElementById('lockCountBadge');
    if (!grid) return;

    const year = yearSelect ? parseInt(yearSelect.value, 10) : new Date().getFullYear();
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    let html = '';
    MONTH_NAMES.forEach((name, idx) => {
        const key = monthKeyFromParts(year, idx);
        const entry = monthLocks.get(key);
        const locked = !!(entry && entry.locked);

        const isFuture = year > currentYear || (year === currentYear && idx > currentMonth);

        let statusHtml = '';
        if (locked) {
            const by = entry.lockedBy ? ` by ${entry.lockedBy}` : '';
            statusHtml = `<span class="ml-locked"><i class="fa-solid fa-lock"></i> Locked${by}</span>`;
        } else if (isFuture) {
            statusHtml = '<span class="ml-future">Upcoming</span>';
        } else {
            statusHtml = '<span class="ml-open"><i class="fa-solid fa-lock-open"></i> Open</span>';
        }

        const btnLabel = locked ? 'Unlock' : 'Lock';
        const btnClass = locked ? 'btn-unlock' : 'btn-lock';
        const btnIcon = locked ? 'fa-lock-open' : 'fa-lock';

        html += `
            <div class="month-lock-item ${locked ? 'is-locked' : ''}">
                <div class="ml-name">${name} ${year}</div>
                <div class="ml-status">${statusHtml}</div>
                <button class="btn-secondary ${btnClass}" data-month="${key}" data-locked="${locked}">
                    <i class="fa-solid ${btnIcon}"></i> ${btnLabel}
                </button>
            </div>
        `;
    });

    grid.innerHTML = html;

    if (badge) {
        let lockedCount = 0;
        monthLocks.forEach(e => { if (e.locked) lockedCount++; });
        badge.textContent = `${lockedCount} Locked`;
    }

    refreshBillDateLockState();
}

document.getElementById('monthLockGrid')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-month]');
    if (!btn) return;

    const monthKey = btn.getAttribute('data-month');
    const wasLocked = btn.getAttribute('data-locked') === 'true';
    const label = monthLabelFromKey(monthKey);

    if (!wasLocked) {
        const ok = confirm(`Lock ${label}?\n\nNew invoices cannot be saved in this month until it is unlocked.`);
        if (!ok) return;
    }

    btn.disabled = true;
    try {
        await setDoc(doc(db, "month_locks", monthKey), {
            month: monthKey,
            locked: !wasLocked,
            lockedAt: wasLocked ? null : new Date(),
            lockedBy: wasLocked ? '' : (currentUser && currentUser.username ? currentUser.username : '')
        }, { merge: true });

        await fetchMonthLocks();
        renderMonthLockGrid();
        showToast(
            wasLocked ? `${label} unlocked.` : `${label} locked.`,
            wasLocked ? 'success' : 'warning'
        );
    } catch (err) {
        console.error("Error updating month lock:", err);
        showToast("Error updating month lock: " + err.message, "error");
        renderMonthLockGrid();
    }
});

const lockYearSelect = document.getElementById('lockYearSelect');
if (lockYearSelect) {
    lockYearSelect.addEventListener('change', renderMonthLockGrid);
}

const addLockYearBtn = document.getElementById('addLockYearBtn');
if (addLockYearBtn) {
    addLockYearBtn.addEventListener('click', addLockYear);
}

const billDateInputForLock = document.getElementById('billDate');
if (billDateInputForLock) {
    billDateInputForLock.addEventListener('change', refreshBillDateLockState);
}

// Load locks once at startup so billing can enforce them immediately
document.addEventListener('DOMContentLoaded', () => {
    fetchMonthLocks().then(() => refreshBillDateLockState());
});


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
            showToast("Please fill all required billing fields.", "warning");
            if (saveBtn) saveBtn.disabled = false;
            return;
        }

        // Enforce month lock: no new invoice may be saved in a locked month.
        // Checked against fresh data, and a failed check denies the save.
        let monthLocked;
        try {
            monthLocked = await isMonthLockedFresh(billDate);
        } catch (err) {
            console.error("Error checking month lock:", err);
            if (saveBtn) saveBtn.disabled = false;
            showToast("Could not verify month locks. Save blocked - try again.", "error");
            return;
        }

        if (monthLocked) {
            const label = monthLabelFromKey(monthKeyFromDate(billDate));
            showToast(`${label} is locked. Unlock it in Settings > Month Lock to save invoices.`, "warning");
            if (saveBtn) saveBtn.disabled = false;
            refreshBillDateLockState();
            return;
        }

        let branchName = currentBranchName;
        let branchId = activeBranchDocId;
        let branchCode = currentBranchCode;

        // Format full invoice number for database saving, printing, and reports: "branchcode/number"
        let fullInvoiceNo = invoiceNo;
        if (!fullInvoiceNo.includes('/')) {
            const codeToUse = (branchCode || 'INV').toUpperCase();
            const formattedNum = fullInvoiceNo.padStart(3, '0');
            fullInvoiceNo = `${codeToUse}/${formattedNum}`;
        }

        const invoiceData = {
            billDate,
            invoiceNo: fullInvoiceNo,
            loanNo,
            customerName,
            loanAmount,
            charges,
            sgst,
            cgst,
            total,
            branchName: branchName || 'HeadOffice',
            branchId: branchId || '',
            branchCode: branchCode || '',
            timestamp: new Date()
        };

        try {
            await addDoc(collection(db, "invoices"), invoiceData);

            // Advance the counter only for a normal entry. A re-entered number is
            // below the counter, so bumping here would burn the next number.
            if (isAutoBillEnabled && activeBranchDocId && !reenterState) {
                try {
                    const branchRef = doc(db, "branches", activeBranchDocId);
                    await updateDoc(branchRef, {
                        nextBillNo: currentNextBillNoVal + 1
                    });
                } catch (updateErr) {
                    console.error("Error updating next bill no:", updateErr);
                }
            }

            if (reenterState) {
                // The number is live again, so retire the trashed copy of it
                if (reenterState.trashId) {
                    try {
                        await deleteDoc(doc(db, "deleted_invoices", reenterState.trashId));
                    } catch (trashErr) {
                        console.error("Error clearing trashed copy after re-entry:", trashErr);
                    }
                }
                showToast(`${fullInvoiceNo} re-entered with the new amount.`, "success");
                endReenterMode();
            } else {
                showToast("Invoice saved successfully!", "success");
            }

            // Print invoice if print is enabled for active branch
            if (activeBranchPrintEnable) {
                await printInvoiceData(invoiceData);
            }

            // Reset form
            billingForm.reset();
            document.getElementById('billDate').value = new Date().toISOString().split('T')[0];
            loadAutoInvoiceNumber();
            loadDashboardData();
            refreshBillDateLockState();

        } catch (error) {
            console.error("Error saving invoice:", error);
            showToast("Error saving invoice: " + error.message, "error");
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
            showToast("Invoice data not found.", "error");
            return;
        }
        await printInvoiceData(docSnap.data());
    } catch (err) {
        console.error("Error printing invoice:", err);
        showToast("Failed to load invoice for printing.", "error");
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

// Builds the report rows from data (not from the rendered HTML) so the date
// column is written as a real Excel date and the amount columns as real numbers.
function buildReportAoa(docs, branchCodeMap) {
    const header = ['Date', 'Invoice No', 'Loan No', 'Customer',
        'Loan Amount', 'Charges', 'SGST', 'CGST', 'Total'];

    const aoa = [header];

    docs.forEach((d) => {
        const displayDate = formatDate(d.billDate);
        aoa.push([
            parseDdMmYyyy(displayDate) || displayDate,   // Date object, or raw text if unparseable
            computeDisplayInvoiceNo(d, branchCodeMap),
            d.loanNo || '',
            d.customerName || '',
            parseFloat(d.loanAmount) || 0,
            parseFloat(d.charges) || 0,
            parseFloat(d.sgst) || 0,
            parseFloat(d.cgst) || 0,
            parseFloat(d.total) || 0
        ]);
    });

    // Totals row, matching the sticky footer shown on screen
    const sum = (key) => docs.reduce((acc, d) => acc + (parseFloat(d[key]) || 0), 0);
    aoa.push([
        `Total (${docs.length} invoice${docs.length !== 1 ? 's' : ''})`, '', '', '',
        sum('loanAmount'), sum('charges'), sum('sgst'), sum('cgst'), sum('total')
    ]);

    return aoa;
}

const REPORT_DATE_FORMAT = 'dd/mm/yyyy';
const REPORT_MONEY_FORMAT = '#,##0.00';

function styleReportSheet(ws) {
    if (!ws || !ws['!ref']) return;

    const range = XLSX.utils.decode_range(ws['!ref']);
    const lastRow = range.e.r;
    const totalsRowIndex = Math.max(lastRow, 1);

    for (let R = range.s.r; R <= lastRow; R++) {
        const dateCell = ws[XLSX.utils.encode_cell({ r: R, c: 0 })];
        if (dateCell && dateCell.t === 'd') dateCell.z = REPORT_DATE_FORMAT;

        // Money columns E..I (index 4..8)
        for (let C = 4; C <= 8; C++) {
            const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            if (cell && cell.t === 'n') cell.z = REPORT_MONEY_FORMAT;
        }
    }

    // Bold the totals row
    for (let C = 0; C <= 8; C++) {
        const addr = XLSX.utils.encode_cell({ r: totalsRowIndex, c: C });
        const cell = ws[addr];
        if (cell) cell.s = Object.assign({}, cell.s, { font: { bold: true } });
    }

    ws['!cols'] = [
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 26 },
        { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }
    ];
}

// Export Report to Excel (.xlsx / .xls)
const exportExcelBtn = document.getElementById('exportExcelBtn');
if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', () => {
        const docs = currentReportDocs || [];
        if (docs.length === 0) {
            showToast("Nothing to export for this criteria.", "warning");
            return;
        }

        const fileName = `Invoice_Report_${new Date().toISOString().split('T')[0]}`;
        const aoa = buildReportAoa(docs, currentBranchCodeMap);

        if (typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: REPORT_DATE_FORMAT });
            styleReportSheet(ws);
            XLSX.utils.book_append_sheet(wb, ws, "Invoice Report");
            XLSX.writeFile(wb, `${fileName}.xlsx`);
        } else {
            // Fallback: Excel XML/HTML Blob (.xls)
            const esc = (s) => String(s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const pad = (n) => String(n).padStart(2, '0');
            const fmtMoney = (n) => n.toLocaleString('en-IN', {
                minimumFractionDigits: 2, maximumFractionDigits: 2
            });
            const fmtDateOut = (v) => (v instanceof Date && !isNaN(v.getTime()))
                ? `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`
                : v;

            let htmlTable = '<html><head><meta charset="utf-8"></head><body><table border="1">';
            aoa.forEach((row, ri) => {
                htmlTable += '<tr>';
                row.forEach((cell) => {
                    if (ri === 0) {
                        htmlTable += `<th style="background-color: #4f46e5; color: #ffffff;">${esc(cell)}</th>`;
                    } else {
                        const isText = typeof cell === 'string';
                        const value = isText ? esc(cell) : (typeof cell === 'number' ? fmtMoney(cell) : esc(fmtDateOut(cell)));
                        const style = ri === aoa.length - 1 ? ' style="font-weight:bold; background:#eef2ff;"' : '';
                        htmlTable += `<td${style}>${value}</td>`;
                    }
                });
                htmlTable += '</tr>';
            });
            htmlTable += '</table></body></html>';

            const blob = new Blob([htmlTable], { type: 'application/vnd.ms-excel' });
            const downloadLink = document.createElement('a');
            downloadLink.download = `${fileName}.xls`;
            downloadLink.href = window.URL.createObjectURL(blob);
            downloadLink.style.display = 'none';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(downloadLink.href);
        }
    });
}
