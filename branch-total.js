import { db, collection, getDocs } from "./db.js";
import { formatDate } from "./public.js";

let currentUser = null;
let currentSummaryDocs = [];

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

    // Branch-role users only ever see their own branch, so the filter is pointless for them.
    const isAdmin = currentUser.role === 'admin' || currentUser.role === 'headoffice';
    const filterBox = document.getElementById('adminFilterBox');
    if (filterBox) filterBox.style.display = isAdmin ? 'flex' : 'none';

    if (isAdmin) {
        populateBranchFilter();
    }
    loadBranchTotals();
})();

// -------------------------------------------------------------
// Branch filter (admin / head office only)
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
async function loadBranchTotals() {
    if (!currentUser) return;

    const tbody = document.getElementById('branchSummaryTbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading-td"><div class="spinner" style="margin: 0 auto; border-top-color: var(--primary);"></div></td></tr>';

    try {
        const [invoicesSnap, branchesSnap] = await Promise.all([
            getDocs(collection(db, "invoices")),
            getDocs(collection(db, "branches"))
        ]);

        const allDocs = [];
        invoicesSnap.forEach(d => allDocs.push({ id: d.id, ...d.data() }));

        // Map every identifier (doc id, name, code) to a canonical branch name
        const nameById = new Map();
        const nameByName = new Map();
        const nameByCode = new Map();

        branchesSnap.forEach(d => {
            const data = d.data() || {};
            const id = d.id.trim().toLowerCase();
            const name = (data.name || '').trim();
            const code = (data.branchCode || '').trim().toLowerCase();

            if (name) {
                if (id) nameById.set(id, name);
                nameByName.set(name.toLowerCase(), name);
                if (code) nameByCode.set(code, name);
            }
        });

        const resolveBranchName = (doc) => {
            const byId = (doc.branchId || '').trim().toLowerCase();
            const byName = (doc.branchName || '').trim();
            const byCode = (doc.branchCode || '').trim().toLowerCase();

            if (byId && nameById.has(byId)) return nameById.get(byId);
            if (byName && nameByName.has(byName.toLowerCase())) return nameByName.get(byName.toLowerCase());
            if (byCode && nameByCode.has(byCode)) return nameByCode.get(byCode);
            return byName || 'HeadOffice';
        };

        let filtered = allDocs;

        // Role scoping: a branch user is locked to their own branch
        if (currentUser.role === 'branch') {
            const userBranch = (currentUser.branch || '').trim().toLowerCase();
            const allowed = new Set();

            if (nameById.has(userBranch)) {
                const canonical = nameById.get(userBranch);
                allowed.add(canonical.toLowerCase());
            }
            if (nameByName.has(userBranch)) allowed.add(userBranch);
            if (nameByCode.has(userBranch)) allowed.add(nameByCode.get(userBranch).toLowerCase());
            if (allowed.size === 0) allowed.add(userBranch);

            filtered = filtered.filter(d => allowed.has(resolveBranchName(d).toLowerCase()));
        } else {
            const branchSelect = document.getElementById('branchFilter');
            const selected = branchSelect ? branchSelect.value : 'All';
            if (selected && selected !== 'All') {
                const target = selected.trim().toLowerCase();
                filtered = filtered.filter(d => resolveBranchName(d).toLowerCase() === target);
            }
        }

        // Date range filter (inclusive on both ends)
        const fromDateInput = document.getElementById('fromDate');
        const toDateInput = document.getElementById('toDate');
        const fromVal = fromDateInput ? fromDateInput.value : '';
        const toVal = toDateInput ? toDateInput.value : '';

        if (fromVal || toVal) {
            filtered = filtered.filter(d => {
                const docDateStr = d.billDate || d.date;
                if (!docDateStr) return false;

                const docDate = new Date(docDateStr);
                if (isNaN(docDate.getTime())) return false;
                docDate.setHours(0, 0, 0, 0);

                if (fromVal) {
                    const from = new Date(fromVal);
                    if (isNaN(from.getTime())) return false;
                    from.setHours(0, 0, 0, 0);
                    if (docDate < from) return false;
                }
                if (toVal) {
                    const to = new Date(toVal);
                    if (isNaN(to.getTime())) return false;
                    to.setHours(23, 59, 59, 999);
                    if (docDate > to) return false;
                }
                return true;
            });
        }

        currentSummaryDocs = filtered;
        renderBranchSummary(filtered);
    } catch (error) {
        console.error("Error loading branch totals: ", error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--error);">Error loading data.</td></tr>';
    }
}

// -------------------------------------------------------------
// Render
// -------------------------------------------------------------
function getSelectedDateRangeLabel() {
    const fromVal = document.getElementById('fromDate')?.value || '';
    const toVal = document.getElementById('toDate')?.value || '';

    const fmtDate = (v) => {
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : formatDate(v);
    };

    if (fromVal && toVal) return `Branch totals from ${fmtDate(fromVal)} to ${fmtDate(toVal)}`;
    if (fromVal) return `Branch totals from ${fmtDate(fromVal)} onwards`;
    if (toVal) return `Branch totals up to ${fmtDate(toVal)}`;
    return 'All dates';
}

function renderBranchSummary(docs) {
    const tbody = document.getElementById('branchSummaryTbody');
    if (!tbody) return;

    const subtitle = document.getElementById('branchSummarySubtitle');
    if (subtitle) subtitle.textContent = getSelectedDateRangeLabel();

    const countBadge = document.getElementById('branchSummaryCount');
    const fmt = (val) => val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (!docs || docs.length === 0) {
        if (countBadge) countBadge.textContent = '0 Branches';
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">No branch data for this criteria.</td></tr>';
        return;
    }

    const byBranch = new Map();
    docs.forEach(d => {
        const name = (d.branchName || '').trim() || 'HeadOffice';
        if (!byBranch.has(name)) {
            byBranch.set(name, { count: 0, loanAmount: 0, charges: 0, sgst: 0, cgst: 0, total: 0 });
        }
        const row = byBranch.get(name);
        row.count += 1;
        ['loanAmount', 'charges', 'sgst', 'cgst', 'total'].forEach(key => {
            row[key] += parseFloat(d[key]) || 0;
        });
    });

    const entries = Array.from(byBranch.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    if (countBadge) {
        countBadge.textContent = `${entries.length} Branch${entries.length !== 1 ? 'es' : ''}`;
    }

    const grand = { count: 0, loanAmount: 0, charges: 0, sgst: 0, cgst: 0, total: 0 };

    let html = '';
    entries.forEach(([name, s]) => {
        grand.count += s.count;
        ['loanAmount', 'charges', 'sgst', 'cgst', 'total'].forEach(k => { grand[k] += s[k]; });

        html += `
            <tr>
                <td style="text-align: left; font-weight: 600;">
                    <i class="fa-solid fa-building" style="margin-right: 8px; color: #818cf8;"></i>${name}
                </td>
                <td><span class="badge">${s.count}</span></td>
                <td>${fmt(s.loanAmount)}</td>
                <td>${fmt(s.charges)}</td>
                <td>${fmt(s.sgst)}</td>
                <td>${fmt(s.cgst)}</td>
                <td class="bt-total">${fmt(s.total)}</td>
            </tr>
        `;
    });

    html += `
        <tr class="branch-summary-total">
            <td style="text-align: left;">All Branches</td>
            <td>${grand.count}</td>
            <td>${fmt(grand.loanAmount)}</td>
            <td>${fmt(grand.charges)}</td>
            <td>${fmt(grand.sgst)}</td>
            <td>${fmt(grand.cgst)}</td>
            <td>${fmt(grand.total)}</td>
        </tr>
    `;

    tbody.innerHTML = html;
}

// -------------------------------------------------------------
// Controls
// -------------------------------------------------------------
const searchBtn = document.getElementById('searchBtn');
if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loadBranchTotals();
    });
}

document.querySelectorAll('#fromDate, #toDate, #branchFilter').forEach(el => {
    el.addEventListener('change', () => loadBranchTotals());
});

const printBtn = document.getElementById('printBranchTotalBtn');
if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
}

const exportBtn = document.getElementById('exportBranchTotalBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (!currentSummaryDocs.length) return;
        exportToExcel(currentSummaryDocs);
    });
}

function exportToExcel(docs) {
    const byBranch = new Map();
    docs.forEach(d => {
        const name = (d.branchName || '').trim() || 'HeadOffice';
        if (!byBranch.has(name)) {
            byBranch.set(name, { count: 0, loanAmount: 0, charges: 0, sgst: 0, cgst: 0, total: 0 });
        }
        const row = byBranch.get(name);
        row.count += 1;
        ['loanAmount', 'charges', 'sgst', 'cgst', 'total'].forEach(key => {
            row[key] += parseFloat(d[key]) || 0;
        });
    });

    const entries = Array.from(byBranch.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const header = ['Branch', 'Invoices', 'Loan Amt', 'Charges', 'SGST', 'CGST', 'Total'];
    const aoa = [header];
    const grand = [0, 0, 0, 0, 0, 0];

    entries.forEach(([name, s]) => {
        aoa.push([name, s.count, s.loanAmount, s.charges, s.sgst, s.cgst, s.total]);
        grand[0] += s.count;
        for (let i = 1; i < grand.length; i++) {
            grand[i] += [0, s.count, s.loanAmount, s.charges, s.sgst, s.cgst, s.total][i];
        }
    });
    aoa.push(['All Branches', ...grand]);

    const range = getSelectedDateRangeLabel();
    const fileName = `Branch_Total_${new Date().toISOString().split('T')[0]}`;

    if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([[range], [], aoa]);
        XLSX.utils.book_append_sheet(wb, ws, "Branch Total");
        XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
        let htmlTable = '<html><head><meta charset="utf-8"></head><body><table border="1">';
        aoa.forEach((row, ri) => {
            htmlTable += '<tr>';
            row.forEach(cell => {
                const isHeader = ri === 0;
                htmlTable += isHeader
                    ? `<th style="background-color: #4f46e5; color: #ffffff;">${cell}</th>`
                    : `<td>${typeof cell === 'number' ? cell.toFixed(2) : cell}</td>`;
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
