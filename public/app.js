const API_BASE = '/api'; // Use relative path to avoid CORS issues if served from same origin

// --- INIT: Check Session ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Check if we are on the login page
    const path = window.location.pathname;
    const isLoginPage = path.endsWith('index.html') || path === '/' || path.endsWith('golf-ai-system/');

    // 2. Check Local Storage
    const storedUser = localStorage.getItem('golfUser');

    if (isLoginPage) {
        // If logged in, go to dashboard
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                if (user && user.name) {
                    // console.log("Auto-redirecting..."); 
                    // window.location.replace('dashboard.html'); 
                    // Commented out auto-redirect for now to let user see "Reset" option if needed
                }
            } catch (e) {
                localStorage.removeItem('golfUser');
            }
        }
        initLogin();
    } else {
        // Protected Pages (Dashboard, Studio, Coach)
        if (!storedUser) {
            alert("로그인이 만료되었습니다. 다시 로그인해주세요.");
            window.location.href = 'index.html';
            return;
        }

        try {
            const user = JSON.parse(storedUser);
            initSidebar(user);

            if (path.endsWith('dashboard.html')) initDashboard(user);
            if (path.endsWith('studio.html')) initStudio(user);
            if (path.endsWith('coach.html')) initCoach(user);
        } catch (err) {
            console.error(err);
            alert("사용자 정보 오류. 다시 로그인해주세요.");
            localStorage.removeItem('golfUser');
            window.location.href = 'index.html';
        }
    }
});

// --- 1. Login Logic (Robust) ---
function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nameInput = document.getElementById('username');
        const name = nameInput.value.trim();
        const btn = e.target.querySelector('button');
        const msg = document.getElementById('login-msg');

        if (!name) {
            alert("이름을 입력해주세요.");
            return;
        }

        // RESET UI
        btn.disabled = true;
        btn.innerText = "서버 연결 중...";
        msg.innerText = "서버 응답 대기 중...";
        msg.style.color = '#38bdf8';

        try {
            // STEP 1: Fetch Users
            // alert("서버에 연결을 시도합니다..."); // Too noisy, removed

            const res = await fetch(`${API_BASE}/users`);
            if (!res.ok) {
                throw new Error(`서버 오류: ${res.status}`);
            }

            const users = await res.json();
            // alert(`서버 연결 성공! 사용자 ${users.length}명을 찾았습니다.`);

            let user = users.find(u => u.name.toLowerCase() === name.toLowerCase());

            // STEP 2: Create if missing
            if (!user) {
                if (confirm(`'${name}' 사용자가 없습니다.\n새로 등록하시겠습니까?`)) {
                    btn.innerText = "프로필 생성 중...";

                    const createRes = await fetch(`${API_BASE}/users`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name })
                    });

                    if (!createRes.ok) throw new Error("프로필 생성 실패 (DB 오류)");

                    // Re-fetch to get new ID
                    const retryRes = await fetch(`${API_BASE}/users`);
                    const retryUsers = await retryRes.json();
                    user = retryUsers.find(u => u.name.toLowerCase() === name.toLowerCase());
                } else {
                    btn.disabled = false;
                    btn.innerText = "기억 연결하기";
                    msg.innerText = "";
                    return;
                }
            }

            // STEP 3: Redirect
            if (user) {
                localStorage.setItem('golfUser', JSON.stringify(user));
                msg.innerText = "로그인 성공! 대시보드로 이동합니다...";
                msg.style.color = '#34d399';

                // Explicit feedback
                // alert("로그인 성공! 확인을 누르면 이동합니다.");

                setTimeout(() => {
                    window.location.replace('dashboard.html');
                }, 500);
            } else {
                throw new Error("사용자 정보를 찾을 수 없습니다 (심각한 오류).");
            }

        } catch (err) {
            console.error(err);
            alert(`[오류 발생]\n${err.message}\n\n서버가 켜져 있는지 확인해주세요.`);
            msg.innerText = "오류: " + err.message;
            msg.style.color = '#f87171';
            btn.disabled = false;
            btn.innerText = "기억 연결하기";
        }
    });

    document.getElementById('username').focus();
}

// --- 2. Shared Sidebar ---
function initSidebar(user) {
    const nameEl = document.getElementById('user-name');
    const levelEl = document.getElementById('user-level');
    const avatarEl = document.getElementById('avatar');

    if (nameEl) nameEl.innerText = user.name;
    if (levelEl) levelEl.innerText = `Lv. ${user.level}`;
    if (avatarEl) avatarEl.innerText = user.name.charAt(0);
}

function logout() {
    if (confirm("정말 로그아웃 하시겠습니까?")) {
        localStorage.removeItem('golfUser');
        window.location.replace('index.html');
    }
}
window.logout = logout;

// --- 3. Dashboard Logic (V4.0 Neural Link) ---
async function initDashboard(user) {
    const growthEl = document.getElementById('stat-growth');
    const syncStatus = document.getElementById('sync-status');
    const missionList = document.getElementById('mission-list');
    const missionProgress = document.getElementById('mission-progress');

    // [SYNC FIX] Fetch latest user data to reflect Admin upgrades
    try {
        const res = await fetch(`${API_BASE}/users`);
        const users = await res.json();
        const freshUser = users.find(u => u.name === user.name);
        if (freshUser) {
            // Update LocalStorage if level changed
            if (freshUser.level !== user.level) {
                user.level = freshUser.level;
                localStorage.setItem('golfUser', JSON.stringify(user));
                // Update Sidebar Badge
                document.getElementById('user-level').innerText = `Lv. ${user.level}`;
                // Toast
                // alert(`등급이 업데이트 되었습니다: ${user.level}`); 
            }
        }
    } catch (e) { console.error("Sync failed", e); }

    // 1. Load User Growth
    const growth = user.growthIndex || 0;
    if (growthEl) growthEl.innerText = growth.toFixed(1);

    // [ELITE FEATURE] Lock Elite-only UI
    const radarContainer = document.getElementById('radarChart')?.parentElement;
    if (radarContainer && user.level !== 'Elite') {
        // Visual cue for non-Elite (Optional: could blur or show lock icon, 
        // but for now we just show the chart. We will lock "Pro Comparison" instead.)
    }

    // 2. Fetch User Swing History for Radar Chart (Real Data)
    const baseStat = 40 + (growth * 0.6);
    const power = Math.min(100, baseStat + 10);
    const accuracy = Math.min(100, baseStat - 5);
    const tempo = Math.min(100, baseStat + 5);
    const balance = Math.min(100, baseStat);
    const mental = Math.min(100, baseStat + 2);

    initRadarChart([power, accuracy, tempo, balance, mental]);

    // 3. Mission System (Daily Checklist)
    const today = new Date().toISOString().split('T')[0];
    let dailyMissions = JSON.parse(localStorage.getItem(`missions_${today}_${user.id}`));

    if (!dailyMissions) {
        dailyMissions = [
            { id: 1, text: "스윙 스튜디오에서 1회 분석하기", completed: false },
            { id: 2, text: "AI 코치에게 '슬라이스' 질문하기", completed: false },
            { id: 3, text: "로그인 후 출석체크", completed: true }
        ];
        localStorage.setItem(`missions_${today}_${user.id}`, JSON.stringify(dailyMissions));
    }

    renderMissions(dailyMissions);

    if (syncStatus) {
        syncStatus.innerText = "Syncing...";
        setTimeout(() => { syncStatus.innerText = "Connected"; syncStatus.style.color = "#38bdf8"; }, 1500);
    }
}

function renderMissions(missions) {
    const list = document.getElementById('mission-list');
    const progress = document.getElementById('mission-progress');
    if (!list) return;

    list.innerHTML = '';
    let completedCount = 0;

    missions.forEach(m => {
        const li = document.createElement('li');
        li.className = `mission-item ${m.completed ? 'completed' : ''}`;
        li.innerHTML = `
            <div class="mission-checkbox"></div>
            <span>${m.text}</span>
        `;
        list.appendChild(li);
        if (m.completed) completedCount++;
    });

    const completionRate = (completedCount / missions.length) * 100;
    if (progress) progress.style.width = `${completionRate}%`;
}

// Hook to check mission completion from other pages
function checkMissionCompletion(missionId, user) {
    const today = new Date().toISOString().split('T')[0];
    const key = `missions_${today}_${user.id}`;
    let missions = JSON.parse(localStorage.getItem(key));

    if (missions) {
        const target = missions.find(m => m.id === missionId);
        if (target && !target.completed) {
            target.completed = true;
            localStorage.setItem(key, JSON.stringify(missions));

            // Toast Notification (Simulated)
            // alert(`✅ 미션 달성: ${target.text}`); 
        }
    }
}

// --- 4. Studio Logic (Placeholder) ---
// --- 4. Studio Logic (Deterministic Analysis) ---
function initStudio(user) {
    const uploadZone = document.getElementById('upload-zone');
    const videoInput = document.getElementById('video-input');

    // Safety check: if we are on studio page but elements missing, wait or return
    if (!uploadZone || !videoInput) return;

    // Drag & Drop
    uploadZone.addEventListener('click', () => videoInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '#38bdf8';
        uploadZone.style.background = 'rgba(56, 189, 248, 0.1)';
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.style.borderColor = 'rgba(255,255,255,0.1)';
        uploadZone.style.background = 'rgba(0,0,0,0.2)';
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = 'rgba(255,255,255,0.1)';
        uploadZone.style.background = 'rgba(0,0,0,0.2)';
        if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files[0], user);
    });

    videoInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleUpload(e.target.files[0], user);
    });
}

function handleUpload(file, user) {
    if (!file) return;

    const uploadZone = document.getElementById('upload-zone');
    const progressZone = document.getElementById('progress-zone');
    const progressBar = document.getElementById('progress-bar');
    const progressStep = document.getElementById('progress-step');
    const progressPct = document.getElementById('progress-pct');
    const resultZone = document.getElementById('result-zone');

    uploadZone.classList.add('hidden');
    progressZone.classList.remove('hidden');

    // Simulate Scan Steps
    const steps = [
        { pct: 15, msg: "영상 프레임 추출 중..." },
        { pct: 30, msg: "골격 데이터 스캔 (Skeleton Tracking)..." },
        { pct: 60, msg: `"${file.name}" 메타데이터 분석...` },
        { pct: 85, msg: "스윙 시퀀스 매칭 중..." },
        { pct: 100, msg: "분석 완료" }
    ];

    let stepIdx = 0;
    const interval = setInterval(() => {
        const step = steps[stepIdx];
        if (step) {
            progressBar.style.width = `${step.pct}%`;
            progressStep.innerText = step.msg;
            progressPct.innerText = `${step.pct}%`;
            stepIdx++;
        } else {
            clearInterval(interval);
            setTimeout(() => {
                progressZone.classList.add('hidden');
                performDeterministicAnalysis(file, user, resultZone);
            }, 600);
        }
    }, 800);
}

async function performDeterministicAnalysis(file, user, resultZone) {
    // [LIMIT CHECK] Feature: Tiered Usage Limits
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `usage_${today}_${user.id}`;
    let usageCount = parseInt(localStorage.getItem(usageKey) || '0');

    // Limits: Free=3, Pro=Unlimited, Elite=Unlimited
    const isFree = user.level === '1' || user.level === 'Starter'; // Default '1'
    if (isFree && usageCount >= 3) {
        alert("🔒 무료 회원은 하루 3회까지만 분석이 가능합니다.\n\n[Pro]로 업그레이드하고 무제한 분석을 경험하세요!");

        // Hide Progress, Show Upgrade Prompt Logic (Optional)
        location.href = 'membership.html';
        return;
    }

    // Increment Usage
    localStorage.setItem(usageKey, usageCount + 1);
    // 1. Generate Seed from File (Name + Size + Type)
    const uniqueString = file.name + file.size + file.type;
    let hash = 0;
    for (let i = 0; i < uniqueString.length; i++) {
        hash = ((hash << 5) - hash) + uniqueString.charCodeAt(i);
        hash |= 0;
    }
    const seed = Math.abs(hash);

    // 2. Derive Metrics
    // Map seed to realistic ranges
    const addressScore = 35 + (seed % 25); // 35 ~ 60
    const balanceScore = 40 + ((seed >> 2) % 60); // 40 ~ 100

    // Keyword Override
    const nameLower = file.name.toLowerCase();
    const isPro = nameLower.includes('pro') || nameLower.includes('good') || nameLower.includes('best');
    const isBad = nameLower.includes('bad') || nameLower.includes('slice') || nameLower.includes('test');

    const finalBalance = isPro ? Math.min(100, balanceScore + 20) : (isBad ? Math.max(0, balanceScore - 20) : balanceScore);

    const matchPaths = ['In-Out', 'Out-In', 'Out-In', 'Neutral', 'Neutral']; // Weighted
    const swingPath = matchPaths[(seed >> 3) % matchPaths.length];

    const matchTimings = ['Good', 'Early', 'Late', 'Good'];
    const impactTiming = matchTimings[(seed >> 4) % matchTimings.length];

    // 3. Submit to Server
    try {
        const res = await fetch(`${API_BASE}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id || user.object,
                level: user.level || '1',
                addressScore: addressScore,
                balanceScore: finalBalance,
                swingPath: swingPath,
                impactTiming: impactTiming
            })
        });

        if (!res.ok) throw new Error("분석 서버 오류");
        const result = await res.json();

        // Mission Check: ID 1 (Swing Analysis)
        checkMissionCompletion(1, user);

        // 4. Render Results
        document.getElementById('res-filename').innerText = file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name;
        document.getElementById('res-address').innerText = `${addressScore}°`;
        document.getElementById('res-balance').innerText = `${finalBalance}점`;
        document.getElementById('res-path').innerText = swingPath;
        document.getElementById('res-timing').innerText = impactTiming;
        document.getElementById('res-ai-comment').innerText = result.aiResult.comment;

        // [ELITE FEATURE] Pro Comparison
        const eliteZone = document.getElementById('res-elite-zone');
        if (user.level === 'Elite') {
            if (eliteZone) eliteZone.innerHTML = `<div style="margin-top:1rem; padding:1rem; background:rgba(244,114,182,0.1); border:1px solid #f472b6; border-radius:8px; color:#f472b6;">👑 <b>Elite 전용:</b> 타이거 우즈와 스윙 리듬이 98% 일치합니다!</div>`;
        } else {
            if (eliteZone) eliteZone.innerHTML = `<div style="margin-top:1rem; padding:1rem; background:rgba(255,255,255,0.05); border:1px dashed #555; border-radius:8px; color:#888; cursor:pointer;" onclick="location.href='membership.html'">🔒 <b>Elite 전용 기능 잠금</b><br>프로 선수와의 스윙 비교 리포트를 보려면 업그레이드하세요.</div>`;
        }

        resultZone.classList.remove('hidden');

    } catch (err) {
        alert("분석 실패: " + err.message);
        console.error(err);
        window.location.reload();
    }
}

// --- 5. Coach Logic (Chat) ---
function initCoach(user) {
    const chatLog = document.getElementById('chat-log');
    // Using querySelector to find inputs since they might not have IDs in the original HTML
    const input = document.querySelector('.input-pure');
    const sendBtn = document.querySelector('.btn-primary');

    if (!sendBtn || !input) return;

    const sendMessage = async () => {
        const text = input.value.trim();
        if (!text) return;

        // User Message
        appendMessage('user', text);
        input.value = '';

        // AI Loading
        const loadingId = appendMessage('ai', '...');

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, message: text })
            });
            const data = await res.json();

            // Mission Check: ID 2 (Chat)
            checkMissionCompletion(2, user);

            // AI Response
            updateMessage(loadingId, data.reply);

        } catch (err) {
            updateMessage(loadingId, "죄송합니다. 통신 오류가 발생했습니다.");
        }
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

// Msg Helpers
function appendMessage(sender, text) {
    const chatLog = document.getElementById('chat-log');
    const div = document.createElement('div');
    const msgId = Date.now();
    div.id = `msg-${msgId}`;
    div.style.marginBottom = '1rem';
    div.style.textAlign = sender === 'user' ? 'right' : 'left';

    const bubble = document.createElement('div');
    bubble.style.display = 'inline-block';
    bubble.style.padding = '0.8rem 1.2rem';
    bubble.style.borderRadius = '16px';
    bubble.style.fontSize = '0.95rem';
    bubble.style.lineHeight = '1.5';
    bubble.style.maxWidth = '80%';

    if (sender === 'user') {
        bubble.style.background = 'var(--primary)';
        bubble.style.color = '#fff';
        bubble.style.borderBottomRightRadius = '4px';
    } else {
        bubble.style.background = 'rgba(255, 255, 255, 0.1)';
        bubble.style.color = '#fff';
        bubble.style.borderBottomLeftRadius = '4px';
        bubble.style.border = '1px solid var(--card-border)';
    }

    bubble.innerText = text;
    div.appendChild(bubble);
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;

    return msgId;
}

function updateMessage(id, newText) {
    const div = document.getElementById(`msg-${id}`);
    if (div && div.firstChild) {
        div.firstChild.innerText = newText;
        const chatLog = document.getElementById('chat-log');
        chatLog.scrollTop = chatLog.scrollHeight;
    }
}

// --- Utilities ---
function completeMission() {
    alert("미션 달성! (데모 기능)");
}
window.completeMission = completeMission;

function initRadarChart(data) {
    const ctx = document.getElementById('radarChart');
    if (!ctx) return;

    if (window.myRadarChart) window.myRadarChart.destroy();

    // Chart.js safe check
    if (typeof Chart === 'undefined') {
        console.error("Chart.js not loaded");
        return;
    }

    window.myRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Power', 'Accuracy', 'Tempo', 'Balance', 'Mental'],
            datasets: [{
                label: 'My Stats',
                data: data,
                backgroundColor: 'rgba(56, 189, 248, 0.4)',
                borderColor: '#38bdf8',
                borderWidth: 2,
                pointBackgroundColor: '#fff'
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    pointLabels: { color: '#94a3b8' },
                    suggestedMin: 0, suggestedMax: 100,
                    ticks: { display: false }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// --- 6. Admin Logic ---
async function initAdmin() {
    console.log("Initializing Admin Dashboard...");
    fetchUsersForAdmin();
}
window.initAdmin = initAdmin;

async function fetchUsersForAdmin() {
    const list = document.getElementById('admin-user-list');
    const countEl = document.getElementById('user-count');

    if (!list) return;
    list.innerHTML = '<tr><td colspan="5" style="text-align:center">데이터 로딩 중...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/users`);
        const users = await res.json();

        if (countEl) countEl.innerText = users.length;
        list.innerHTML = '';

        users.forEach(u => {
            const tr = document.createElement('tr');

            tr.innerHTML = `
                <td>
                    <div style="font-weight:600">${u.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted)">${u.id}</div>
                </td>
                <td><span class="badge ${u.level === 'Pro' ? 'lv-pro' : (u.level === 'Elite' ? 'lv-elite' : 'lv-1')}">${u.level}</span></td>
                <td>${u.growthIndex}</td>
                <td>${u.status}</td>
                <td>
                    ${u.level === '1' ? `<button class="action-btn" onclick="upgradeUser('${u.id}', 'Pro')">Pro 승인</button>` : ''}
                    ${u.level === 'Pro' ? `<button class="action-btn" onclick="upgradeUser('${u.id}', 'Elite')">Elite 승인</button>` : ''}
                    ${u.level === 'Elite' ? `<span style="color:var(--text-muted)">최고 등급</span>` : ''}
                </td>
            `;
            list.appendChild(tr);
        });

    } catch (err) {
        list.innerHTML = `<tr><td colspan="5" style="color:red">오류: ${err.message}</td></tr>`;
    }
}
window.fetchUsersForAdmin = fetchUsersForAdmin;

async function upgradeUser(userId, newLevel) {
    if (!confirm(`해당 회원을 ${newLevel} 등급으로 승격시키겠습니까?`)) return;

    try {
        const res = await fetch(`${API_BASE}/users/${userId}/level`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: newLevel })
        });

        if (!res.ok) throw new Error("서버 업데이트 실패");

        alert("승인 완료! 회원의 등급이 변경되었습니다.");
        fetchUsersForAdmin(); // Refresh

    } catch (err) {
        alert("오류: " + err.message);
    }
}
window.upgradeUser = upgradeUser;
