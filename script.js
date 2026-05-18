/* ============================================================
   script.js — Log Datasheet LIFF App
   ============================================================ */

const LIFF_ID = '2010082961-GTtjRCn3';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbz-n1Fm3jZoknLhdiS6IEjlGnacoORC7w8VcytfdEfINXO6pvCBG3Qixbuf8arK2nkaGw/exec';

let allLogs = [];
let filteredLogs = [];

// ============================================================
// INIT
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup LIFF
    try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
            liff.login();
            return; // หยุดโหลดรอจนกว่าจะ login เสร็จ
        }
    } catch (e) {
        console.warn('LIFF init failed or skipped (dev mode):', e.message);
    }

    // Attach event listeners for real-time filtering
    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('filter-date').addEventListener('change', applyFilters);
    document.getElementById('filter-month').addEventListener('change', applyFilters);
    document.getElementById('filter-year').addEventListener('change', applyFilters);

    // 2. Fetch Data
    await loadLogs();
});

// ============================================================
// LOAD DATA
// ============================================================
async function loadLogs() {
    setLoading(true);
    try {
        const res = await fetch(GAS_URL + '?action=getLogs&t=' + Date.now(), { redirect: 'follow' });
        const data = await readJsonResponse_(res);
        
        if (!data.success) {
            throw new Error(data.error || data.message || 'โหลดข้อมูลล้มเหลว');
        }

        allLogs = data.logs || [];
        applyFilters(); // Render and apply any default filters
        
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString('th-TH');
    } catch (err) {
        showToast('ไม่สามารถโหลดข้อมูลได้: ' + err.message, true);
        console.error(err);
    } finally {
        setLoading(false);
    }
}

async function readJsonResponse_(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error('Invalid server response');
    }
}

function refreshData() {
    const btn = document.getElementById('btn-refresh');
    btn.classList.add('spinning');
    loadLogs().finally(() => btn.classList.remove('spinning'));
}

// ============================================================
// FILTERING LOGIC
// ============================================================
function applyFilters() {
    const searchTxt = document.getElementById('search-input').value.trim().toLowerCase();
    const filterDate = document.getElementById('filter-date').value; // YYYY-MM-DD
    const filterMonth = document.getElementById('filter-month').value; // YYYY-MM
    const filterYear = document.getElementById('filter-year').value; // YYYY

    filteredLogs = allLogs.filter(log => {
        // 1. Search filter (Case ID, Machine, Technician)
        if (searchTxt) {
            const caseMatch = (log.caseId || '').toLowerCase().includes(searchTxt);
            const machMatch = (log.machine || '').toLowerCase().includes(searchTxt);
            const techMatch = (log.technician || '').toLowerCase().includes(searchTxt);
            if (!caseMatch && !machMatch && !techMatch) return false;
        }

        // Parse log date
        if (!log.startProblem) return false;
        const logDateObj = new Date(log.startProblem);
        if (isNaN(logDateObj.getTime())) return false; // Invalid date

        // Format dates to match HTML input values
        const logY = String(logDateObj.getFullYear());
        const logM = String(logDateObj.getMonth() + 1).padStart(2, '0');
        const logD = String(logDateObj.getDate()).padStart(2, '0');

        const logYYYYMMDD = `${logY}-${logM}-${logD}`;
        const logYYYYMM = `${logY}-${logM}`;

        // 2. Date filter
        if (filterDate && logYYYYMMDD !== filterDate) return false;

        // 3. Month filter
        if (filterMonth && logYYYYMM !== filterMonth) return false;

        // 4. Year filter
        if (filterYear && logY !== filterYear) return false;

        return true;
    });

    renderTable();
}

function clearFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-date').value = '';
    document.getElementById('filter-month').value = '';
    document.getElementById('filter-year').value = '';
    applyFilters();
}

// ============================================================
// RENDER TABLE
// ============================================================
function renderTable() {
    const tbody = document.getElementById('table-body');
    const recordCount = document.getElementById('record-count');
    const emptyState = document.getElementById('empty-state');
    const table = document.getElementById('log-table');

    recordCount.textContent = filteredLogs.length;

    if (filteredLogs.length === 0) {
        tbody.innerHTML = '';
        table.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    table.classList.remove('hidden');
    emptyState.classList.add('hidden');

    tbody.innerHTML = filteredLogs.map(log => {
        const dateObj = new Date(log.startProblem);
        const dateStr = isNaN(dateObj) ? '—' : dateObj.toLocaleString('th-TH', { 
            day: '2-digit', month: 'short', year: '2-digit', 
            hour: '2-digit', minute: '2-digit'
        });

        const statusClass = getStatusClass(log.repairStatus);
        const statusLabel = getStatusLabel(log.repairStatus);

        return `
        <tr>
            <td class="sticky-col"><strong>${escHtml(log.caseId)}</strong></td>
            <td class="cell-date">${dateStr}</td>
            <td>${escHtml(log.machine)}<br><small style="color:var(--c-muted)">${escHtml(log.spNo)}</small></td>
            <td>${escHtml(log.technician || '—')}</td>
            <td>${escHtml(log.downtimeMin ? log.downtimeMin + ' นาที' : '—')}</td>
            <td class="cell-loss">${escHtml(log.lossCost ? '฿' + Number(log.lossCost).toLocaleString() : '—')}</td>
            <td><span class="badge ${statusClass}">${escHtml(statusLabel)}</span></td>
        </tr>
        `;
    }).join('');
}

// ============================================================
// UTILS
// ============================================================
function setLoading(isLoading) {
    const loader = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    
    if (isLoading) {
        loader.style.display = 'flex';
        // Add slight delay for opacity transition
        setTimeout(() => loader.style.opacity = '1', 10);
    } else {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            app.classList.remove('hidden');
        }, 400);
    }
}

function showToast(msg, isError = false) {
    const div = document.createElement('div');
    div.className = 'toast' + (isError ? ' error' : '');
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transition = 'opacity 0.5s';
        setTimeout(() => div.remove(), 500);
    }, 3000);
}

function getStatusClass(status) {
    const s = String(status || '').toLowerCase();
    if (['waiting', 'รอรับงาน'].includes(s)) return 'waiting';
    if (['checking', 'ตรวจสอบ'].includes(s)) return 'checking';
    if (['repairing', 'กำลังซ่อม'].includes(s)) return 'repairing';
    if (['completed', 'ซ่อมเสร็จ', 'ปิดงาน'].includes(s)) return 'completed';
    return 'waiting';
}

function getStatusLabel(status) {
    const s = String(status || '').toLowerCase();
    if (['waiting', 'รอรับงาน'].includes(s)) return 'รอรับงาน';
    if (['checking', 'ตรวจสอบ'].includes(s)) return 'ตรวจสอบ';
    if (['repairing', 'กำลังซ่อม'].includes(s)) return 'กำลังซ่อม';
    if (['completed', 'ซ่อมเสร็จ', 'ปิดงาน'].includes(s)) return 'ซ่อมเสร็จ';
    return status || '—';
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
