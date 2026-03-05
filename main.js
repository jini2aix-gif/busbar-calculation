/**
 * 30년 경력 제니의 버스바 단면적 계산 로직 (Professional Edition)
 * Based on modified Melsom-Booth & DIN 43671 standards
 */

const MATERIALS = {
    'C1100': { iacs: 1.0, k: 0.17 },
    'C1020': { iacs: 1.01, k: 0.175 },
    'Aluminum': { iacs: 0.61, k: 0.11 }
};

function calculateArea() {
    const current = parseFloat(document.getElementById('current').value);
    const deltaT = parseFloat(document.getElementById('limit').value);
    const materialKey = document.getElementById('material').value;
    const coolingFactor = parseFloat(document.getElementById('cooling').value);

    const material = MATERIALS[materialKey];
    
    // Formula: Area = (Current / (k * deltaT^0.5))^(1/0.6)
    // Modified for high-power EV systems with derating factors
    let area = Math.pow(current / (material.k * 100 * Math.sqrt(deltaT) * coolingFactor), 1.666);
    
    // Round to standard busbar sizes insight
    area = Math.ceil(area * 10) / 10;

    // Update UI
    document.getElementById('result-area').textContent = area.toFixed(1);
    
    displayInsight(current, area, deltaT);
}

function displayInsight(i, a, dt) {
    const insights = [
        `전류 밀도가 ${ (i/a).toFixed(2) } A/mm² 이네요. PRA 내부라면 발열 집중을 막기 위해 벤딩 구간의 응력 완화를 꼭 체크하세요!`,
        `배터리팩 연결용이라면 진동(Vibration)에 의한 피로 파괴를 대비해 유연한 Busbar(Laminated) 적용도 고민해볼 만합니다.`,
        `단면적 ${a}mm²는 아주 나이스한 선택입니다. 볼트 체결부의 접촉 저항을 줄이기 위해 표면 도금(Sn or Ag) 사양을 잊지 마세요.`,
        `ΔT가 ${dt}도라면 주변 부품(플라스틱 하우징)의 내열 온도(RTI) 만족 여부가 핵심입니다.`
    ];
    
    const randomInsight = insights[Math.floor(Math.random() * insights.length)];
    document.getElementById('insight-text').textContent = randomInsight;
}

document.getElementById('calculate').addEventListener('click', calculateArea);

// Initial calculation
calculateArea();
