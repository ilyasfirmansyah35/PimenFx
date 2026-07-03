document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Constants
    const SEMESTER_1 = [0, 1, 2, 3, 4, 5]; // Jan - Jun
    const SEMESTER_2 = [6, 7, 8, 9, 10, 11]; // Jul - Des
    const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    // State
    let state = {
        initialBalance: 10000000,
        semester: 2, 
        year: 2026,
        activeMonth: 6, 
        monthlySettings: {}, 
        dailyData: {},
        supabaseUrl: '',
        supabaseKey: '',
        syncKey: ''
    };

    // Cache for compounding results
    let calculatedSemesterData = {}; 
    let syncDebounceTimer;

    // Formatting Helpers
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', { 
            style: 'currency', 
            currency: 'IDR', 
            minimumFractionDigits: 0, 
            maximumFractionDigits: 0 
        }).format(amount);
    };

    // Load state from local storage
    function loadState() {
        const saved = localStorage.getItem('pimenfx_state_v4');
        if (saved) {
            state = { ...state, ...JSON.parse(saved) };
        } else {
            // Check legacy versions
            const oldSaved = localStorage.getItem('compoundAppStateV3') || localStorage.getItem('compoundAppStateV2') || localStorage.getItem('compoundAppState');
            if (oldSaved) {
                const parsed = JSON.parse(oldSaved);
                state.initialBalance = parsed.initialBalance || 10000000;
                state.semester = parsed.semester || 2;
                state.year = parsed.year || 2026;
                state.monthlySettings = parsed.monthlySettings || {};
                state.dailyData = parsed.dailyData || {};
                state.supabaseUrl = parsed.supabaseUrl || '';
                state.supabaseKey = parsed.supabaseKey || '';
                state.syncKey = parsed.syncKey || '';
            }
        }

        // Initialize target % and expense defaults for all months
        const defaults = [
            { pct: 5, exp: 3000000 }, // Jan
            { pct: 5, exp: 3000000 }, // Feb
            { pct: 5, exp: 3000000 }, // Mar
            { pct: 5, exp: 3000000 }, // Apr
            { pct: 5, exp: 3000000 }, // Mei
            { pct: 5, exp: 3000000 }, // Jun
            { pct: 7, exp: 3000000 }, // Jul
            { pct: 5, exp: 3000000 }, // Agt
            { pct: 5, exp: 3000000 }, // Sep
            { pct: 6, exp: 3000000 }, // Okt
            { pct: 5, exp: 3000000 }, // Nov
            { pct: 8, exp: 3000000 }  // Des
        ];

        for (let i = 0; i < 12; i++) {
            if (!state.monthlySettings[i]) {
                state.monthlySettings[i] = { 
                    targetPct: defaults[i].pct, 
                    expense: defaults[i].exp 
                };
            }
        }

        validateActiveMonth();
    }

    function saveState(skipCloud = false) {
        localStorage.setItem('pimenfx_state_v4', JSON.stringify(state));
        if (!skipCloud) {
            syncPushDebounced();
        }
    }

    function validateActiveMonth() {
        const currentSemesterMonths = state.semester === 1 ? SEMESTER_1 : SEMESTER_2;
        if (!currentSemesterMonths.includes(state.activeMonth)) {
            state.activeMonth = currentSemesterMonths[0];
        }
    }

    // DOM Elements
    const elInitialBalance = document.getElementById('initialBalance');
    const elBtnSem1 = document.getElementById('btnSem1');
    const elBtnSem2 = document.getElementById('btnSem2');
    const elYearInput = document.getElementById('yearInput');
    const elMonthTabs = document.getElementById('monthTabs');
    const elTradingTableBody = document.getElementById('tradingTableBody');
    const elActiveMonthTitle = document.getElementById('activeMonthTitle');

    // Metrics Cards
    const elMetricStartBalance = document.getElementById('metricStartBalance');
    const elMetricTargetPct = document.getElementById('metricTargetPct');
    const elMetricExpense = document.getElementById('metricExpense');
    const elMetricEndBalance = document.getElementById('metricEndBalance');

    // Settings Drawer
    const elToggleSettingsBtn = document.getElementById('toggleSettingsBtn');
    const elSettingsDrawer = document.getElementById('settingsDrawer');
    const elCloseDrawerBtn = document.getElementById('closeDrawerBtn');
    const elDrawerOverlay = document.getElementById('drawerOverlay');
    const elDrawerSettingsList = document.getElementById('drawerSettingsList');
    const elSaveSettingsBtn = document.getElementById('saveSettingsBtn');

    // Cloud inputs
    const elDbUrl = document.getElementById('dbUrl');
    const elDbKey = document.getElementById('dbKey');
    const elDbSyncKey = document.getElementById('dbSyncKey');

    // Drawer triggers
    function openDrawer() {
        // Populate inputs
        elDbUrl.value = state.supabaseUrl;
        elDbKey.value = state.supabaseKey;
        elDbSyncKey.value = state.syncKey;

        renderDrawerSettings();
        elSettingsDrawer.classList.add('open');
        elDrawerOverlay.classList.add('visible');
    }

    function closeDrawer() {
        elSettingsDrawer.classList.remove('open');
        elDrawerOverlay.classList.remove('visible');
    }

    elToggleSettingsBtn.addEventListener('click', openDrawer);
    elCloseDrawerBtn.addEventListener('click', closeDrawer);
    elDrawerOverlay.addEventListener('click', closeDrawer);

    // Initializer
    async function initUI() {
        elInitialBalance.value = state.initialBalance;
        elYearInput.value = state.year;
        
        updateSemesterUI();
        calculateCompounding();
        renderMonthTabs();
        renderActiveMonthDashboard();

        // Perform initial pull from cloud
        if (state.supabaseUrl && state.supabaseKey && state.syncKey) {
            await syncPull();
        } else {
            updateSyncStatus('offline');
        }
    }

    function updateSemesterUI() {
        if (state.semester === 1) {
            elBtnSem1.classList.add('active');
            elBtnSem2.classList.remove('active');
        } else {
            elBtnSem2.classList.add('active');
            elBtnSem1.classList.remove('active');
        }
    }

    // Compounding Calculator
    function calculateCompounding() {
        const months = state.semester === 1 ? SEMESTER_1 : SEMESTER_2;
        let runningBalance = state.initialBalance;

        calculatedSemesterData = {};

        months.forEach(m => {
            const set = state.monthlySettings[m];
            const targetPct = set.targetPct / 100;
            const expense = set.expense;

            const monthStartBalance = runningBalance;
            const daysInMonth = new Date(state.year, m + 1, 0).getDate();
            const dailyRows = [];

            for (let d = 1; d <= daysInMonth; d++) {
                const dateObj = new Date(state.year, m, d);
                const dayOfWeek = dateObj.getDay(); 
                
                // Exclude weekends
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;

                const dateStr = `${state.year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
                const dayData = state.dailyData[dateStr] || { done: false, journal: '' };

                const saldoAwal = runningBalance;
                const targetProfit = saldoAwal * targetPct;
                const saldoAkhir = saldoAwal + targetProfit;

                dailyRows.push({
                    dateStr,
                    dateLabel: `${d} ${MONTH_NAMES[m]}`,
                    dayName,
                    saldoAwal,
                    targetProfit,
                    saldoAkhir,
                    done: dayData.done,
                    journal: (dayData.journal === 'undefined' || !dayData.journal) ? '' : dayData.journal
                });

                runningBalance = saldoAkhir;
            }

            if (expense > 0) {
                runningBalance -= expense;
            }

            calculatedSemesterData[m] = {
                startBalance: monthStartBalance,
                endBalance: runningBalance,
                expense,
                targetPct: set.targetPct,
                dailyRows
            };
        });
    }

    // Month Tabs
    function renderMonthTabs() {
        elMonthTabs.innerHTML = '';
        const months = state.semester === 1 ? SEMESTER_1 : SEMESTER_2;

        months.forEach(m => {
            const btn = document.createElement('button');
            btn.className = `tab-btn ${state.activeMonth === m ? 'active' : ''}`;
            btn.innerHTML = `
                <span class="tab-month-name">${MONTH_NAMES[m]}</span>
                <span class="tab-month-sub">${state.year}</span>
            `;
            btn.addEventListener('click', () => {
                state.activeMonth = m;
                saveState(true); // Don't trigger cloud upload just for changing tabs
                renderMonthTabs();
                renderActiveMonthDashboard();
            });
            elMonthTabs.appendChild(btn);
        });
    }

    // Dashboard info updates
    function renderActiveMonthDashboard() {
        const data = calculatedSemesterData[state.activeMonth];
        if (!data) return;

        elMetricStartBalance.innerText = formatCurrency(data.startBalance);
        elMetricTargetPct.innerText = `${data.targetPct}% / Hari`;
        elMetricExpense.innerText = formatCurrency(data.expense);
        elMetricEndBalance.innerText = formatCurrency(data.endBalance);

        elActiveMonthTitle.innerText = `${MONTH_NAMES[state.activeMonth]} ${state.year}`;

        // Render Table Body
        elTradingTableBody.innerHTML = '';
        data.dailyRows.forEach(row => {
            const tr = document.createElement('tr');
            if (row.done) tr.className = 'row-done';

            tr.innerHTML = `
                <td>
                    <input type="checkbox" class="status-checkbox" data-date="${row.dateStr}" ${row.done ? 'checked' : ''} />
                </td>
                <td>${row.dateLabel}</td>
                <td>${row.dayName}</td>
                <td class="amount">${formatCurrency(row.saldoAwal)}</td>
                <td class="amount profit">+${formatCurrency(row.targetProfit)}</td>
                <td class="amount">${formatCurrency(row.saldoAkhir)}</td>
                <td>
                    <input type="text" class="journal-input" placeholder="Tulis jurnal..." data-date="${row.dateStr}" value="${row.journal}" />
                </td>
            `;
            elTradingTableBody.appendChild(tr);
        });

        lucide.createIcons();
        attachTableEvents();
    }

    function attachTableEvents() {
        document.querySelectorAll('.status-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const dateStr = e.target.getAttribute('data-date');
                if (!state.dailyData[dateStr]) state.dailyData[dateStr] = {};
                state.dailyData[dateStr].done = e.target.checked;
                
                // Recalculate compounding dynamic chain forward
                calculateCompounding();
                renderActiveMonthDashboard();
                saveState();
            });
        });

        document.querySelectorAll('.journal-input').forEach(inp => {
            inp.addEventListener('change', (e) => { 
                const dateStr = e.target.getAttribute('data-date');
                if (!state.dailyData[dateStr]) state.dailyData[dateStr] = {};
                state.dailyData[dateStr].journal = e.target.value;
                saveState();
            });
        });
    }

    // Monthly Settings rendering
    function renderDrawerSettings() {
        elDrawerSettingsList.innerHTML = '';
        const months = state.semester === 1 ? SEMESTER_1 : SEMESTER_2;

        months.forEach(m => {
            const set = state.monthlySettings[m];
            const html = `
                <div class="drawer-month-card">
                    <h4>${MONTH_NAMES[m]}</h4>
                    <div class="drawer-input-row">
                        <div class="drawer-form-group">
                            <label>Target Profit Harian (%)</label>
                            <div class="drawer-input-wrapper">
                                <input type="number" step="0.1" id="drawer_pct_${m}" value="${set.targetPct}" />
                                <span class="suffix">%</span>
                            </div>
                        </div>
                        <div class="drawer-form-group">
                            <label>Pengeluaran Hidup / Bulan (Rp)</label>
                            <div class="drawer-input-wrapper">
                                <span class="prefix">Rp</span>
                                <input type="number" id="drawer_exp_${m}" value="${set.expense}" />
                            </div>
                        </div>
                    </div>
                </div>
            `;
            elDrawerSettingsList.insertAdjacentHTML('beforeend', html);
        });
    }

    // Save settings (both Database Credentials and Monthly Targets)
    elSaveSettingsBtn.addEventListener('click', async () => {
        // 1. Save database settings
        const dbUrlVal = elDbUrl.value.trim();
        const dbKeyVal = elDbKey.value.trim();
        const dbSyncKeyVal = elDbSyncKey.value.trim();

        const credentialsChanged = (state.supabaseUrl !== dbUrlVal || state.supabaseKey !== dbKeyVal || state.syncKey !== dbSyncKeyVal);

        state.supabaseUrl = dbUrlVal;
        state.supabaseKey = dbKeyVal;
        state.syncKey = dbSyncKeyVal;

        // 2. Save monthly targets
        const months = state.semester === 1 ? SEMESTER_1 : SEMESTER_2;
        months.forEach(m => {
            const pctInp = document.getElementById(`drawer_pct_${m}`);
            const expInp = document.getElementById(`drawer_exp_${m}`);
            if (pctInp && expInp) {
                state.monthlySettings[m] = {
                    targetPct: Number(pctInp.value) || 0,
                    expense: Number(expInp.value) || 0
                };
            }
        });

        saveState(credentialsChanged); // If credentials changed, pull first instead of uploading blank
        calculateCompounding();
        renderActiveMonthDashboard();
        closeDrawer();

        if (credentialsChanged) {
            if (state.supabaseUrl && state.supabaseKey && state.syncKey) {
                await syncPull();
            } else {
                updateSyncStatus('offline');
            }
        }
    });

    // Top Controls Event Handlers
    elInitialBalance.addEventListener('change', () => {
        state.initialBalance = Number(elInitialBalance.value) || 0;
        calculateCompounding();
        renderActiveMonthDashboard();
        saveState();
    });

    elYearInput.addEventListener('change', () => {
        state.year = Number(elYearInput.value) || 2026;
        calculateCompounding();
        renderMonthTabs();
        renderActiveMonthDashboard();
        saveState();
    });

    elBtnSem1.addEventListener('click', () => {
        state.semester = 1;
        validateActiveMonth();
        updateSemesterUI();
        calculateCompounding();
        renderMonthTabs();
        renderActiveMonthDashboard();
        saveState();
    });

    elBtnSem2.addEventListener('click', () => {
        state.semester = 2;
        validateActiveMonth();
        updateSemesterUI();
        calculateCompounding();
        renderMonthTabs();
        renderActiveMonthDashboard();
        saveState();
    });

    // --- Supabase Cloud Sync Handlers ---

    async function syncPull() {
        if (!state.supabaseUrl || !state.supabaseKey || !state.syncKey) {
            updateSyncStatus('offline');
            return;
        }

        updateSyncStatus('syncing');
        try {
            const url = `${state.supabaseUrl}/rest/v1/pimenfx_sync?sync_key=eq.${encodeURIComponent(state.syncKey)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': state.supabaseKey,
                    'Authorization': `Bearer ${state.supabaseKey}`
                }
            });

            if (!response.ok) throw new Error('Fetch failed');

            const data = await response.json();
            if (data && data.length > 0) {
                const cloudState = data[0].app_state;
                
                // Merge cloud data safely into state
                state.initialBalance = cloudState.initialBalance || state.initialBalance;
                state.semester = cloudState.semester || state.semester;
                state.year = cloudState.year || state.year;
                state.monthlySettings = cloudState.monthlySettings || state.monthlySettings;
                state.dailyData = { ...state.dailyData, ...cloudState.dailyData };
                
                // Update UI elements to match loaded cloud state
                elInitialBalance.value = state.initialBalance;
                elYearInput.value = state.year;
                
                saveState(true); // Save local copy without looping upload
                updateSemesterUI();
                calculateCompounding();
                renderMonthTabs();
                renderActiveMonthDashboard();
            }
            updateSyncStatus('synced');
        } catch (error) {
            console.error('Supabase Pull Error:', error);
            updateSyncStatus('error');
        }
    }

    function syncPushDebounced() {
        if (!state.supabaseUrl || !state.supabaseKey || !state.syncKey) {
            updateSyncStatus('offline');
            return;
        }

        updateSyncStatus('syncing');
        clearTimeout(syncDebounceTimer);
        
        syncDebounceTimer = setTimeout(async () => {
            try {
                const url = `${state.supabaseUrl}/rest/v1/pimenfx_sync`;
                
                // Upsert to Supabase
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'apikey': state.supabaseKey,
                        'Authorization': `Bearer ${state.supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify({
                        sync_key: state.syncKey,
                        app_state: {
                            initialBalance: state.initialBalance,
                            semester: state.semester,
                            year: state.year,
                            monthlySettings: state.monthlySettings,
                            dailyData: state.dailyData
                        }
                    })
                });

                if (!response.ok) throw new Error('Push failed');
                updateSyncStatus('synced');
            } catch (error) {
                console.error('Supabase Push Error:', error);
                updateSyncStatus('error');
            }
        }, 1500); // 1.5 second delay
    }

    function updateSyncStatus(status) {
        const elSyncStatus = document.getElementById('syncStatus');
        if (!elSyncStatus) return;

        elSyncStatus.className = `sync-status ${status}`;
        const icon = elSyncStatus.querySelector('i');
        const text = elSyncStatus.querySelector('span');

        if (status === 'offline') {
            icon.setAttribute('data-lucide', 'cloud-off');
            text.innerText = 'Lokal';
        } else if (status === 'syncing') {
            icon.setAttribute('data-lucide', 'refresh-cw');
            text.innerText = 'Menyinkronkan...';
        } else if (status === 'synced') {
            icon.setAttribute('data-lucide', 'cloud-lightning');
            text.innerText = 'Tersinkron';
        } else if (status === 'error') {
            icon.setAttribute('data-lucide', 'cloud-rain');
            text.innerText = 'Error Koneksi';
        }
        lucide.createIcons();
    }

    // --- Export Button Actions ---
    const elExportPdfBtn = document.getElementById('exportPdfBtn');
    const elExportExcelMonthBtn = document.getElementById('exportExcelMonthBtn');
    const elExportExcelSemesterBtn = document.getElementById('exportExcelSemesterBtn');

    elExportPdfBtn.addEventListener('click', () => {
        window.print();
    });

    elExportExcelMonthBtn.addEventListener('click', exportMonthToExcel);
    elExportExcelSemesterBtn.addEventListener('click', exportSemesterToExcel);

    function exportMonthToExcel() {
        const data = calculatedSemesterData[state.activeMonth];
        if (!data) return;
        
        const wsData = [
            ["Tanggal", "Hari", "Saldo Awal", "Target Profit", "Saldo Akhir", "Jurnal Catatan"]
        ];
        
        data.dailyRows.forEach(row => {
            wsData.push([
                row.dateLabel,
                row.dayName,
                Number(row.saldoAwal.toFixed(2)),
                Number(row.targetProfit.toFixed(2)),
                Number(row.saldoAkhir.toFixed(2)),
                row.journal
            ]);
        });
        
        wsData.push([]);
        wsData.push(["Kebutuhan Hidup (Pengeluaran)", "", "", "", Number(data.expense), "(Dipotong akhir bulan)"]);
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        ws['!cols'] = [
            { wch: 15 },
            { wch: 12 },
            { wch: 18 },
            { wch: 18 },
            { wch: 18 },
            { wch: 35 }
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, MONTH_NAMES[state.activeMonth]);
        XLSX.writeFile(wb, `PimenFx_Trading_Plan_${MONTH_NAMES[state.activeMonth]}_${state.year}.xlsx`);
    }

    function exportSemesterToExcel() {
        const months = state.semester === 1 ? SEMESTER_1 : SEMESTER_2;
        const wb = XLSX.utils.book_new();
        
        months.forEach(m => {
            const data = calculatedSemesterData[m];
            if (!data) return;
            
            const wsData = [
                ["Tanggal", "Hari", "Saldo Awal", "Target Profit", "Saldo Akhir", "Jurnal Catatan"]
            ];
            
            data.dailyRows.forEach(row => {
                wsData.push([
                    row.dateLabel,
                    row.dayName,
                    Number(row.saldoAwal.toFixed(2)),
                    Number(row.targetProfit.toFixed(2)),
                    Number(row.saldoAkhir.toFixed(2)),
                    row.journal
                ]);
            });
            
            wsData.push([]);
            wsData.push(["Kebutuhan Hidup (Pengeluaran)", "", "", "", Number(data.expense), "(Dipotong akhir bulan)"]);
            
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                { wch: 15 },
                { wch: 12 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 35 }
            ];
            
            XLSX.utils.book_append_sheet(wb, ws, MONTH_NAMES[m]);
        });
        
        XLSX.writeFile(wb, `PimenFx_Trading_Plan_Semester_${state.semester}_${state.year}.xlsx`);
    }

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker Registered'))
                .catch(err => console.log('Service Worker failed', err));
        });
    }

    // Boot Up
    loadState();
    initUI();
});
