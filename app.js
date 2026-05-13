let SQL = null;
let currentDb = null;

// EKG Data Model
let ecgData = {
    ch0: [], // Lead I
    ch2: [], // Lead II
    sampleRate: 250,
    info: {},
    peaks: [], // array of indices
    events: [], // array of {index, type, value, desc}
    baseTimeMs: 0
};

// View State
let viewState = {
    gainMultiplier: 1.0,
    pixelsPerMm: 10,
    paperSpeed: 25,
    gainMmPerMv: 10,
    scrollLeft: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartScrollLeft: 0,
    activeLeads: ['Lead I', 'Lead II', 'Lead III', 'aVR', 'aVL', 'aVF']
};

// All available leads and their calculations
const allLeads = [
    { name: 'Lead I', func: (i) => ecgData.ch0[i] },
    { name: 'Lead II', func: (i) => ecgData.ch2[i] },
    { name: 'Lead III', func: (i) => ecgData.ch2[i] - ecgData.ch0[i] },
    { name: 'aVR', func: (i) => -(ecgData.ch0[i] + ecgData.ch2[i]) / 2 },
    { name: 'aVL', func: (i) => ecgData.ch0[i] - (ecgData.ch2[i] / 2) },
    { name: 'aVF', func: (i) => ecgData.ch2[i] - (ecgData.ch0[i] / 2) }
];

// Initialization
initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}` })
    .then(function (sqlJsModule) {
        SQL = sqlJsModule;
        console.log("sql.js initialized");
    });

// DOM Elements
const fileInput = document.getElementById('fileInput');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const reportContainer = document.getElementById('reportContainer');
const printBtn = document.getElementById('printBtn');
const canvas = document.getElementById('ekgCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const scrollContainer = document.getElementById('scrollContainer');
const virtualContent = document.getElementById('virtualContent');

const gainSlider = document.getElementById('gainSlider');
const gainValue = document.getElementById('gainValue');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');
const jumpInput = document.getElementById('jumpInput');
const jumpBtn = document.getElementById('jumpBtn');
const visibleHR = document.getElementById('visibleHR');
const eventsDropdown = document.getElementById('eventsDropdown');
const prevEventBtn = document.getElementById('prevEventBtn');
const nextEventBtn = document.getElementById('nextEventBtn');
const scanStatus = document.getElementById('scanStatus');
const leadToggles = document.querySelectorAll('.lead-toggle input');

// Settings & AI DOM
const settingsBtn = document.getElementById('settingsBtn');
const askAIBtn = document.getElementById('askAIBtn');
const askGPTBtn = document.getElementById('askGPTBtn');
const settingsModal = document.getElementById('settingsModal');
const aiModal = document.getElementById('aiModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const closeAiBtn = document.getElementById('closeAiBtn');
const geminiKeyInput = document.getElementById('geminiKeyInput');
const openaiKeyInput = document.getElementById('openaiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const aiLoading = document.getElementById('aiLoading');
const aiLoadingText = document.getElementById('aiLoadingText');
const aiMarkdown = document.getElementById('aiMarkdown');
const aiModalTitle = document.getElementById('aiModalTitle');

// Settings Logic
const savedGeminiKey = localStorage.getItem('geminiApiKey');
if (savedGeminiKey) geminiKeyInput.value = savedGeminiKey;

const savedOpenAiKey = localStorage.getItem('openaiApiKey');
if (savedOpenAiKey) openaiKeyInput.value = savedOpenAiKey;

settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
saveKeyBtn.addEventListener('click', () => {
    localStorage.setItem('geminiApiKey', geminiKeyInput.value.trim());
    localStorage.setItem('openaiApiKey', openaiKeyInput.value.trim());
    settingsModal.classList.add('hidden');
});

// Gemini AI Logic
const promptKorean = "지시사항: 모든 진단 결과와 설명은 100% 한국어(Korean)로만 작성할 것.\n\nYou are an expert cardiologist. Analyze this 6-lead ECG image. The leads shown from top to bottom are what the user selected. The grid is standard 10mm/mV and 25mm/s. Identify any arrhythmias, morphological abnormalities (like ST elevation, T wave inversion), or signs of ischemia. **답변은 반드시 한국어로 작성하고, 의학 용어를 적절히 섞어 전문적인 심장내과 소견서 형태로 출력해 줘.**";

askAIBtn.addEventListener('click', async () => {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("Please enter your Gemini API Key in Settings first.");
        settingsModal.classList.remove('hidden');
        return;
    }
    
    const base64Image = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    aiModalTitle.innerHTML = '✨ Gemini AI EKG Analysis';
    aiLoadingText.textContent = 'Gemini is analyzing the visible EKG window...';
    aiModal.classList.remove('hidden');
    aiLoading.classList.remove('hidden');
    aiMarkdown.innerHTML = '';
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptKorean },
                        { inline_data: { mime_type: "image/jpeg", data: base64Image } }
                    ]
                }]
            })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const text = data.candidates[0].content.parts[0].text;
        aiLoading.classList.add('hidden');
        aiMarkdown.innerHTML = marked.parse(text);
        
    } catch (e) {
        aiLoading.classList.add('hidden');
        aiMarkdown.innerHTML = `<p style="color: red; font-weight: bold;">Error analyzing EKG: ${e.message}</p>`;
    }
});

// OpenAI GPT Logic
askGPTBtn.addEventListener('click', async () => {
    const apiKey = localStorage.getItem('openaiApiKey');
    if (!apiKey) {
        alert("Please enter your OpenAI API Key in Settings first.");
        settingsModal.classList.remove('hidden');
        return;
    }
    
    const base64Image = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    aiModalTitle.innerHTML = '🧠 GPT-4o EKG Analysis';
    aiLoadingText.textContent = 'GPT-4o is analyzing the visible EKG window...';
    aiModal.classList.remove('hidden');
    aiLoading.classList.remove('hidden');
    aiMarkdown.innerHTML = '';
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5.4-pro",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: promptKorean },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]
                    }
                ],
                max_tokens: 1500
            })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const text = data.choices[0].message.content;
        aiLoading.classList.add('hidden');
        aiMarkdown.innerHTML = marked.parse(text);
        
    } catch (e) {
        aiLoading.classList.add('hidden');
        aiMarkdown.innerHTML = `<p style="color: red; font-weight: bold;">Error analyzing EKG: ${e.message}</p>`;
    }
});

closeAiBtn.addEventListener('click', () => aiModal.classList.add('hidden'));

// Drag and Drop
uploadPlaceholder.addEventListener('dragover', (e) => { e.preventDefault(); uploadPlaceholder.classList.add('dragover'); });
uploadPlaceholder.addEventListener('dragleave', (e) => { e.preventDefault(); uploadPlaceholder.classList.remove('dragover'); });
uploadPlaceholder.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadPlaceholder.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });

// Toolbar Controls
gainSlider.addEventListener('input', (e) => {
    viewState.gainMultiplier = parseFloat(e.target.value);
    gainValue.textContent = viewState.gainMultiplier.toFixed(1) + 'x';
    requestRender();
});

zoomSlider.addEventListener('input', (e) => {
    viewState.pixelsPerMm = parseFloat(e.target.value) * 10;
    zoomValue.textContent = viewState.pixelsPerMm.toFixed(0) + 'px/mm';
    updateVirtualWidth();
    resizeCanvas();
    requestRender();
});

leadToggles.forEach(toggle => {
    toggle.addEventListener('change', () => {
        viewState.activeLeads = Array.from(leadToggles).filter(t => t.checked).map(t => t.value);
        resizeCanvas();
        requestRender();
    });
});

jumpBtn.addEventListener('click', () => {
    const timeStr = jumpInput.value; // format HH:MM:SS or HH:MM
    if (!timeStr) return;
    
    if (ecgData.baseTimeMs === 0) return; // No base time available
    
    // Parse target time string on the same day as the record
    const baseDate = new Date(ecgData.baseTimeMs);
    const targetParts = timeStr.split(':');
    const targetDate = new Date(baseDate);
    targetDate.setHours(parseInt(targetParts[0] || 0));
    targetDate.setMinutes(parseInt(targetParts[1] || 0));
    targetDate.setSeconds(parseInt(targetParts[2] || 0));
    
    let diffSec = (targetDate.getTime() - baseDate.getTime()) / 1000;
    
    // Handle overnight records
    if (diffSec < 0) diffSec += 86400; // +1 day
    
    if (diffSec >= 0) {
        const pxPerSec = viewState.paperSpeed * viewState.pixelsPerMm;
        scrollContainer.scrollLeft = diffSec * pxPerSec;
    }
});

eventsDropdown.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value);
    if (idx >= 0) {
        const sec = idx / ecgData.sampleRate;
        const pxPerSec = viewState.paperSpeed * viewState.pixelsPerMm;
        scrollContainer.scrollLeft = Math.max(0, (sec * pxPerSec) - (viewState.canvasWidth / 2));
    }
});

prevEventBtn.addEventListener('click', () => {
    const pxPerSec = viewState.paperSpeed * viewState.pixelsPerMm;
    const currentCenterPx = viewState.scrollLeft + (viewState.canvasWidth / 2);
    
    const sortedEvents = ecgData.events.slice().sort((a,b) => b.index - a.index); // Reverse order
    for(let ev of sortedEvents) {
        const evPx = (ev.index / ecgData.sampleRate) * pxPerSec;
        if (evPx < currentCenterPx - 50) {
            scrollContainer.scrollLeft = Math.max(0, evPx - (viewState.canvasWidth / 2));
            eventsDropdown.value = ev.index;
            return;
        }
    }
    
    // If no prev event found, loop back to the last one
    if (sortedEvents.length > 0) {
        const evPx = (sortedEvents[0].index / ecgData.sampleRate) * pxPerSec;
        scrollContainer.scrollLeft = Math.max(0, evPx - (viewState.canvasWidth / 2));
        eventsDropdown.value = sortedEvents[0].index;
    }
});

nextEventBtn.addEventListener('click', () => {
    const pxPerSec = viewState.paperSpeed * viewState.pixelsPerMm;
    const currentCenterPx = viewState.scrollLeft + (viewState.canvasWidth / 2);
    
    const sortedEvents = ecgData.events.slice().sort((a,b) => a.index - b.index);
    for(let ev of sortedEvents) {
        const evPx = (ev.index / ecgData.sampleRate) * pxPerSec;
        // Find first event that is sufficiently to the right
        if (evPx > currentCenterPx + 50) {
            scrollContainer.scrollLeft = Math.max(0, evPx - (viewState.canvasWidth / 2));
            eventsDropdown.value = ev.index; // update dropdown selection
            return;
        }
    }
    
    // If no next event found, loop back to the first one
    if (sortedEvents.length > 0) {
        const evPx = (sortedEvents[0].index / ecgData.sampleRate) * pxPerSec;
        scrollContainer.scrollLeft = Math.max(0, evPx - (viewState.canvasWidth / 2));
        eventsDropdown.value = sortedEvents[0].index;
    }
});

printBtn.addEventListener('click', () => window.print());

// Scrolling & Dragging
scrollContainer.addEventListener('scroll', () => {
    viewState.scrollLeft = scrollContainer.scrollLeft;
    requestRender();
});

canvas.addEventListener('mousedown', (e) => {
    viewState.isDragging = true;
    viewState.dragStartX = e.clientX;
    viewState.dragStartScrollLeft = scrollContainer.scrollLeft;
});
window.addEventListener('mouseup', () => viewState.isDragging = false);
window.addEventListener('mousemove', (e) => {
    if (viewState.isDragging) {
        const dx = e.clientX - viewState.dragStartX;
        scrollContainer.scrollLeft = viewState.dragStartScrollLeft - dx;
    }
});
window.addEventListener('resize', () => { resizeCanvas(); requestRender(); });

// Load Database
function handleFile(file) {
    if (!file.name.endsWith('.rpd')) { alert("Please upload a valid .rpd file."); return; }
    const reader = new FileReader();
    reader.onload = function () {
        if (!SQL) { alert("SQL.js is loading, try again."); return; }
        try {
            if (currentDb) currentDb.close();
            currentDb = new SQL.Database(new Uint8Array(reader.result));
            parseData();
            
            uploadPlaceholder.classList.add('hidden');
            reportContainer.classList.remove('hidden');
            printBtn.disabled = false;
            askAIBtn.disabled = false;
            askGPTBtn.disabled = false;
            
            runArrhythmiaScan();
            
            viewState.scrollLeft = 0;
            updateVirtualWidth();
            resizeCanvas();
            requestRender();
        } catch (e) {
            console.error(e);
            alert("Error parsing .rpd file. It might not be a valid SQLite database.");
        }
    };
    reader.readAsArrayBuffer(file);
}

function parseData() {
    ecgData.baseTimeMs = 0;
    let stmt = currentDb.prepare("SELECT * FROM information LIMIT 1");
    if (stmt.step()) {
        const row = stmt.getAsObject();
        ecgData.info = row;
        ecgData.sampleRate = row.ecg_sampling_rate || 250;
        document.getElementById('infoName').textContent = row.name || 'Unknown';
        document.getElementById('infoAgeGender').textContent = `${row.age || '?'} yrs / ${row.gender == 1 ? 'M' : (row.gender == 2 ? 'F' : 'O')}`;
        document.getElementById('infoDate').textContent = row.start_time || '---';
        document.getElementById('infoDevice').textContent = row.device_type || '---';
        
        if (row.start_time) {
            const d = new Date(row.start_time.replace(' ', 'T'));
            if (!isNaN(d)) ecgData.baseTimeMs = d.getTime();
        }
    }
    stmt.free();

    stmt = currentDb.prepare("SELECT ecg_ch0, ecg_ch2 FROM ecg_raw ORDER BY ecg_index ASC");
    ecgData.ch0 = [];
    ecgData.ch2 = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        ecgData.ch0.push(row.ecg_ch0);
        ecgData.ch2.push(row.ecg_ch2);
    }
    stmt.free();

    ecgData.peaks = [];
    try {
        stmt = currentDb.prepare("SELECT ecg_index FROM peak_detection ORDER BY ecg_index ASC");
        while (stmt.step()) {
            ecgData.peaks.push(stmt.getAsObject().ecg_index);
        }
        stmt.free();
    } catch (e) {}

    ecgData.events = [];
    try {
        stmt = currentDb.prepare("SELECT ecg_index, type, value FROM event_detection ORDER BY ecg_index ASC");
        while (stmt.step()) {
            const ev = stmt.getAsObject();
            ecgData.events.push({ index: ev.ecg_index, type: ev.type, desc: `Event Type ${ev.type}` });
        }
        stmt.free();
    } catch (e) {}
}

function runArrhythmiaScan() {
    scanStatus.textContent = 'Scanning...';
    scanStatus.className = 'status-badge warning';
    
    setTimeout(() => {
        const peaks = ecgData.peaks;
        const sr = ecgData.sampleRate;
        ecgData.events = []; // Clear previous events
        
        let tachyCount = 0;
        let bradyCount = 0;
        
        // Rolling window for AFib (15 beats)
        const afibWindowSize = 15;
        let rrHistory = [];

        // Rolling window for Running Average (PVC baseline)
        const baselineWindowSize = 20;
        let recentRRs = [];

        for (let i = 1; i < peaks.length; i++) {
            const rrSamples = peaks[i] - peaks[i-1];
            const rrSec = rrSamples / sr;
            const bpm = 60 / rrSec;
            
            rrHistory.push(rrSec);
            if (rrHistory.length > afibWindowSize) rrHistory.shift();
            
            recentRRs.push(rrSec);
            if (recentRRs.length > baselineWindowSize) recentRRs.shift();

            // 1. Tachycardia & Bradycardia
            if (bpm > 100) tachyCount++; else tachyCount = 0;
            if (bpm < 50) bradyCount++; else bradyCount = 0;
            
            if (tachyCount === 8) {
                ecgData.events.push({ index: peaks[i], type: 'TACHY', desc: `Tachycardia (${Math.round(bpm)} BPM)` });
                tachyCount = 0; // reset to avoid spam
            }
            if (bradyCount === 8) {
                ecgData.events.push({ index: peaks[i], type: 'BRADY', desc: `Bradycardia (${Math.round(bpm)} BPM)` });
                bradyCount = 0;
            }
            
            // 2. PVC Detection (Premature beat + Compensatory Pause)
            if (recentRRs.length >= 10 && i < peaks.length - 1) {
                const avgRR = recentRRs.reduce((a,b)=>a+b, 0) / recentRRs.length;
                const nextRRSec = (peaks[i+1] - peaks[i]) / sr;
                
                // If current RR is < 80% of avg, AND next is > 120% of avg
                if (rrSec < avgRR * 0.8 && nextRRSec > avgRR * 1.2) {
                    ecgData.events.push({ index: peaks[i], type: 'PVC', desc: 'Premature Ventricular Contraction' });
                    recentRRs = []; // Reset baseline to avoid cascade
                }
            }

            // 3. AFib Detection (High variance in RR intervals)
            if (rrHistory.length === afibWindowSize && i % 15 === 0) { // check every 15 beats
                const mean = rrHistory.reduce((a,b)=>a+b, 0) / afibWindowSize;
                const variance = rrHistory.reduce((a,b)=>a + Math.pow(b - mean, 2), 0) / afibWindowSize;
                const stdDev = Math.sqrt(variance);
                const cv = stdDev / mean; // Coefficient of Variation
                
                if (cv > 0.15) { // Highly irregular
                    ecgData.events.push({ index: peaks[i - Math.floor(afibWindowSize/2)], type: 'AFIB SUSPECT', desc: 'Irregular Rhythm (AFib Suspect)' });
                }
            }
        }
        
        // Populate Dropdown
        ecgData.events.sort((a, b) => a.index - b.index);
        eventsDropdown.innerHTML = '<option value="-1">Select an Event</option>';
        
        if (ecgData.events.length === 0) {
            eventsDropdown.innerHTML = '<option value="-1">No events found</option>';
            scanStatus.textContent = 'Normal';
            scanStatus.className = 'status-badge normal';
            prevEventBtn.disabled = true;
            nextEventBtn.disabled = true;
        } else {
            ecgData.events.forEach(ev => {
                const sec = ev.index / sr;
                let timeStr = `${sec.toFixed(1)}s`;
                if (ecgData.baseTimeMs > 0) {
                    timeStr = new Date(ecgData.baseTimeMs + sec * 1000).toTimeString().substr(0, 8);
                }
                const opt = document.createElement('option');
                opt.value = ev.index;
                opt.textContent = `[${timeStr}] ${ev.desc}`;
                eventsDropdown.appendChild(opt);
            });
            scanStatus.textContent = `${ecgData.events.length} Issues Found`;
            scanStatus.className = 'status-badge danger';
            prevEventBtn.disabled = false;
            nextEventBtn.disabled = false;
        }
    }, 100);
}

// Rendering Logic
let renderRequested = false;
function requestRender() {
    if (!renderRequested) {
        renderRequested = true;
        requestAnimationFrame(render);
    }
}

function updateVirtualWidth() {
    const totalSamples = ecgData.ch0.length;
    const totalSeconds = totalSamples / ecgData.sampleRate;
    const pixelsPerSec = viewState.paperSpeed * viewState.pixelsPerMm;
    const paddingRight = 100;
    virtualContent.style.width = `${(totalSeconds * pixelsPerSec) + paddingRight}px`;
}

function resizeCanvas() {
    const rect = scrollContainer.getBoundingClientRect();
    viewState.canvasWidth = rect.width;
    
    const activeCount = viewState.activeLeads.length;
    // Top axis area = 40px
    // 40mm height per lead = 40 * pixelsPerMm
    // Bottom margin = 20px
    const minHeightPx = 40 + (activeCount * 40 * viewState.pixelsPerMm) + 20; 
    
    viewState.canvasHeight = Math.max(rect.height, minHeightPx);
    canvas.width = viewState.canvasWidth;
    canvas.height = viewState.canvasHeight;
}

function render() {
    renderRequested = false;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (ecgData.ch0.length === 0) return;

    const pxPerMm = viewState.pixelsPerMm;
    const pxPerSec = viewState.paperSpeed * pxPerMm;
    const startSec = viewState.scrollLeft / pxPerSec;
    const endSec = (viewState.scrollLeft + viewState.canvasWidth) / pxPerSec;
    
    const startIdx = Math.max(0, Math.floor(startSec * ecgData.sampleRate));
    const endIdx = Math.min(ecgData.ch0.length, Math.ceil(endSec * ecgData.sampleRate));
    
    drawGrid();
    calculateVisibleHR(startIdx, endIdx);
    
    const activeLeadsToRender = allLeads.filter(l => viewState.activeLeads.includes(l.name));
    
    const leadHeightPx = 40 * pxPerMm;
    const paddingLeft = 60;
    const topAxisMargin = 40; // space reserved at the top for real time X axis

    const assumedScale = 100;
    const verticalScale = (viewState.gainMmPerMv * pxPerMm * viewState.gainMultiplier) / assumedScale;
    const horizontalScale = pxPerSec / ecgData.sampleRate;
    const offsetX = -viewState.scrollLeft + paddingLeft + 30;
    
    ctx.save();
    
    // 1. Draw Leads
    for (let l = 0; l < activeLeadsToRender.length; l++) {
        const baseY = topAxisMargin + (l * leadHeightPx) + (leadHeightPx / 2);
        
        let sum = 0, count = 0;
        for (let i = startIdx; i < endIdx; i++) {
            sum += activeLeadsToRender[l].func(i);
            count++;
        }
        const mean = count > 0 ? sum / count : 0;
        
        // Label
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText(activeLeadsToRender[l].name, 10, baseY - 15);
        
        // Calibration
        drawCalibrationPulse(10 + paddingLeft, baseY, pxPerMm);

        // Signal
        ctx.beginPath();
        ctx.strokeStyle = 'var(--ekg-signal)';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        
        let first = true;
        for (let i = startIdx; i < endIdx; i++) {
            const val = activeLeadsToRender[l].func(i);
            const x = (i * horizontalScale) + offsetX;
            const y = baseY - ((val - mean) * verticalScale);
            
            if (first) { ctx.moveTo(x, y); first = false; }
            else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
    }
    
    // 2. Draw Top X-Axis (Real Time)
    const axisY = 20;
    ctx.fillStyle = 'var(--text-main)';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    
    const startSecInt = Math.floor(startSec);
    const endSecInt = Math.ceil(endSec);
    
    for (let s = startSecInt; s <= endSecInt; s++) {
        const x = (s * pxPerSec) + offsetX;
        
        let timeStr = `${s}s`;
        if (ecgData.baseTimeMs > 0) {
            const d = new Date(ecgData.baseTimeMs + s * 1000);
            timeStr = d.toTimeString().substr(0, 8); // HH:mm:ss local time
        }
        
        ctx.fillText(timeStr, x, axisY - 5);
        
        // Tick mark going down
        ctx.beginPath();
        ctx.moveTo(x, axisY);
        ctx.lineTo(x, axisY + 6);
        ctx.strokeStyle = 'var(--text-main)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    
    // 3. Draw Events (Bottom of the whole stack)
    const bottomY = topAxisMargin + (activeLeadsToRender.length * leadHeightPx) - 10;
    ctx.fillStyle = 'var(--event-color)';
    ctx.font = 'bold 11px Inter, sans-serif';
    
    for (let ev of ecgData.events) {
        if (ev.index >= startIdx && ev.index <= endIdx) {
            const x = (ev.index * horizontalScale) + offsetX;
            
            // Triangle Arrow
            ctx.beginPath();
            ctx.moveTo(x, bottomY - 10);
            ctx.lineTo(x - 5, bottomY);
            ctx.lineTo(x + 5, bottomY);
            ctx.fill();
            
            ctx.fillText(ev.type, x, bottomY - 15);
        }
    }
    
    ctx.restore();
}

function drawCalibrationPulse(startX, baseY, pxPerMm) {
    const width = 5 * pxPerMm;
    const height = 10 * pxPerMm;
    
    ctx.beginPath();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.moveTo(startX, baseY);
    ctx.lineTo(startX + 5, baseY);
    ctx.lineTo(startX + 5, baseY - height);
    ctx.lineTo(startX + width - 5, baseY - height);
    ctx.lineTo(startX + width - 5, baseY);
    ctx.lineTo(startX + width, baseY);
    ctx.stroke();
}

function drawGrid() {
    const pxPerMm = viewState.pixelsPerMm;
    const smallSq = pxPerMm;
    const largeSq = 5 * pxPerMm;
    const offsetX = -(viewState.scrollLeft % largeSq);
    
    ctx.beginPath();
    ctx.strokeStyle = 'var(--pink-grid-light)';
    ctx.lineWidth = 0.5;
    for (let x = offsetX; x < canvas.width; x += smallSq) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = 0; y < canvas.height; y += smallSq) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();
    
    ctx.beginPath();
    ctx.strokeStyle = 'var(--pink-grid-dark)';
    ctx.lineWidth = 1.0;
    for (let x = offsetX; x < canvas.width; x += largeSq) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = 0; y < canvas.height; y += largeSq) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();
}

function calculateVisibleHR(startIdx, endIdx) {
    if (!ecgData.peaks || ecgData.peaks.length < 2) { visibleHR.textContent = "---"; return; }
    
    const visiblePeaks = ecgData.peaks.filter(p => p >= startIdx && p <= endIdx);
    if (visiblePeaks.length < 2) { visibleHR.textContent = "---"; return; }
    
    let rrSum = 0;
    for (let i = 1; i < visiblePeaks.length; i++) rrSum += (visiblePeaks[i] - visiblePeaks[i-1]);
    const avgRR = rrSum / (visiblePeaks.length - 1);
    
    const avgSec = avgRR / ecgData.sampleRate;
    const bpm = 60 / avgSec;
    
    visibleHR.textContent = Math.round(bpm);
}
