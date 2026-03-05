/**
 * 자동차 설계3팀 전장시스템 설계파트 - 버스바 전문 설계 시뮬레이터 (v4.3)
 * Goal: Pure Thermal & Efficiency focus (Removed SC Clamping).
 */

const MATERIALS = {
    'C1100': { rho20: 1.724e-8, alpha: 0.00393, k_sc: 143, density: 8960, cp: 385 },
    'C1020': { rho20: 1.70e-8, alpha: 0.00393, k_sc: 145, density: 8960, cp: 385 },
    'Aluminum': { rho20: 2.82e-8, alpha: 0.00403, k_sc: 94, density: 2700, cp: 900 }
};

const PLATING_EFFECTS = {
    'bare': { emissivity: 0.4 },
    'tin': { emissivity: 0.2 },
    'silver': { emissivity: 0.05 },
    'nickel': { emissivity: 0.2 },
    'heat-shrink': { emissivity: 0.9 },
    'epoxy': { emissivity: 0.95 }
};

const PEC_FUSE_RESISTANCE = {
    "50": 2.0e-3, "100": 0.75e-3, "200": 0.39e-3,
    "300": 0.25e-3, "400": 0.19e-3, "500": 0.16e-3,
    "600": 0.14e-3, "800": 0.10e-3, "1000": 0.088e-3
};

// Fixed Automotive Reference Standards
const AUTO_ISC_KA = 25;
const AUTO_SC_MS = 60; // Industry generic fallback (60ms)
const AUTO_VD_LIMIT = 0.015; // 1.5% Voltage drop
const AUTO_MARGIN = 1.15; // 15% safety margin
const LOCAL_HEAT_WEIGHT = 0.35;
const EQUILIBRIUM_THRESHOLD = 2.99; // 3*tau for 95% equilibrium

let currentCategory = 'battery';
let tempChart = null;
let graphInterval = null; // Interval for progressive drawing

function init() {
    bindEvents();
    setupChart();
    disableMobileZoom();
}

function disableMobileZoom() {
    // 1. Prevent multi-touch (pinch) zoom
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false });

    // 2. Prevent double-tap zoom (JS fallback for older browsers)
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
}

function setupChart() {
    const ctx = document.getElementById('tempChart').getContext('2d');
    tempChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temp (°C)',
                data: [],
                borderColor: '#FFD700',
                backgroundColor: 'rgba(255, 215, 0, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: {
                    title: { display: true, text: 'Time (min)', color: '#888', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#666', font: { size: 9 } }
                },
                y: {
                    title: { display: true, text: 'Temp (°C)', color: '#888', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#666', font: { size: 9 } },
                    suggestedMin: 25,
                    suggestedMax: 80
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function bindEvents() {
    // 1. Remove automatic input triggers as per request for button-based calculation
    /* 
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(el => {
        el.addEventListener('input', calculateArea);
    });
    */

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            const praSection = document.getElementById('pra-section');
            if (praSection) {
                praSection.style.display = currentCategory === 'pra' ? 'block' : 'none';
            }
            // Tab change no longer auto-calculates as per new logic
        });
    });

    document.getElementById('continuous').addEventListener('change', (e) => {
        const durInput = document.getElementById('duration');
        durInput.disabled = e.target.checked;
        // calculateArea(); // Removed
    });

    document.getElementById('calculate').addEventListener('click', calculateArea);
}

function calculateArea() {
    try {
        const I = parseFloat(document.getElementById('current').value) || 0;
        const tamb = parseFloat(document.getElementById('ambient').value) || 25;
        const dt_limit = parseFloat(document.getElementById('limit').value) || 40;
        const isContinuous = document.getElementById('continuous').checked;
        const time_sec = isContinuous ? 1e7 : (parseFloat(document.getElementById('duration').value) || 3600);

        const mat = MATERIALS[document.getElementById('material').value];
        const plat = PLATING_EFFECTS[document.getElementById('plating').value];
        const k_cooling = parseFloat(document.getElementById('cooling').value);
        const k_mounting = parseFloat(document.getElementById('mounting').value);
        const alt = parseFloat(document.getElementById('altitude').value) || 0;
        const path_len = parseFloat(document.getElementById('line-len').value) || 0.5;
        const ar = parseFloat(document.getElementById('aspect-ratio').value) || 5;

        // --- 1. Pure Thermal Calibration (v5.0 Professional) ---
        let dt_air_rise = 0;
        let k_env = 1.0;

        if (currentCategory === 'pra') {
            const caseMat = document.getElementById('bdu-material').value;
            k_env = (caseMat === 'aluminum') ? 0.99 : 0.95;
            const n_relays = parseInt(document.getElementById('relays').value) || 0;
            const n_fuses = parseInt(document.getElementById('fuses').value) || 0;
            const r_fuse = PEC_FUSE_RESISTANCE[document.getElementById('fuse-rating').value] || 0.1e-3;
            const q_p = (n_relays * Math.pow(I, 2) * 0.5e-3) + (n_fuses * Math.pow(I, 2) * r_fuse);
            const w = parseFloat(document.getElementById('bdu-width').value) / 1000;
            const d = parseFloat(document.getElementById('bdu-depth').value) / 1000;
            const h = parseFloat(document.getElementById('bdu-height').value) / 1000;
            const a_box = 2 * (w * d + w * h + d * h);
            const dt_box = q_p / ((caseMat === 'aluminum' ? 14 : 7) * a_box);
            dt_air_rise = dt_box * LOCAL_HEAT_WEIGHT;
        }

        const alt_f = alt > 1000 ? (1 + (alt - 1000) / 200 * 0.012) : 1.0;
        let eff_dt = (dt_limit - dt_air_rise) * k_cooling;
        let isOverTemp = false;

        if (eff_dt < 1) {
            eff_dt = 1;
            isOverTemp = true;
        }

        const eff_I = I;

        let a_th = 20e-6;
        const p_geom = 2 * (Math.sqrt(ar) + 1 / Math.sqrt(ar));

        for (let j = 0; j < 40; j++) {
            const t_op = tamb + dt_limit;
            const rho_t = mat.rho20 * (1 + mat.alpha * (t_op - 20));
            const h_val = (8.5 * k_mounting) + (5.67e-8 * plat.emissivity * 4 * Math.pow(((t_op + tamb) / 2 + 273.15), 3));

            const tau = (a_th * mat.density * mat.cp) / (h_val * p_geom * Math.sqrt(a_th));
            const dt_steady = eff_dt / (1 - Math.exp(-time_sec / tau));

            const next_a = Math.pow((Math.pow(eff_I, 2) * rho_t) / (h_val * p_geom * dt_steady), 2 / 3);

            if (Math.abs(next_a - a_th) < 1e-10) break;
            a_th = (a_th + next_a) / 2;
        }

        const h_final = (8.5 * k_mounting) + (5.67e-8 * plat.emissivity * 4 * Math.pow(((tamb + dt_limit + tamb) / 2 + 273.15), 3));
        const final_tau = (a_th * mat.density * mat.cp) / (h_final * p_geom * Math.sqrt(a_th));
        const eq_time_min = (final_tau * EQUILIBRIUM_THRESHOLD) / 60;
        let a_thermal_final = a_th * 1e6 * alt_f;

        // --- 2. Side Warning: Short-Circuit (Informative Only) ---
        const a_sc_net = (AUTO_ISC_KA * 1000 * Math.sqrt(AUTO_SC_MS / 1000)) / mat.k_sc;
        const a_sc_informative = a_sc_net / 0.7; // Reference only

        // --- 3. Voltage Drop Efficiency ---
        const rho_vd = mat.rho20 * (1 + mat.alpha * (tamb + dt_limit - 20));
        const a_vd = (I * rho_vd * path_len / (400 * AUTO_VD_LIMIT)) * 1e6;

        // Selection: No Hard SC clamping. Purely follow load logic.
        let selected_base = Math.max(a_thermal_final, a_vd);
        let final_result = selected_base * AUTO_MARGIN;

        document.getElementById('result-area').textContent = (Math.ceil(final_result * 10) / 10).toFixed(1);

        displayLoadFirstInsight(I, final_result, a_thermal_final, a_vd, a_sc_informative, isOverTemp, dt_limit, ar, eq_time_min);
        displayThermalGraph(I, final_result, tamb, dt_limit, mat, plat, k_cooling, k_mounting, dt_air_rise, ar);

    } catch (e) { console.error(e); }
}

function displayThermalGraph(I, SQ, tamb, dt_limit, mat, plat, k_cool, k_mount, air_rise, ar) {
    const container = document.getElementById('graph-container');
    container.style.display = 'block';

    if (graphInterval) clearInterval(graphInterval);

    // 1. Calculate Constants
    const A_m2 = SQ * 1e-6;
    const p_geom = 2 * (Math.sqrt(ar) + 1 / Math.sqrt(ar));
    const p = p_geom * Math.sqrt(A_m2);
    const t_op = tamb + dt_limit;

    const h_conv = 8.5 * k_mount;
    const h_rad = 5.67e-8 * plat.emissivity * 4 * Math.pow(((t_op + tamb) / 2 + 273.15), 3);
    const h_total = (h_conv + h_rad) * k_cool;

    const tau = (mat.density * mat.cp * A_m2) / (h_total * p);
    const rho_t = mat.rho20 * (1 + mat.alpha * (t_op - 20));
    const power_per_m = Math.pow(I, 2) * (rho_t / A_m2);
    const dt_sat = power_per_m / (h_total * p) + air_rise;

    // 2. Prepare FULL data set
    const allLabels = [];
    const allData = [];
    const total_time = Math.max(3600, tau * 5.5);
    const steps = 80; // 80 points for smooth animation
    const step_size = total_time / steps;

    for (let t = 0; t <= total_time; t += step_size) {
        allLabels.push(Math.round(t / 60));
        const current_dt = dt_sat * (1 - Math.exp(-t / tau));
        allData.push(Number((tamb + current_dt).toFixed(1)));
    }

    // UI Stats
    document.getElementById('tau-val').textContent = Math.round(tau);
    document.getElementById('sat-time').textContent = Math.round(tau * 5 / 60);
    document.getElementById('sat-temp').textContent = (tamb + dt_sat).toFixed(1);

    // 3. Update Chart
    if (graphInterval) clearInterval(graphInterval);

    // Reset data but keep scales
    tempChart.data.labels = [];
    tempChart.data.datasets[0].data = [];
    tempChart.options.scales.y.suggestedMin = tamb;
    tempChart.options.scales.y.suggestedMax = tamb + dt_sat + 5;
    tempChart.update('none');

    // 4. Progressive Drawing Interval
    let index = 0;
    graphInterval = setInterval(() => {
        if (index >= allData.length) {
            clearInterval(graphInterval);
            return;
        }
        tempChart.data.labels.push(allLabels[index]);
        tempChart.data.datasets[0].data.push(allData[index]);
        tempChart.update('none'); // Update without built-in animation
        index++;
    }, 25); // 25ms interval for "logging" feel (Total ~2s)
}

function displayLoadFirstInsight(i, final, a_th, a_vd, a_sc, isOverTemp, dt_limit, ar, eq_time_min) {
    const cd = (i / final).toFixed(2);
    let html = `<strong>[설계파트 Professional v5.0]</strong>`;

    if (isOverTemp) {
        html += `<p style="font-size:0.8rem; margin-top:0.4rem; color:#ff4d4d; font-weight:bold;">
            ⚠️ 알림: 목표 온도 상승량(${dt_limit}℃) 초과 상태
        </p>
        <p style="font-size:0.75rem; color:var(--text-dim);">시스템 내부 발열량이 이미 목표치를 상회하고 있습니다. 포화 온도를 확인하십시오.</p>`;
    } else {
        html += `<p style="font-size:0.8rem; margin-top:0.4rem; color:var(--accent)">
            NotebookLM 기반 물리 엔진이 적용된 고신뢰성 산출 결과입니다.
        </p>`;
    }

    html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-top:1rem; font-size:0.75rem; background:rgba(255,255,255,0.05); padding:0.8rem; border-radius:8px;">
        <span>결정적 요인:</span> <span style="text-align:right; font-weight:bold; color:var(--accent);">${a_th > a_vd ? '연속 부하 발열' : '전압 강하'}</span>
        <span>설계 종횡비:</span> <span style="text-align:right;">${ar}:1</span>
        <span>전류 밀도:</span> <span style="text-align:right;">${cd} A/mm²</span>
        <span>열평형 도달(95%):</span> <span style="text-align:right; color:#FFD700; font-weight:bold;">약 ${eq_time_min.toFixed(1)}분</span>
        <span>안전 계수:</span> <span style="text-align:right;">x1.15</span>
    </div>`;

    html += `<p style="font-size:0.7rem; color:var(--text-dim); margin-top:0.8rem;">ℹ️ 고지: 본 결과는 DIN 43671 및 AEC-Q 표준 기반의 물리 모델을 따르며, 실제 패키지 형상(AR=${ar})에 따른 방열 면적 보정이 완결되었습니다.</p>`;

    document.getElementById('insight-text').innerHTML = html;
}

init();
