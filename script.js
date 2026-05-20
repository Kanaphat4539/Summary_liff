/* ============================================================
   script.js — Revamped LIFF Summary Web App
   Handles state management, dynamic API queries, date conversions,
   and visual updates for Shift & Daily summaries.
   ============================================================ */

const LIFF_ID = '2010082961-GTtjRCn3';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzxFJ0-OxWEWbwh8CzhTd8FndXHcFHWd4PyzK8zapqB8kyH6E5MqnGB3czpaRZlWIwQEg/exec';

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

function viewAllCases() {
    // Redirects to standard repair dashboard
    window.open('https://liff.line.me/2010082961-D0sA72v5', '_blank');
}

function openCaseDetails(machine, spNo) {
    // Direct link to the statusMachine or repair for a specific equipment
    const targetUrl = `../statusMachine/index.html?machine=${encodeURIComponent(machine)}&sp=${encodeURIComponent(spNo)}`;
    window.location.href = targetUrl;
}
