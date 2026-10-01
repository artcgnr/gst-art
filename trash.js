import { db, collection, getDocs, query, where, setDoc, deleteDoc, doc } from "./db.js";
import { formatDate } from "./public.js";

let currentUser = null;
let currentTrashDocs = [];

// Metadata the delete flow adds on top of the original invoice body
const TRASH_META_KEYS = ['originalId', 'deletedAt', 'deletedBy'];

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtMoney = (val) => (parseFloat(val) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
});

// Firestore Timestamps, Date objects and plain strings all show up here
function formatTimestamp(value) {
    if (!value) return '';
    let d;
    if (typeof value.toDate === 'function') d = value.toDate();
    else if (typeof value.seconds === 'number') d = new Date(value.seconds * 1000);
    else d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

// "2026-09" -> "September 2026", so the restore path can reuse the same month-lock rules
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

function monthKeyFromDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key) {
    const [y, m] = key.split('-');
    const idx = parseInt(m, 10) - 1;
    if (!y || isNaN(idx) || idx < 0 || idx > 11) return key;
    return `${MONTH_NAMES[idx]} ${y}`;
}

// Returns the month key of every locked month, so restore can respect the same rule as delete
async function fetchLockedMonths() {
    const locked = new Set();
    try {
        const snap = await getDocs(collection(db, "month_locks"));
        snap.forEach(d => {
            const data = d.data() || {};
            const key = (data.month || d.id || '').trim();
            if (data.locked === true && /^\d{4}-\d{2}$/.test(key)) locked.add(key);
        });
    } catch (err) {
        // A read failure must not silently allow writes into a locked month
        console.error("Error fetching month locks:", err);
        throw err;
    }
    return locked;
}

function showToast(message, type = 'success') {
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
        <div class="toast-text">${esc(message)}</div>
        <button type="button" class="toast-close"><i class="fa-solid fa-xmark"></i></button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
    }, 3200);
}

// -------------------------------------------------------------
// Session
// -------------------------------------------------------------
(function initSession() {
    const saved = localStorage.getItem('currentUser');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    try {
        currentUser = JSON.parse(saved);
    } catch (e) {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
        return;
    }

    // Deleting invoices is an admin / head office action, so restoring them is too
    if (currentUser.role !== 'admin' && currentUser.role !== 'headoffice') {
        window.location.href = 'index.html';
        return;
    }

    const filterBox = document.getElementById('adminFilterBox');
    if (filterBox) filterBox.style.display = 'flex';

    populateBranchFilter();
    loadTrash();
})();

// -------------------------------------------------------------
// Branch filter
// -------------------------------------------------------------
async function populateBranchFilter() {
    const branchSelect = document.getElementById('branchFilter');
    if (!branchSelect) return;

    try {
        const branchesSnap = await getDocs(collection(db, "branches"));
        branchSelect.innerHTML = '<option value="All">All Branches</option>';

        const seen = new Set();
        const list = [];
        branchesSnap.forEach(d => {
            const data = d.data() || {};
            if (!data.name) return;
            const key = data.name.trim().toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            list.push(data.name.trim());
        });
        list.sort((a, b) => a.localeCompare(b));

        list.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            branchSelect.appendChild(opt);
        });
    } catch (error) {
        console.error("Error populating branch filter: ", error);
    }
}

// -------------------------------------------------------------
// Data
// -------------------------------------------------------------
async function loadTrash() {
    if (!currentUser) return;

    const tbody = document.getElementById('trashTbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="loading-td"><div class="spinner" style="margin: 0 auto; border-top-color: var(--primary);"></div></td></tr>';

    try {
        const trashSnap = await getDocs(collection(db, "deleted_invoices"));

        const allDocs = [];
        trashSnap.forEach(d => {
            const data = d.data() || {};
            allDocs.push({
                trashId: d.id,
                originalId: data.originalId || d.id,
                deletedAt: data.deletedAt || null,
                deletedBy: data.deletedBy || '',
                ...data
            });
        });

        // Newest deletion first
        allDocs.sort((a, b) => {
            const ta = toDate(a.deletedAt);
            const tb = toDate(b.deletedAt);
            return (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
        });

        let filtered = allDocs;

        // Branch filter (admin / head office)
        const branchSelect = document.getElementById('branchFilter');
        const selected = branchSelect ? branchSelect.value : 'All';
        if (selected && selected !== 'All') {
            const target = selected.trim().toLowerCase();
            filtered = filtered.filter(d => ((d.branchName || '').trim() || 'HeadOffice').toLowerCase() === target);
        }

        // Date range filter, applied to when the invoice was deleted
        const fromVal = document.getElementById('fromDate')?.value || '';
        const toVal = document.getElementById('toDate')?.value || '';

        if (fromVal || toVal) {
            filtered = filtered.filter(d => {
                const del = toDate(d.deletedAt);
                if (!del) return false;
                del.setHours(0, 0, 0, 0);

                if (fromVal) {
                    const from = new Date(fromVal);
                    if (isNaN(from.getTime())) return false;
                    from.setHours(0, 0, 0, 0);
                    if (del < from) return false;
                }
                if (toVal) {
                    const to = new Date(toVal);
                    if (isNaN(to.getTime())) return false;
                    to.setHours(23, 59, 59, 999);
                    if (del > to) return false;
                }
                return true;
            });
        }

        currentTrashDocs = filtered;
        renderTrash(filtered);
    } catch (error) {
        console.error("Error loading trash: ", error);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: var(--error);">Error loading data.</td></tr>';
    }
}

// -------------------------------------------------------------
// Render
// -------------------------------------------------------------
function getSelectedDateRangeLabel() {
    const fromVal = document.getElementById('fromDate')?.value || '';
    const toVal = document.getElementById('toDate')?.value || '';
    const fmt = (v) => { const d = new Date(v); return isNaN(d.getTime()) ? v : formatDate(v); };

    if (fromVal && toVal) return `Deleted from ${fmt(fromVal)} to ${fmt(toVal)}`;
    if (fromVal) return `Deleted from ${fmt(fromVal)} onwards`;
    if (toVal) return `Deleted up to ${fmt(toVal)}`;
    return 'All dates';
}

function renderTrash(docs) {
    const tbody = document.getElementById('trashTbody');
    if (!tbody) return;

    const subtitle = document.getElementById('trashSubtitle');
    const countBadge = document.getElementById('trashCountBadge');

    if (!docs || docs.length === 0) {
        if (subtitle) subtitle.textContent = 'No deleted invoices for this criteria.';
        if (countBadge) countBadge.textContent = '0 Deleted';
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 2rem; color: var(--text-muted);">Trash is empty.</td></tr>';
        return;
    }

    if (subtitle) subtitle.textContent = getSelectedDateRangeLabel();
    if (countBadge) {
        countBadge.textContent = `${docs.length} Deleted invoice${docs.length !== 1 ? 's' : ''}`;
    }

    let html = '';
    docs.forEach(d => {
        const branchName = (d.branchName || '').trim() || 'HeadOffice';
        html += `
            <tr>
                <td class="deleted-at">${esc(formatTimestamp(d.deletedAt))}</td>
                <td>${esc(formatDate(d.billDate || d.date))}</td>
                <td>${esc(d.invoiceNo || '')}</td>
                <td style="text-align: left;">${esc(branchName)}</td>
                <td>${esc(d.loanNo || '')}</td>
                <td>${esc(d.customerName || '')}</td>
                <td>${fmtMoney(d.total)}</td>
                <td>${esc(d.deletedBy || '-')}</td>
                <td>
                    <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
                        <button class="btn-reenter" data-reenter-id="${esc(d.trashId)}"
                            title="Re-enter this invoice number with a new amount">
                            <i class="fa-solid fa-pen-to-square"></i> Re-enter
                        </button>
                        <button class="btn-restore" data-trash-id="${esc(d.trashId)}" title="Restore this invoice">
                            <i class="fa-solid fa-rotate-left"></i> Restore
                        </button>
                        <button class="btn-danger" data-purge-id="${esc(d.trashId)}" title="Delete permanently">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// -------------------------------------------------------------
// Restore / Purge
// -------------------------------------------------------------
// Strip the bookkeeping fields so the restored doc matches the original exactly
function toInvoicePayload(d) {
    const payload = { ...d };
    delete payload.id;
    delete payload.trashId;
    TRASH_META_KEYS.forEach(k => delete payload[k]);
    return payload;
}

async function restoreInvoice(trashId, btn) {
    const entry = currentTrashDocs.find(d => d.trashId === trashId);
    if (!entry) {
        showToast("That invoice is no longer in the trash.", "error");
        return;
    }

    const billDate = entry.billDate || entry.date;
    let lockedMonths;
    try {
        lockedMonths = await fetchLockedMonths();
    } catch (err) {
        showToast("Could not verify month locks. Try again.", "error");
        return;
    }

    const key = monthKeyFromDate(billDate);
    if (key && lockedMonths.has(key)) {
        showToast(`${monthLabelFromKey(key)} is locked. Unlock it in Settings > Month Lock to restore invoices.`, "warning");
        return;
    }

    // A deleted number is handed back for re-use, so the same number may already
    // belong to a new invoice. Restoring now would create a duplicate number.
    const storedNo = (entry.invoiceNo || '').trim();
    if (storedNo) {
        let clash = null;
        try {
            const q = query(collection(db, "invoices"), where("invoiceNo", "==", storedNo));
            const snap = await getDocs(q);
            clash = snap.docs.find(d => d.id !== entry.originalId) || null;
        } catch (err) {
            console.error("Error checking invoice number clash:", err);
            showToast("Could not verify the invoice number. Restore blocked - try again.", "error");
            return;
        }

        if (clash) {
            const live = clash.data() || {};
            showToast(`${storedNo} is already in use by a live invoice (${(live.customerName || 'unknown customer')}). Edit that invoice instead of restoring this one.`, "warning");
            return;
        }
    }

    const invoiceNo = entry.invoiceNo || 'this invoice';
    if (!confirm(`Restore ${invoiceNo} to ${(entry.branchName || '').trim() || 'HeadOffice'}?`)) return;

    btn.disabled = true;
    try {
        // Same document id as the original, so the invoice number and ordering survive
        await setDoc(doc(db, "invoices", entry.originalId), toInvoicePayload(entry));
        await deleteDoc(doc(db, "deleted_invoices", trashId));

        showToast(`${invoiceNo} restored.`, "success");
        loadTrash();
    } catch (err) {
        console.error("Error restoring invoice:", err);
        showToast("Error restoring invoice: " + err.message, "error");
        renderTrash(currentTrashDocs);
    }
}

async function purgeInvoice(trashId, btn) {
    const entry = currentTrashDocs.find(d => d.trashId === trashId);
    if (!entry) {
        showToast("That invoice is no longer in the trash.", "error");
        return;
    }

    // Purging destroys the last copy of a locked month's invoice, so block it the
    // same way deleting a live invoice is blocked.
    const billDate = entry.billDate || entry.date;
    let lockedMonths;
    try {
        lockedMonths = await fetchLockedMonths();
    } catch (err) {
        showToast("Could not verify month locks. Deletion blocked - try again.", "error");
        return;
    }

    const key = monthKeyFromDate(billDate);
    if (key && lockedMonths.has(key)) {
        showToast(`${monthLabelFromKey(key)} is locked. Unlock it in Settings > Month Lock to delete invoices.`, "warning");
        return;
    }

    const invoiceNo = entry.invoiceNo || 'this invoice';
    if (!confirm(`Permanently delete ${invoiceNo}? This cannot be undone.`)) return;

    btn.disabled = true;
    try {
        await deleteDoc(doc(db, "deleted_invoices", trashId));
        showToast(`${invoiceNo} deleted permanently.`, "success");
        loadTrash();
    } catch (err) {
        console.error("Error purging invoice:", err);
        showToast("Error deleting invoice: " + err.message, "error");
        renderTrash(currentTrashDocs);
    }
}

// -------------------------------------------------------------
// Re-enter with a new amount
// Carries the invoice number into the billing form. Used when the number is
// below the branch counter, so the counter cannot hand it back on its own.
// -------------------------------------------------------------
const REENTER_STORAGE_KEY = 'artReenterInvoice';   // must match app.js

function setReenterHandoff(payload) {
    try { sessionStorage.setItem(REENTER_STORAGE_KEY, JSON.stringify(payload)); } catch (e) { }
}

function splitInvoiceNo(full) {
    const s = String(full || '').trim();
    if (!s) return { prefix: '', numeric: '' };
    const i = s.lastIndexOf('/');
    if (i === -1) return { prefix: '', numeric: s };
    return { prefix: s.slice(0, i).trim(), numeric: s.slice(i + 1).trim() };
}

// Resolve the branch a deleted invoice belonged to. A re-entry must land in that
// exact branch, so an unresolvable branch is refused here instead of being
// allowed to fall back to another branch in the billing form.
async function findDeletedBranch({ branchId, branchName, branchCode }) {
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

async function reenterInvoice(trashId) {
    const entry = currentTrashDocs.find(d => d.trashId === trashId);
    if (!entry) {
        showToast("That invoice is no longer in the trash.", "error");
        return;
    }

    const storedNo = (entry.invoiceNo || '').trim();
    const { numeric } = splitInvoiceNo(storedNo);
    if (!storedNo || !numeric) {
        showToast("This invoice has no usable number to re-enter.", "warning");
        return;
    }

    // Re-entry creates a live invoice, so the month lock applies
    let lockedMonths;
    try {
        lockedMonths = await fetchLockedMonths();
    } catch (err) {
        showToast("Could not verify month locks. Try again.", "error");
        return;
    }
    const key = monthKeyFromDate(entry.billDate || entry.date);
    if (key && lockedMonths.has(key)) {
        showToast(`${monthLabelFromKey(key)} is locked. Unlock it in Settings > Month Lock to re-enter invoices.`, "warning");
        return;
    }

    // The number must not already belong to a live invoice
    let clash = null;
    try {
        const q = query(collection(db, "invoices"), where("invoiceNo", "==", storedNo));
        const snap = await getDocs(q);
        clash = snap.docs.find(d => d.id !== entry.originalId) || null;
    } catch (err) {
        console.error("Error checking invoice number clash:", err);
        showToast("Could not verify the invoice number. Try again.", "error");
        return;
    }
    if (clash) {
        const live = clash.data() || {};
        showToast(`${storedNo} is already in use by a live invoice (${(live.customerName || 'unknown customer')}). Restore or edit that one instead.`, "warning");
        return;
    }

    // The branch must be resolvable now, otherwise the billing form would have
    // to guess a branch and the invoice would be filed against the wrong one
    let branch;
    try {
        branch = await findDeletedBranch({
            branchId: entry.branchId,
            branchName: entry.branchName,
            branchCode: entry.branchCode
        });
    } catch (err) {
        console.error("Error resolving branch for re-entry:", err);
        showToast("Could not read the branch list. Try again.", "error");
        return;
    }
    if (!branch) {
        showToast(`Could not match a branch for invoice ${storedNo}. `
            + `Re-entry is only available for the branch it was deleted from.`, "error");
        return;
    }

    // Re-using a number whose copy already reached the customer creates a
    // duplicate number, so make the user confirm.
    const copyIssued = confirm(
        `Re-enter invoice ${storedNo} with a NEW amount?\n\n` +
        `The number stays ${storedNo}. The trashed copy is removed once you save.\n\n` +
        `Has a printed or given copy of ${storedNo} already reached the customer?\n\n` +
        `OK = YES, a copy was issued - cancel and Restore the original instead\n` +
        `Cancel = NO copy was issued - continue to Billing`
    );
    if (copyIssued) {
        showToast("Cancelled. Use Restore to bring back the original unchanged.", "warning");
        return;
    }

    setReenterHandoff({
        invoiceNo: storedNo,
        trashId: trashId,
        // Send the resolved branch, so the form pins to this exact branch
        branchId: branch.id,
        branchName: branch.name || entry.branchName || '',
        branchCode: (branch.branchCode || branch.name || '').trim()
    });

    window.location.href = 'index.html';
}

document.getElementById('trashTbody')?.addEventListener('click', (e) => {
    const reenterBtn = e.target.closest('[data-reenter-id]');
    if (reenterBtn) {
        reenterInvoice(reenterBtn.getAttribute('data-reenter-id'));
        return;
    }
    const restoreBtn = e.target.closest('[data-trash-id]');
    if (restoreBtn) {
        restoreInvoice(restoreBtn.getAttribute('data-trash-id'), restoreBtn);
        return;
    }
    const purgeBtn = e.target.closest('[data-purge-id]');
    if (purgeBtn) {
        purgeInvoice(purgeBtn.getAttribute('data-purge-id'), purgeBtn);
    }
});

// -------------------------------------------------------------
// Controls
// -------------------------------------------------------------
const searchBtn = document.getElementById('searchBtn');
if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loadTrash();
    });
}

document.querySelectorAll('#fromDate, #toDate, #branchFilter').forEach(el => {
    el.addEventListener('change', () => loadTrash());
});

const printBtn = document.getElementById('printTrashBtn');
if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
}

const exportBtn = document.getElementById('exportTrashBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (!currentTrashDocs.length) return;
        exportToExcel(currentTrashDocs);
    });
}

function exportToExcel(docs) {
    const header = ['Deleted', 'Bill Date', 'Invoice No', 'Branch', 'Loan No',
        'Customer', 'Loan Amount', 'Charges', 'SGST', 'CGST', 'Total', 'Deleted By'];
    const aoa = [header];

    docs.forEach(d => {
        aoa.push([
            formatTimestamp(d.deletedAt),
            formatDate(d.billDate || d.date),
            d.invoiceNo || '',
            (d.branchName || '').trim() || 'HeadOffice',
            d.loanNo || '',
            d.customerName || '',
            parseFloat(d.loanAmount) || 0,
            parseFloat(d.charges) || 0,
            parseFloat(d.sgst) || 0,
            parseFloat(d.cgst) || 0,
            parseFloat(d.total) || 0,
            d.deletedBy || ''
        ]);
    });

    const fileName = `Deleted_Invoices_${new Date().toISOString().split('T')[0]}`;

    if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([[getSelectedDateRangeLabel()], [], aoa]);
        ws['!cols'] = [
            { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 14 },
            { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
            { wch: 14 }, { wch: 16 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, "Deleted Invoices");
        XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
        const esc2 = (s) => String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const pad = (n) => String(n).padStart(2, '0');
        const fmtDateOut = (v) => (v instanceof Date && !isNaN(v.getTime()))
            ? `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`
            : v;

        let htmlTable = '<html><head><meta charset="utf-8"></head><body><table border="1">';
        aoa.forEach((row, ri) => {
            htmlTable += '<tr>';
            row.forEach(cell => {
                if (ri === 0) {
                    htmlTable += `<th style="background-color: #4f46e5; color: #ffffff;">${esc2(cell)}</th>`;
                } else {
                    const isText = typeof cell === 'string';
                    const value = isText ? esc2(cell)
                        : (typeof cell === 'number'
                            ? cell.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : esc2(fmtDateOut(cell)));
                    htmlTable += `<td>${value}</td>`;
                }
            });
            htmlTable += '</tr>';
        });
        htmlTable += '</table></body></html>';

        const blob = new Blob([htmlTable], { type: 'application/vnd.ms-excel' });
        const link = document.createElement('a');
        link.download = `${fileName}.xls`;
        link.href = URL.createObjectURL(blob);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
}
