// --- SUPABASE CONFIGURATION (HARDCODED) ---
// Tempel URL dan Anon Key Supabase Anda di sini agar user Anda tidak perlu menginputnya secara manual.
const SUPABASE_URL = "MASUKKAN_URL_SUPABASE_DI_SINI";
const SUPABASE_KEY = "MASUKKAN_ANON_KEY_DI_SINI";

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Constants
    const SEMESTER_1 = [0, 1, 2, 3, 4, 5]; // Jan - Jun
    const SEMESTER_2 = [6, 7, 8, 9, 10, 11]; // Jul - Des
    const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    // App State
    let state = {
        initialBalance: 10000000,
        semester: 2, 
        year: 2026,
        activeMonth: 6, 
        monthlySettings: {}, 
        dailyData: {},
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_KEY,
        sessionToken: '', 
        userId: '', 
        userEmail: ''
    };

    // Cache for compounding results
    let calculatedSemesterData = {}; 
    let syncDebounceTimer;
    let authMode = 'login'; 

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
        const saved = localStorage.getItem('pimenfx_auth_state_v5');
        if (saved) {
            state = { ...state, ...JSON.parse(saved) };
        } else {
            // Check legacy versions
            const oldSaved = localStorage.getItem('pimenfx_state_v4') || localStorage.getItem('compoundAppStateV3');
            if (oldSaved) {
                const parsed = JSON.parse(oldSaved);
                state.initialBalance = parsed.initialBalance || 10000000;
                state.semester = parsed.semester || 2;
                state.year = parsed.year || 2026;
                state.monthlySettings = parsed.monthlySettings || {};
                state.dailyData = parsed.dailyData || {};
            }
        }

        // Always force update URL/Key from hardcoded constants
        state.supabaseUrl = SUPABASE_URL;
        state.supabaseKey = SUPABASE_KEY;

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
        localStorage.setItem('pimenfx_auth_state_v5', JSON.stringify(state));
        if (!skipCloud && state.sessionToken && isSupabaseConfigured()) {
            syncPushDebounced();
        }
    }

    function validateActiveMonth() {
        const currentSemesterMonths = state.semester === 1 ? SEMESTER_1 : SEMESTER_2;
        if (!currentSemesterMonths.includes(state.activeMonth)) {
            state.activeMonth = currentSemesterMonths[0];
        }
    }

    function isSupabaseConfigured() {
        return state.supabaseUrl && state.supabaseUrl !== "MASUKKAN_URL_SUPABASE_DI_SINI" && state.supabaseKey && state.supabaseKey !== "MASUKKAN_ANON_KEY_DI_SINI";
    }

    // DOM Elements (Dashboard)
    const elDashboardWrapper = document.getElementById('dashboardWrapper');
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
    const elResetDataBtn = document.getElementById('resetDataBtn');

    // DOM Elements (Auth)
    const elLoginWrapper = document.getElementById('loginWrapper');
    const elAuthForm = document.getElementById('authForm');
    const elAuthEmail = document.getElementById('authEmail');
    const elAuthPassword = document.getElementById('authPassword');
    const elAuthSubmitBtn = document.getElementById('authSubmitBtn');
    const elAuthMessage = document.getElementById('authMessage');
    const elTabLoginBtn = document.getElementById('tabLoginBtn');
    const elTabRegisterBtn = document.getElementById('tabRegisterBtn');
    const elLogoutBtn = document.getElementById('logoutBtn');
    const elLoginTabs = document.querySelector('.login-tabs');

    // Auth Recovery DOM Elements
    const elForgotPasswordLink = document.getElementById('forgotPasswordLink');
    const elRecoverForm = document.getElementById('recoverForm');
    const elRecoverEmail = document.getElementById('recoverEmail');
    const elBackToLoginFromRecoverBtn = document.getElementById('backToLoginFromRecoverBtn');
    
    const elUpdatePasswordForm = document.getElementById('updatePasswordForm');
    const elNewPassword = document.getElementById('newPassword');
    const elCancelResetBtn = document.getElementById('cancelResetBtn');

    // Drawer triggers
    function openDrawer() {
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
    async function init() {
        loadState();

        // Check if there is an incoming recovery hash link (redirected from email link)
        const hash = window.location.hash;
        if (hash && hash.includes('type=recovery') && hash.includes('access_token=')) {
            // Parse hash parameters
            const params = new URLSearchParams(hash.replace('#', '?'));
            const accessToken = params.get('access_token');
            
            if (accessToken) {
                // Temporarily save access token in state to allow password update
                state.sessionToken = accessToken;
                // Clear hash from URL immediately
                window.history.replaceState("", document.title, window.location.pathname);
                
                showLogin();
                elAuthForm.style.display = 'none';
                elRecoverForm.style.display = 'none';
                elLoginTabs.style.display = 'none';
                elUpdatePasswordForm.style.display = 'flex';
                displayAuthMessage('Silakan masukkan password baru Anda.', 'success');
                return;
            }
        }

        // Check if there is an active session
        if (state.sessionToken && isSupabaseConfigured()) {
            showDashboard();
            await syncPull();
        } else {
            showLogin();
        }
    }

    function showDashboard() {
        elLoginWrapper.style.display = 'none';
        elDashboardWrapper.style.display = 'flex';

        elInitialBalance.value = state.initialBalance;
        elYearInput.value = state.year;
        
        updateSemesterUI();
        calculateCompounding();
        renderMonthTabs();
        renderActiveMonthDashboard();
    }

    function showLogin() {
        elDashboardWrapper.style.display = 'none';
        elLoginWrapper.style.display = 'flex';
        updateSyncStatus('offline');
        lucide.createIcons();
    }

    // Handle Authentication Tabs (Login / Register Toggle)
    elTabLoginBtn.addEventListener('click', () => {
        authMode = 'login';
        elTabLoginBtn.classList.add('active');
        elTabRegisterBtn.classList.remove('active');
        elAuthSubmitBtn.querySelector('span').innerText = 'Masuk';
        elAuthMessage.innerText = '';
        elAuthMessage.className = 'auth-message';
    });

    elTabRegisterBtn.addEventListener('click', () => {
        authMode = 'register';
        elTabRegisterBtn.classList.add('active');
        elTabLoginBtn.classList.remove('active');
        elAuthSubmitBtn.querySelector('span').innerText = 'Daftar Akun';
        elAuthMessage.innerText = '';
        elAuthMessage.className = 'auth-message';
    });

    // Form submit: Authentication trigger
    elAuthForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!isSupabaseConfigured()) {
            displayAuthMessage('Supabase belum dikonfigurasi oleh pemilik aplikasi. Mohon lengkapi SUPABASE_URL dan SUPABASE_KEY di file app.js.', 'error');
            return;
        }

        const email = elAuthEmail.value.trim();
        const password = elAuthPassword.value.trim();

        displayAuthMessage(authMode === 'login' ? 'Sedang masuk...' : 'Sedang mendaftar...', 'success');

        try {
            if (authMode === 'login') {
                const response = await fetch(`${state.supabaseUrl}/auth/v1/token?grant_type=password`, {
                    method: 'POST',
                    headers: {
                        'apikey': state.supabaseKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error_description || err.message || 'Login gagal.');
                }

                const data = await response.json();
                state.sessionToken = data.access_token;
                state.userId = data.user.id;
                state.userEmail = data.user.email;
                saveState(true);

                displayAuthMessage('Login berhasil! Mengunduh data...', 'success');
                showDashboard();
                await syncPull();
            } else {
                const response = await fetch(`${state.supabaseUrl}/auth/v1/signup`, {
                    method: 'POST',
                    headers: {
                        'apikey': state.supabaseKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.message || 'Pendaftaran gagal.');
                }

                displayAuthMessage('Pendaftaran berhasil! Silakan cek email Anda untuk konfirmasi pendaftaran akun.', 'success');
            }
        } catch (error) {
            console.error('Auth Error:', error);
            displayAuthMessage(error.message, 'error');
        }
    });

    // Forgot Password Trigger
    elForgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        elAuthForm.style.display = 'none';
        elLoginTabs.style.display = 'none';
        elRecoverForm.style.display = 'flex';
        elAuthMessage.innerText = '';
    });

    // Back to Login Trigger
    elBackToLoginFromRecoverBtn.addEventListener('click', () => {
        elRecoverForm.style.display = 'none';
        elAuthForm.style.display = 'flex';
        elLoginTabs.style.display = 'flex';
        elAuthMessage.innerText = '';
    });

    // Recover Form Submission (Request Reset Link)
    elRecoverForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!isSupabaseConfigured()) {
            displayAuthMessage('Supabase URL/Key belum dikonfigurasi.', 'error');
            return;
        }

        const email = elRecoverEmail.value.trim();
        displayAuthMessage('Sedang mengirim email pemulihan...', 'success');

        try {
            const response = await fetch(`${state.supabaseUrl}/auth/v1/recover`, {
                method: 'POST',
                headers: {
                    'apikey': state.supabaseKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Gagal mengirim email pemulihan.');
            }

            displayAuthMessage('Link reset password telah berhasil dikirim ke email Anda!', 'success');
        } catch (error) {
            console.error('Recover Error:', error);
            displayAuthMessage(error.message, 'error');
        }
    });

    // Cancel Update Password
    elCancelResetBtn.addEventListener('click', () => {
        state.sessionToken = '';
        saveState(true);
        
        elUpdatePasswordForm.style.display = 'none';
        elAuthForm.style.display = 'flex';
        elLoginTabs.style.display = 'flex';
        elAuthMessage.innerText = '';
    });

    // Update Password Submission
    elUpdatePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!isSupabaseConfigured() || !state.sessionToken) {
            displayAuthMessage('Kredensial sesi tidak ditemukan.', 'error');
            return;
        }

        const password = elNewPassword.value.trim();
        if (password.length < 8) {
            displayAuthMessage('Password minimal terdiri dari 8 karakter.', 'error');
            return;
        }

        displayAuthMessage('Sedang memperbarui password...', 'success');

        try {
            const response = await fetch(`${state.supabaseUrl}/auth/v1/user`, {
                method: 'PUT',
                headers: {
                    'apikey': state.supabaseKey,
                    'Authorization': `Bearer ${state.sessionToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Gagal memperbarui password.');
            }

            // Clear session and ask to relogin
            state.sessionToken = '';
            saveState(true);

            displayAuthMessage('Password berhasil diperbarui! Silakan masuk dengan password baru Anda.', 'success');
            setTimeout(() => {
                elUpdatePasswordForm.style.display = 'none';
                elAuthForm.style.display = 'flex';
                elLoginTabs.style.display = 'flex';
                elAuthMessage.innerText = '';
            }, 3000);
        } catch (error) {
            console.error('Update Password Error:', error);
            displayAuthMessage(error.message, 'error');
        }
    });

    function displayAuthMessage(msg, type) {
        elAuthMessage.innerText = msg;
        elAuthMessage.className = `auth-message ${type}`;
    }

    // Logout Action
    elLogoutBtn.addEventListener('click', () => {
        state.sessionToken = '';
        state.userId = '';
        state.userEmail = '';
        saveState(true);
        showLogin();
    });

    // Reset Data Action (Inside settings drawer)
    elResetDataBtn.addEventListener('click', () => {
        if (confirm("Apakah Anda yakin ingin menghapus seluruh centang harian dan catatan jurnal? Tindakan ini tidak dapat dibatalkan.")) {
            state.dailyData = {};
            calculateCompounding();
            renderActiveMonthDashboard();
            saveState();
            closeDrawer();
            alert("Seluruh data plan & jurnal trading berhasil direset!");
        }
    });

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

    // Month Tabs switcher
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
                saveState(true); 
                renderMonthTabs();
                renderActiveMonthDashboard();
            });
            elMonthTabs.appendChild(btn);
        });
    }

    // Render active month content and updates top dashboard cards
    function renderActiveMonthDashboard() {
        const data = calculatedSemesterData[state.activeMonth];
        if (!data) return;

        elMetricStartBalance.innerText = formatCurrency(data.startBalance);
        elMetricTargetPct.innerText = `${data.targetPct}% / Hari`;
        elMetricExpense.innerText = formatCurrency(data.expense);
        elMetricEndBalance.innerText = formatCurrency(data.endBalance);

        elActiveMonthTitle.innerText = `${MONTH_NAMES[state.activeMonth]} ${state.year}`;

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

    // Save settings (Monthly Targets)
    elSaveSettingsBtn.addEventListener('click', async () => {
        // Save monthly settings
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

        saveState();
        calculateCompounding();
        renderActiveMonthDashboard();
        closeDrawer();
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

    // --- Supabase Cloud Sync Handlers with JWT Authorization ---

    async function syncPull() {
        if (!isSupabaseConfigured() || !state.sessionToken) {
            updateSyncStatus('offline');
            return;
        }

        updateSyncStatus('syncing');
        try {
            const url = `${state.supabaseUrl}/rest/v1/pimenfx_user_data?select=*`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': state.supabaseKey,
                    'Authorization': `Bearer ${state.sessionToken}`
                }
            });

            if (response.status === 401) {
                alert("Sesi masuk Anda telah berakhir. Silakan masuk kembali.");
                state.sessionToken = '';
                saveState(true);
                showLogin();
                return;
            }

            if (!response.ok) throw new Error('Fetch failed');

            const data = await response.json();
            if (data && data.length > 0) {
                const cloudState = data[0].app_state;
                
                state.initialBalance = cloudState.initialBalance || state.initialBalance;
                state.semester = cloudState.semester || state.semester;
                state.year = cloudState.year || state.year;
                state.monthlySettings = cloudState.monthlySettings || state.monthlySettings;
                state.dailyData = { ...state.dailyData, ...cloudState.dailyData };
                
                elInitialBalance.value = state.initialBalance;
                elYearInput.value = state.year;
                
                saveState(true); 
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
        if (!isSupabaseConfigured() || !state.sessionToken || !state.userId) {
            updateSyncStatus('offline');
            return;
        }

        updateSyncStatus('syncing');
        clearTimeout(syncDebounceTimer);
        
        syncDebounceTimer = setTimeout(async () => {
            try {
                const url = `${state.supabaseUrl}/rest/v1/pimenfx_user_data`;
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'apikey': state.supabaseKey,
                        'Authorization': `Bearer ${state.sessionToken}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify({
                        user_id: state.userId,
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
        }, 1500); 
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
    init();
});
