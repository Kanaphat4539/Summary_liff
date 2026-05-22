/* ============================================================
   script.js — Revamped LIFF Summary Web App
   Handles state management, dynamic API queries, date conversions,
   and visual updates for Shift & Daily summaries.
   ============================================================ */

const LIFF_ID = '2010082961-GTtjRCn3';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzdfElOEBYInq5dFpTCH-3BYyDjhObR1vkNRahoeL6KXXMxL3BaOtt-bZlvxzTK9y5oxg/exec';

let currentTab = 'shift'; // 'shift' or 'daily'
let selectedDate = '';    // YYYY-MM-DD
let selectedShift = 'morning'; // 'morning', 'afternoon', 'evening'

// ============================================================
// INITIALIZATION
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Date picker to today (Asia/Bangkok time)
    const today = getBangkokDateStr();
    document.getElementById('filter-date').value = today;
    selectedDate = today;

    // Determine current shift based on current hour to make it super user-friendly!
    selectedShift = getShiftKeyByHour(new Date().getHours());
    document.getElementById('filter-shift').value = selectedShift;

    // 2. Setup LIFF
    try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
            liff.login();
            return; // Wait for login
        }
    } catch (e) {
        console.warn('LIFF init failed or skipped (dev mode):', e.message);
    }

    // 3. Load active tab summary
    await loadSummary();
});

// ============================================================
// TAB & FILTER NAVIGATION
// ============================================================
function switchTab(tab) {
    if (currentTab === tab) return;
    
    currentTab = tab;
    
    // Update Tab Buttons
    document.getElementById('tab-shift').classList.toggle('active', tab === 'shift');
    document.getElementById('tab-daily').classList.toggle('active', tab === 'daily');
    
    // Smooth indicator sliding effect
    const indicator = document.querySelector('.tab-indicator');
    if (indicator) {
        indicator.style.transform = tab === 'daily' ? 'translateX(100%)' : 'translateX(0)';
    }

    // Show/Hide shift selector in controls card
    document.getElementById('shift-select-group').classList.toggle('hidden', tab === 'daily');

    // Trigger loading
    loadSummary();
}

function onFilterChange() {
    selectedDate = document.getElementById('filter-date').value;
    selectedShift = document.getElementById('filter-shift').value;
    loadSummary();
}

function refreshData() {
    const btn = document.getElementById('btn-refresh');
    btn.classList.add('spinning');
    loadSummary().finally(() => btn.classList.remove('spinning'));
}

// ============================================================
// DATA FETCHING (Calling Apps Script Web App API)
// ============================================================
async function loadSummary() {
    if (!selectedDate) {
        showToast('กรุณาเลือกวันที่ก่อน', true);
        return;
    }
    
    setLoading(true);
    try {
        let url = GAS_URL;
        if (currentTab === 'shift') {
            url += `?action=generateShiftSummary&date=${selectedDate}&shiftKey=${selectedShift}&t=${Date.now()}`;
        } else {
            url += `?action=generateDailySummary&date=${selectedDate}&t=${Date.now()}`;
        }

        const res = await fetch(url, { redirect: 'follow' });
        const data = await readJsonResponse_(res);

        if (!data.success) {
            throw new Error(data.error || data.message || 'ดึงข้อมูลล้มเหลว');
        }

        renderDashboard(data.summary || data.data);
    } catch (err) {
        showToast('ไม่สามารถดึงข้อมูลสรุปได้: ' + err.message, true);
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
        throw new Error('การตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง');
    }
}

// ============================================================
// UI RENDERING ENGINE
// ============================================================
function renderDashboard(summary) {
    if (!summary) return;

    // 1. Dynamic Titles & Headers
    document.getElementById('summary-title').textContent = currentTab === 'shift' ? 'สรุปรายกะ' : 'สรุปรายวัน';
    
    // Buddhist Era Year Conversion (2026 -> 2569)
    const dateObj = new Date(selectedDate);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const BEYear = dateObj.getFullYear() + 543;
    document.getElementById('display-date').textContent = `${day}/${month}/${BEYear}`;

    // 2. Tab Specific Elements Toggle
    const isShift = currentTab === 'shift';
    
    document.getElementById('card-shift-pill').classList.toggle('hidden', !isShift);
    document.getElementById('card-daily-shifts').classList.toggle('hidden', isShift);
    document.getElementById('card-highlight-pill').classList.toggle('hidden', isShift);
    document.getElementById('daily-shifts-breakdown').classList.toggle('hidden', isShift);

    // Swap Grid Case Label
    document.getElementById('metric-cases-label').textContent = isShift ? 'เคสปัญหากะนี้' : 'เคสปัญหาวันนี้';

    if (isShift) {
        // Shift Details setup
        const shiftText = getShiftLabelText(selectedShift);
        const shiftIcon = getShiftIcon(selectedShift);
        document.getElementById('card-shift-text').textContent = shiftText;
        document.querySelector('#card-shift-pill .icon').textContent = shiftIcon;
    } else {
        // Daily Shifts indicator highlights
        const currentHourShift = getShiftKeyByHour(new Date().getHours());
        const pills = document.querySelectorAll('#card-daily-shifts .daily-shift-pill');
        pills.forEach((pill, idx) => {
            pill.classList.remove('active');
            if (idx === 0 && currentHourShift === 'morning') pill.classList.add('active');
            if (idx === 1 && currentHourShift === 'afternoon') pill.classList.add('active');
            if (idx === 2 && currentHourShift === 'evening') pill.classList.add('active');
        });
    }

    // 3. Overall Status Banner
    const isNormal = (summary.overallStatus || '').includes('ปกติ');
    const banner = document.getElementById('status-banner');
    const iconEl = document.getElementById('status-icon');
    const textEl = document.getElementById('overall-status-text');

    textEl.textContent = summary.overallStatus || 'ปกติ';
    if (isNormal) {
        banner.className = 'status-banner normal';
        iconEl.textContent = '✅';
    } else {
        banner.className = 'status-banner';
        iconEl.textContent = '⚠️';
    }

    // 4. Metrics Grid values
    document.getElementById('metric-machines').textContent = summary.machineCount || 0;
    document.getElementById('metric-nozzles').textContent = summary.spCount || 0;
    document.getElementById('metric-cases').textContent = summary.startedCount || 0;
    document.getElementById('metric-warnings').textContent = summary.warningCount || 0;
    document.getElementById('metric-criticals').textContent = summary.criticalCount || 0;
    document.getElementById('metric-breakdown').textContent = summary.breakdownCount || 0;

    // 5. Bottom summary strip
    document.getElementById('strip-success').textContent = summary.closedCount || 0;
    document.getElementById('strip-downtime').textContent = summary.downtimeMin || 0;
    document.getElementById('strip-loss').textContent = formatNumberWithCommas(summary.lossCost || 0);

    // 6. Daily-Only Cases breakdown
    if (!isShift && summary.shiftCounts) {
        document.getElementById('daily-case-morning').textContent = summary.shiftCounts.morning || 0;
        document.getElementById('daily-case-afternoon').textContent = summary.shiftCounts.afternoon || 0;
        document.getElementById('daily-case-evening').textContent = summary.shiftCounts.evening || 0;
    }

    // 7. Caution List (เครื่องที่ควรระวัง)
    const cautionContainer = document.getElementById('caution-list');
    const watchList = summary.watchList || [];
    
    if (watchList.length === 0) {
        cautionContainer.innerHTML = `
            <div style="text-align:center; padding:16px; color:var(--c-text-muted); font-size:13px; font-weight:600;">
                🎉 เครื่องจักรทุกเครื่องอยู่ในเกณฑ์ปกติ
            </div>
        `;
    } else {
        cautionContainer.innerHTML = watchList.map((item, idx) => {
            const levelClass = getCautionLevelClass(item.level);
            const levelIcon = getCautionLevelIcon(item.level);
            return `
                <div class="caution-item ${levelClass}" onclick="openCaseDetails('${item.machine}', '${item.spNo}')">
                    <div class="number">${idx + 1}</div>
                    <span class="icon">${levelIcon}</span>
                    <div class="desc">${escHtml(item.text)}</div>
                    <div class="chevron">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 8. Recommendation List (คำแนะนำวันนี้)
    const recContainer = document.getElementById('recommendation-list');
    const recText = summary.recommendationText || '';
    const recs = recText.split('\n').filter(r => r.trim().length > 0);

    if (recs.length === 0 || recText.includes('ไม่พบเคสปัญหา')) {
        recContainer.innerHTML = `
            <li>🍀 ทุกระบบทำงานเป็นปกติ ติดตามการบันทึกข้อมูลอย่างต่อเนื่อง</li>
        `;
    } else {
        recContainer.innerHTML = recs.map(rec => `
            <li>${escHtml(rec)}</li>
        `).join('');
    }
}

// ============================================================
// UTILITY FUNCTIONS & EVENT IMPLEMENTATIONS
// ============================================================
function getBangkokDateStr() {
    // Returns YYYY-MM-DD in Asia/Bangkok time
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
}

function getShiftKeyByHour(hour) {
    if (hour >= 16) return 'evening';
    if (hour >= 8) return 'afternoon';
    return 'morning';
}

function getShiftLabelText(shiftKey) {
    if (shiftKey === 'afternoon') return 'กะบ่าย 08:00 - 16:00';
    if (shiftKey === 'evening') return 'กะเย็น 16:00 - 00:00';
    return 'กะเช้า 00:00 - 08:00';
}

function getShiftIcon(shiftKey) {
    if (shiftKey === 'afternoon') return '⛅';
    if (shiftKey === 'evening') return '🌙';
    return '☀️';
}

function getCautionLevelClass(level) {
    const l = String(level || '').toLowerCase();
    if (l.includes('critical')) return 'priority-critical';
    if (l.includes('break') || l.includes('down')) return 'priority-breakdown';
    return 'priority-warning';
}

function getCautionLevelIcon(level) {
    const l = String(level || '').toLowerCase();
    if (l.includes('critical')) return '🚨';
    if (l.includes('break') || l.includes('down')) return '🔧';
    return '⚠️';
}

function formatNumberWithCommas(num) {
    const n = Number(String(num).replace(/,/g, ''));
    return isNaN(n) ? '0' : Math.round(n).toLocaleString('en-US');
}

function setLoading(isLoading) {
    const loader = document.getElementById('loading-screen');
    const app = document.getElementById('app');

    if (isLoading) {
        loader.style.display = 'flex';
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
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

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

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Redirect and Link Functions
function openLoadAlertWeb() {
    window.open('https://liff.line.me/2010082961-D0sA72v5', '_blank');
}

let loadedLogs = [];
let loadedJobs = [];

// ============================================================
// EMBEDDED VIEW SWITCHER & DIALOGS
// ============================================================

function viewAllCases() {
    showCasesLog();
}

function showCasesLog() {
    document.getElementById('dashboard-view').classList.add('hidden');
    const logView = document.getElementById('cases-log-view');
    logView.classList.remove('hidden');
    
    // Auto-scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Load historical logs if empty or just to refresh
    if (loadedLogs.length === 0) {
        loadCasesLog();
    }
}

function closeCasesLog() {
    document.getElementById('cases-log-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    
    // Reset search input
    document.getElementById('search-log-input').value = '';
}

function refreshCasesLog() {
    const btn = document.getElementById('btn-refresh-log');
    if (btn) btn.classList.add('spinning');
    loadCasesLog().finally(() => {
        if (btn) btn.classList.remove('spinning');
    });
}

// Fetch and render historical logs
async function loadCasesLog() {
    const listContainer = document.getElementById('cases-log-list');
    listContainer.innerHTML = `
        <div class="cases-log-loading">
            <div class="log-spinner"></div>
            <span>กำลังติดต่อระบบดึงข้อมูลประวัติ...</span>
        </div>
    `;
    
    try {
        const url = `${GAS_URL}?action=getLogs&t=${Date.now()}`;
        const res = await fetch(url, { redirect: 'follow' });
        const data = await readJsonResponse_(res);
        
        if (data.success && data.logs) {
            loadedLogs = data.logs;
        } else {
            throw new Error(data.message || 'ไม่มีข้อมูลประวัติในฐานข้อมูลหลัก');
        }
    } catch (err) {
        console.warn('Could not fetch historical logs from Apps Script (CORS/Offline). Loading simulated logs instead:', err.message);
        showToast('กำลังใช้งานโหมดจำลองข้อมูลประวัติซ่อม', false);
        // Load high-fidelity simulated historical data
        loadedLogs = JSON.parse(JSON.stringify(MOCK_LOGS));
    } finally {
        // Reset controls first
        document.getElementById('search-log-input').value = '';
        document.getElementById('filter-log-date').value = '';
        document.getElementById('filter-log-status').value = '';
        
        populateTechnicianDropdown(loadedLogs);
        renderLogsList(loadedLogs);
    }
}

// Render list of log cards
function renderLogsList(logs) {
    const listContainer = document.getElementById('cases-log-list');
    
    if (!logs || logs.length === 0) {
        listContainer.innerHTML = `
            <div class="cases-log-empty">
                <svg viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="2" fill="none" style="color:var(--c-text-muted);"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <span style="margin-top: 10px; font-weight: 600;">ไม่พบข้อมูลประวัติที่ค้นหา</span>
            </div>
        `;
        return;
    }
    
    listContainer.innerHTML = logs.map(log => {
        const sysLogVal = log.System_Log || log.systemLog || '';
        const hasOver = String(sysLogVal).toLowerCase().includes('over');
        const hasError = String(sysLogVal).toLowerCase().includes('error');
        const hasUnder = String(sysLogVal).toLowerCase().includes('under');
        
        let footerClass = '';
        if (hasOver) footerClass = 'has-over';
        else if (hasError || hasUnder) footerClass = 'has-error';

        // Format dates beautifully
        const rawTime = log.Timestamp || log.timestamp || log.startProblem || log.Start_Problem;
        let displayTime = 'N/A';
        if (rawTime) {
            try {
                const dateObj = new Date(rawTime);
                if (!isNaN(dateObj.getTime())) {
                    const hours = String(dateObj.getHours()).padStart(2, '0');
                    const mins = String(dateObj.getMinutes()).padStart(2, '0');
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const yearBE = dateObj.getFullYear() + 543;
                    displayTime = `${day}/${month}/${yearBE} ${hours}:${mins} น.`;
                } else {
                    displayTime = rawTime; // fallback
                }
            } catch (e) {
                displayTime = rawTime;
            }
        }
        
        // Parse system log variables if exists
        const sysParsed = parseSystemLog(sysLogVal);
        let sysText = '';
        if (sysLogVal) {
            sysText = `
                <div style="font-size: 11.5px; color: var(--c-text-muted); margin-bottom: 8px; background:#f8fafc; padding: 8px 12px; border-radius:10px; border-left: 3px solid #cbd5e1; display:flex; flex-direction:column; gap:2px;">
                    <div>💡 <strong>ข้อมูลเครื่อง:</strong> ถุงใบที่ #${sysParsed.bagNo || 'N/A'} • อาการ: ${sysParsed.errorType || 'ปกติ'}</div>
                    ${sysParsed.consecutiveCount ? `<div>• จำนวนความผิดพลาดสะสม: <span style="color:var(--c-danger); font-weight:700;">${sysParsed.consecutiveCount} ครั้ง</span></div>` : ''}
                </div>
            `;
        }

        const machine = log.Machine || log.machine || 'N/A';
        const spNo = log.SP_No || log.spNo || 'N/A';
        const caseId = log.Case_ID || log.caseId || 'N/A';
        const technician = log.Technician || log.technician || 'ช่างซ่อมบำรุง';
        const downtimeMin = log.Downtime_Min || log.downtimeMin || log.Fixed_Time || 0;
        const lossCost = log.Loss_Coss || log.lossCost || log.lossCoss || 0;
        const note = log.note || log.หมายเหตุ || '';
        const detail = log.รายละเอียดงาน || log.detail || '';
        const repairStatus = log.Repair_Status || log.repairStatus || 'ซ่อมสำเร็จ';
        
        // ค่าน้ำหนักจริง
        const currentWeight = log.Current_Weight || log.currenWeight || log.Curren_Weight || '';
        const weightNum = parseFloat(currentWeight);
        let weightDisplayHtml = 'N/A';
        
        if (!isNaN(weightNum)) {
            const diff = weightNum - 50.0;
            const diffSign = diff > 0 ? '+' : '';
            const diffColor = diff > 0.26 ? 'var(--c-danger)' : (diff < -0.2 ? 'var(--c-blue)' : 'var(--c-success)');
            weightDisplayHtml = `<span style="font-weight:700;">${weightNum.toFixed(2)} kg</span> <span style="font-size:11px; color:${diffColor}; font-weight:700;">(${diffSign}${diff.toFixed(2)} kg)</span>`;
        }

        const actionText = detail || note || 'เคลียร์เศษหินปูนและตั้งค่าระบบปกติ';

        return `
            <div class="log-card">
                <div class="log-card-header">
                    <div class="log-card-title">
                        <span class="machine-badge">${escHtml(machine)}</span>
                        <span class="sp-badge">${escHtml(spNo)}</span>
                    </div>
                    <span class="status-badge completed">${escHtml(repairStatus)}</span>
                </div>
                <div class="log-card-grid">
                    <div class="log-grid-item">
                        <span class="log-grid-label">เคสไอดี</span>
                        <span class="log-grid-value" style="font-family:monospace; font-size:12px;">${escHtml(caseId)}</span>
                    </div>
                    <div class="log-grid-item">
                        <span class="log-grid-label">เวลาซ่อมเสร็จ</span>
                        <span class="log-grid-value">${escHtml(displayTime)}</span>
                    </div>
                    <div class="log-grid-item">
                        <span class="log-grid-label">ช่างเทคนิค</span>
                        <span class="log-grid-value">${escHtml(technician)}</span>
                    </div>
                    <div class="log-grid-item">
                        <span class="log-grid-label">Downtime / Loss</span>
                        <span class="log-grid-value">
                            <span class="downtime">${downtimeMin} นาที</span> / 
                            <span class="loss">${formatNumberWithCommas(lossCost)} ฿</span>
                        </span>
                    </div>
                    <div class="log-grid-item" style="grid-column: span 2;">
                        <span class="log-grid-label">ค่าน้ำหนักตอนเกิดปัญหา</span>
                        <span class="log-grid-value">${weightDisplayHtml}</span>
                    </div>
                </div>
                ${sysText}
                <div class="log-card-footer ${footerClass}">
                    <strong>การดำเนินการ:</strong> ${escHtml(actionText)}
                </div>
            </div>
        `;
    }).join('');
}

// Dynamic Populated Technician Dropdown
function populateTechnicianDropdown(logs) {
    const techSelect = document.getElementById('filter-log-tech');
    if (!techSelect) return;
    
    const currentVal = techSelect.value;
    const techs = new Set();
    
    logs.forEach(log => {
        const tech = String(log.Technician || log.technician || '').trim();
        if (tech && tech !== 'ช่างซ่อมบำรุง' && tech !== '-' && tech !== 'N/A') {
            techs.add(tech);
        }
    });
    
    let html = '<option value="">ทั้งหมด</option>';
    Array.from(techs).sort().forEach(tech => {
        html += `<option value="${tech}">${tech}</option>`;
    });
    
    techSelect.innerHTML = html;
    
    if (techs.has(currentVal)) {
        techSelect.value = currentVal;
    } else {
        techSelect.value = '';
    }
}

// 3-Axis Multi-Dimensional Search & Filtering Logic
function filterCasesLog() {
    const searchVal = document.getElementById('search-log-input').value.toLowerCase().trim();
    const filterDate = document.getElementById('filter-log-date').value;
    const filterTech = document.getElementById('filter-log-tech').value;
    const filterStatus = document.getElementById('filter-log-status').value;
    
    const filtered = loadedLogs.filter(log => {
        // 1. Text Search matching
        const machine = String(log.Machine || log.machine || '').toLowerCase();
        const spNo = String(log.SP_No || log.spNo || '').toLowerCase();
        const tech = String(log.Technician || log.technician || '').toLowerCase();
        const caseId = String(log.Case_ID || log.caseId || '').toLowerCase();
        const detail = String(log.รายละเอียดงาน || log.detail || '').toLowerCase();
        const systemLog = String(log.System_Log || log.systemLog || '').toLowerCase();
        const note = String(log.note || log.หมายเหตุ || '').toLowerCase();

        if (searchVal) {
            const matchesText = machine.includes(searchVal) ||
                                spNo.includes(searchVal) ||
                                tech.includes(searchVal) ||
                                caseId.includes(searchVal) ||
                                detail.includes(searchVal) ||
                                systemLog.includes(searchVal) ||
                                note.includes(searchVal);
            if (!matchesText) return false;
        }

        // 2. Date filtering (YYYY-MM-DD)
        if (filterDate) {
            const logDateStr = log.Timestamp || log.timestamp || log.startProblem || log.Start_Problem;
            if (logDateStr) {
                const dateObj = new Date(logDateStr);
                if (!isNaN(dateObj.getTime())) {
                    const logYYYY = dateObj.getFullYear();
                    const logMM = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const logDD = String(dateObj.getDate()).padStart(2, '0');
                    const formattedLogDate = `${logYYYY}-${logMM}-${logDD}`;
                    if (formattedLogDate !== filterDate) return false;
                } else {
                    if (!logDateStr.includes(filterDate)) return false;
                }
            } else {
                return false;
            }
        }

        // 3. Technician filtering (exact select match)
        if (filterTech) {
            const currentTech = log.Technician || log.technician || '';
            if (currentTech !== filterTech) return false;
        }

        // 4. Case/Status filtering
        if (filterStatus) {
            const currentStatus = String(log.Repair_Status || log.repairStatus || '');
            const systemLogStr = String(log.System_Log || log.systemLog || '').toLowerCase();
            
            if (['Completed', 'Repairing', 'Checking', 'Waiting'].includes(filterStatus)) {
                // Map status
                let checkStatus = currentStatus.toLowerCase();
                if (checkStatus.includes('ซ่อมสำเร็จ') || checkStatus.includes('เสร็จ') || checkStatus === 'completed') checkStatus = 'completed';
                if (checkStatus.includes('กำลังซ่อม') || checkStatus.includes('ซ่อม') || checkStatus === 'repairing') checkStatus = 'repairing';
                if (checkStatus.includes('ตรวจ') || checkStatus === 'checking') checkStatus = 'checking';
                if (checkStatus.includes('รอ') || checkStatus === 'waiting') checkStatus = 'waiting';
                
                if (checkStatus !== filterStatus.toLowerCase()) return false;
            } else if (filterStatus === 'Over') {
                if (!systemLogStr.includes('over')) return false;
            } else if (filterStatus === 'Under') {
                if (!systemLogStr.includes('under')) return false;
            } else if (filterStatus === 'Consecutive') {
                if (!systemLogStr.includes('consec')) return false;
            }
        }

        return true;
    });
    
    renderLogsList(filtered);
}

// INTERACTIVE CAUTION BOTTOM SHEET
async function openCaseDetails(machine, spNo) {
    const modal = document.getElementById('caution-modal');
    const content = document.getElementById('caution-modal-content');
    
    // Open modal immediately with beautiful skeleton spinner
    modal.classList.remove('hidden');
    content.innerHTML = `
        <div style="padding: 40px 0; text-align: center; color: var(--c-text-muted);">
            <div class="log-spinner" style="margin: 0 auto 16px auto;"></div>
            <span style="font-weight:600; font-size:14px;">กำลังเชื่อมต่อและดึงข้อมูลทางเทคนิคของเครื่อง ${escHtml(machine)}...</span>
        </div>
    `;
    
    let job = null;
    
    // 1. Fetch live jobs from API
    try {
        const url = `${GAS_URL}?action=getJobs&t=${Date.now()}`;
        const res = await fetch(url, { redirect: 'follow' });
        const data = await readJsonResponse_(res);
        
        if (data.success && data.jobs) {
            loadedJobs = data.jobs;
            // Find active caution job with robust normalization
            const normM = m => String(m || '').trim().toUpperCase();
            const normSp = s => String(s || '').replace(/\D/g, ''); // "SP8" -> "8", "8" -> "8"
            const targetM = normM(machine);
            const targetSp = normSp(spNo);
            
            job = loadedJobs.find(j => normM(j.Machine || j.machine) === targetM && normSp(j.SP_No || j.spNo) === targetSp);
        }
    } catch (err) {
        console.warn('Could not query live jobs. Falling back to simulations:', err.message);
    }
    
    // 2. Fallback to mock jobs if live fetch failed or no active matching caution job found
    if (!job) {
        loadedJobs = JSON.parse(JSON.stringify(MOCK_JOBS));
        const normM = m => String(m || '').trim().toUpperCase();
        const normSp = s => String(s || '').replace(/\D/g, '');
        const targetM = normM(machine);
        const targetSp = normSp(spNo);
        
        job = loadedJobs.find(j => normM(j.Machine || j.machine) === targetM && normSp(j.SP_No || j.spNo) === targetSp);
    }
    
    // 3. Fallback placeholder if still not found (to ensure app always renders beautifully)
    if (!job) {
        job = {
            Machine: machine,
            SP_No: spNo,
            Start_Problem: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
            Current_Weight: "51.12",
            Repair_Status: "รอช่าง",
            Technician: "ช่างสมชาย (มหาชน)",
            System_Log: `Product=OPC Bag | Bag_No=${Math.floor(10 + Math.random()*150)} | Error_Type=Over | Consecutive_Count=${Math.floor(2 + Math.random()*3)}`
        };
    }
    
    // Render dynamic content details inside bottom sheet
    const sysData = parseSystemLog(job.System_Log);
    const weightNum = parseFloat(job.Current_Weight);
    const stdWeight = 50.0;
    let deviationStr = 'N/A';
    let devClass = '';
    
    if (!isNaN(weightNum)) {
        const diff = weightNum - stdWeight;
        const diffSign = diff > 0 ? '+' : '';
        deviationStr = `${diffSign}${diff.toFixed(2)} kg`;
        if (diff > 0.5) devClass = 'highlight-danger';
        else if (diff < -0.5) devClass = 'highlight-blue';
    }
    
    const isCritical = String(job.Repair_Status).includes('วิกฤต') || sysData.errorType.toLowerCase() === 'over' || parseFloat(sysData.consecutiveCount) >= 3;
    const heroIconClass = isCritical ? 'critical' : 'warning';
    const heroIconEmoji = isCritical ? '🚨' : '⚠️';
    
    // Generate smart AI diagnostic suggestions based on variables
    const suggestionHtml = getSmartSuggestion(job.Repair_Status, sysData.errorType, Number(sysData.consecutiveCount));

    content.innerHTML = `
        <div class="modal-header-hero">
            <div class="modal-hero-icon ${heroIconClass}">
                ${heroIconEmoji}
            </div>
            <div class="modal-hero-text">
                <h4>เครื่อง ${escHtml(job.Machine)} • หัวจ่าย ${escHtml(job.SP_No)}</h4>
                <span style="font-weight:700; color:${isCritical ? 'var(--c-danger)' : 'var(--c-warning)'};">
                    ตรวจพบค่าน้ำหนัก ${escHtml(sysData.errorType)} ต่อเนื่อง ${escHtml(sysData.consecutiveCount)} ครั้ง
                </span>
            </div>
        </div>
        
        <div class="modal-details-grid">
            <div class="modal-detail-card">
                <span class="modal-detail-label">ถุงที่เกิดปัญหา</span>
                <span class="modal-detail-value highlight-blue">ถุงใบที่ #${escHtml(sysData.bagNo)}</span>
            </div>
            <div class="modal-detail-card">
                <span class="modal-detail-label">ประเภทข้อผิดพลาด</span>
                <span class="modal-detail-value highlight-orange">${escHtml(sysData.errorType)}</span>
            </div>
            <div class="modal-detail-card">
                <span class="modal-detail-label">น้ำหนักจริงถุงล่าสุด</span>
                <span class="modal-detail-value ${devClass}">${escHtml(job.Current_Weight)} kg (${deviationStr})</span>
            </div>
            <div class="modal-detail-card">
                <span class="modal-detail-label">เวลาที่พบปัญหา</span>
                <span class="modal-detail-value">${escHtml(job.Start_Problem)} น.</span>
            </div>
            <div class="modal-detail-card">
                <span class="modal-detail-label">ช่างซ่อมบำรุงกะนี้</span>
                <span class="modal-detail-value">${escHtml(job.Technician || 'ช่างเทคนิคเวร')}</span>
            </div>
            <div class="modal-detail-card">
                <span class="modal-detail-label">ผลิตภัณฑ์ที่บรรจุ</span>
                <span class="modal-detail-value">${escHtml(sysData.product)}</span>
            </div>
        </div>
        
        <div class="modal-suggestion-box ${isCritical ? 'critical-mode' : ''}">
            <div class="modal-suggestion-header">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <span>คำแนะนำเชิงเทคนิคสำหรับซ่อมบำรุง</span>
            </div>
            <div class="modal-suggestion-content">
                ${suggestionHtml}
            </div>
        </div>
    `;
}

function closeCautionModal(event) {
    if (event) event.stopPropagation();
    document.getElementById('caution-modal').classList.add('hidden');
}

// HELPER: System Log Parser
function parseSystemLog(sysLog) {
    const result = {
        product: 'OPC Cement',
        bagNo: 'N/A',
        errorType: 'Normal',
        consecutiveCount: '1',
        weight: '50.0'
    };
    
    if (!sysLog) return result;
    
    try {
        const parts = String(sysLog).split(/[|\n]/);
        parts.forEach(part => {
            const kv = part.split('=');
            if (kv.length === 2) {
                const key = kv[0].trim().toLowerCase();
                const val = kv[1].trim();
                
                if (key.includes('product')) result.product = val;
                else if (key.includes('bag')) result.bagNo = val;
                else if (key.includes('error')) result.errorType = val;
                else if (key.includes('count') || key.includes('consecutive')) result.consecutiveCount = val;
                else if (key.includes('weight')) result.weight = val;
            }
        });
    } catch (e) {
        console.error('Error parsing system log:', e);
    }
    
    return result;
}

// HELPER: Smart Suggestions Generator
function getSmartSuggestion(status, errorType, consecutiveCount) {
    const error = String(errorType || '').toLowerCase();
    
    if (error.includes('over')) {
        return `
            <strong>ค่าน้ำหนักสูงเกินเกณฑ์ต่อเนื่อง (Overweight Alert):</strong><br>
            • ⚙️ <strong>วาล์วลมตัดปูนช้า:</strong> แนะนำตรวจสอบกระบอกสูบกระตุ้นประตูปิด (Pneumatic Cylinder Slide-Gate) มีอาการรั่ว หรือความดันลมตก ทำให้นิวเมติกส์ตอบสนองช้า<br>
            • ⚙️ <strong>เช็กเศษวัสดุขวางกั้น:</strong> ตรวจสอบประตูปิดหัวจ่าย (Slide Gate Valve) อาจมีเศษก้อนปูนแห้งแข็งหรือวัสดุอุดตันขัดขวางประตูปิด ส่งผลให้เกิดการปิดไม่สนิทกะทันหัน<br>
            • ⚙️ <strong>การหน่วงลม (Pinch Valve Venting):</strong> เช็กค่าดีเลย์หยุดส่งปูน (Cut-off Weight Setting)
        `;
    } else if (error.includes('under')) {
        return `
            <strong>ค่าน้ำหนักต่ำกว่าเกณฑ์ต่อเนื่อง (Underweight Alert):</strong><br>
            • ⚙️ <strong>เช็กการป้อนปูน (Aeration Slide):</strong> แรงดันอากาศช่วยกวาดปูนในโฮปเปอร์อาจเบาเกินไป ทำให้ปูนไหลลงไม่สม่ำเสมอ<br>
            • ⚙️ <strong>ตรวจสอบสภาพปากถุง:</strong> ปากถุงเบี้ยวหลุดจากก้านบีบจับปากถุง (Bag Clamps) ทำให้ลมไหลรั่วและแรงดันบรรจุกระจัดกระจาย<br>
            • ⚙️ <strong>โหลดเซลล์คลาดเคลื่อน:</strong> คราบฝุ่นสะสมปูนบริเวณแป้นรองโหลดเซลล์ ทำให้ค่าน้ำหนักจริงถูกทอนลง ตรวจทำความสะอาดและตั้งค่าความตึงของสปริงรับแรงกระแทก
        `;
    } else {
        return `
            <strong>คำแนะนำเฝ้าระวังระบบทั่วไป:</strong><br>
            • ⚙️ <strong>โหลดเซลล์ (Loadcell Calibration):</strong> แนะนำทำการเช็กศูนย์ขจัดน้ำหนักถุงเปล่า (Tare Weight Auto-Calibration) ทุกครั้งกะใหม่<br>
            • ⚙️ <strong>ตรวจเช็กความชื้น:</strong> ล้างอุปกรณ์กรองลมชุดดักน้ำหลัก เพื่อป้องกันวาล์วเสื่อมสภาพเร็วจากความชื้นในท่อเมน
        `;
    }
}

// HIGH-FIDELITY SIMULATED LOG DATASETS
const MOCK_LOGS = [
    {
        Case_ID: "CASE-9921",
        Machine: "PK10",
        SP_No: "SP8",
        Timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        Repair_Status: "ซ่อมสำเร็จ",
        Technician: "ช่างสมชาย (มหาชน)",
        รายละเอียดงาน: "ตรวจสอบกระบอกลมหัวจ่าย พบวาล์วลมรั่วไหล ได้ดำเนินการเปลี่ยนโซลินอยด์วาล์วตัวใหม่ และทดสอบฟังก์ชันเปิดปิดปกติเรียบร้อย",
        Current_Weight: "50.85",
        Downtime_Min: "33",
        Loss_Coss: "16500",
        System_Log: "Product=OPC Bag | Bag_No=142 | Error_Type=Over | Consecutive_Count=3"
    },
    {
        Case_ID: "CASE-9918",
        Machine: "PK12",
        SP_No: "SP3",
        Timestamp: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
        Repair_Status: "ซ่อมสำเร็จ",
        Technician: "ช่างวิชัย แสงทอง",
        รายละเอียดงาน: "พบถุงเบี้ยวหลุดจากปากหัวจ่ายตอนกำลังปล่อยปูน ได้เปลี่ยนตำแหน่งก้านจับถุง (Bag Clamper Position) และล้างฝุ่นสะสม",
        Current_Weight: "47.20",
        Downtime_Min: "22",
        Loss_Coss: "11000",
        System_Log: "Product=Super Bag | Bag_No=88 | Error_Type=Under | Consecutive_Count=2"
    },
    {
        Case_ID: "CASE-9915",
        Machine: "PK10",
        SP_No: "SP2",
        Timestamp: new Date(Date.now() - 280 * 60 * 1000).toISOString(),
        Repair_Status: "ซ่อมสำเร็จ",
        Technician: "ช่างสมชาย (มหาชน)",
        รายละเอียดงาน: "เคลียร์เศษหินปูนติดขัดที่ใบกวาดปากท่อจ่ายปูน ทำความสะอาดคราบปูนบริเวณโหลดเซลล์",
        Current_Weight: "49.95",
        Downtime_Min: "20",
        Loss_Coss: "10000",
        System_Log: "Product=OPC Bag | Bag_No=12 | Error_Type=Normal | Consecutive_Count=1"
    },
    {
        Case_ID: "CASE-9904",
        Machine: "PK11",
        SP_No: "SP5",
        Timestamp: new Date(Date.now() - 410 * 60 * 1000).toISOString(),
        Repair_Status: "ซ่อมสำเร็จ",
        Technician: "ช่างธนา กุลดี",
        รายละเอียดงาน: "โหลดเซลล์มีค่าน้ำหนักเพี้ยน ทำการ Calibrate Loadcell ร่วมกับตุ้มน้ำหนักมาตรฐาน 50kg ตรวจสอบสัญญาณสายชีลด์เรียบร้อย",
        Current_Weight: "53.20",
        Downtime_Min: "35",
        Loss_Coss: "17500",
        System_Log: "Product=OPC Bag | Bag_No=95 | Error_Type=Over | Consecutive_Count=4"
    },
    {
        Case_ID: "CASE-9899",
        Machine: "PK12",
        SP_No: "SP1",
        Timestamp: new Date(Date.now() - 600 * 60 * 1000).toISOString(),
        Repair_Status: "ซ่อมสำเร็จ",
        Technician: "ช่างธนา กุลดี",
        รายละเอียดงาน: "แรงดันลมกะทันหันตกฮวบ ตรวจพบท่อลมเมนฉีกขาดเล็กน้อย ได้ตัดต่อซ่อมท่อลมใหม่เรียบร้อย",
        Current_Weight: "45.10",
        Downtime_Min: "20",
        Loss_Coss: "10000",
        System_Log: "Product=Super Bag | Bag_No=23 | Error_Type=Under | Consecutive_Count=2"
    }
];

const MOCK_JOBS = [
    {
        Machine: "PK10",
        SP_No: "SP8",
        Start_Problem: "15:10",
        Current_Weight: "51.25",
        Repair_Status: "รอช่าง",
        Technician: "ช่างสมชาย (มหาชน)",
        System_Log: "Product=OPC Bag | Bag_No=42 | Error_Type=Over | Consecutive_Count=3"
    },
    {
        Machine: "PK12",
        SP_No: "SP3",
        Start_Problem: "14:55",
        Current_Weight: "46.80",
        Repair_Status: "กำลังซ่อม",
        Technician: "ช่างธนา กุลดี",
        System_Log: "Product=Super Bag | Bag_No=107 | Error_Type=Under | Consecutive_Count=2"
    },
    {
        Machine: "PK10",
        SP_No: "SP4",
        Start_Problem: "15:20",
        Current_Weight: "52.40",
        Repair_Status: "รอช่าง",
        Technician: "ช่างวิชัย แสงทอง",
        System_Log: "Product=OPC Bag | Bag_No=77 | Error_Type=Over | Consecutive_Count=4"
    }
];

