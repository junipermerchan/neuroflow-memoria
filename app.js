/* ==========================================================================
   NeuroFlow — Aplicación Completa de Entrenamiento de Memoria de Trabajo
   ========================================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'neuroflow_wm_v1';

  // -------------------- UTILITIES --------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  function showToast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  // -------------------- AUDIO ENGINE --------------------
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq = 440, duration = 0.14, type = 'sine', volume = 0.12) {
    if (!state.soundEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function speakLetter(letter) {
    if (!state.soundEnabled) return;
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(letter);
        u.lang = 'es-ES';
        u.rate = 1.05;
        window.speechSynthesis.speak(u);
        return;
      } catch (_) {
        // fallback below
      }
    }
    playTone(520, 0.12, 'triangle', 0.1);
  }

  // -------------------- STATE & PERSISTENCE --------------------
  function defaultState() {
    return {
      xp: 0,
      streak: 0,
      lastActiveDate: null,
      soundEnabled: true,
      theme: 'dark',
      bests: {
        nbackN: 1,
        seqForward: 0,
        seqBackward: 0,
        digitForward: 0,
        digitBackward: 0,
        mentalAcc: 0,
      },
      history: [],
      daily: {},
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        ...defaultState(),
        ...parsed,
        bests: { ...defaultState().bests, ...(parsed.bests || {}) },
        daily: parsed.daily || {},
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    } catch {
      return defaultState();
    }
  }

  let state = loadState();

  function getTodayRecord() {
    const key = todayKey();
    if (!state.daily[key]) {
      state.daily[key] = {
        nback: false,
        sequence: false,
        digits: false,
        mental: false,
        focus: false,
        sleep: false,
        exercise: false,
        realLife: false,
      };
    }
    return state.daily[key];
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function updateStreak() {
    const today = todayKey();
    if (state.lastActiveDate === today) return;
    if (state.lastActiveDate) {
      const prev = new Date(state.lastActiveDate + 'T00:00:00');
      const curr = new Date(today + 'T00:00:00');
      const diffDays = Math.round((curr - prev) / 86400000);
      state.streak = diffDays === 1 ? state.streak + 1 : 1;
    } else {
      state.streak = 1;
    }
    state.lastActiveDate = today;
  }

  function awardSession({ game, detail, accuracy, xpEarned, dailyKey }) {
    state.xp += xpEarned;
    updateStreak();
    if (dailyKey) {
      getTodayRecord()[dailyKey] = true;
    }
    state.history.unshift({
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      game,
      detail,
      accuracy: Math.round(accuracy),
      xpEarned,
    });
    if (state.history.length > 40) state.history.length = 40;
    saveState();
    renderAllUI();
    showToast(`+${xpEarned} XP — ${game} completado`);
  }

  // -------------------- NAVIGATION & THEME --------------------
  function switchView(viewId) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    $$('.nav-item').forEach((n) => n.classList.remove('active'));
    const target = $(`#view-${viewId}`);
    const navBtn = $(`.nav-item[data-view="${viewId}"]`);
    if (target) target.classList.add('active');
    if (navBtn) navBtn.classList.add('active');
  }

  $$('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  function applyThemeAndSound() {
    document.documentElement.setAttribute('data-theme', state.theme);
    $('#toggle-theme').textContent = state.theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    $('#toggle-sound').textContent = state.soundEnabled ? '🔊 Sonido' : '🔇 Silencio';
  }

  $('#toggle-theme').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    saveState();
    applyThemeAndSound();
  });

  $('#toggle-sound').addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    saveState();
    applyThemeAndSound();
  });

  // -------------------- DASHBOARD, ROADMAP & CHART --------------------
  const DAILY_STEPS_CONFIG = [
    { key: 'nback', title: 'Paso 1: Dual N-Back (1 sesión)', desc: 'Entrena atención ejecutiva y actualización simultánea (visual + auditiva).', view: 'nback', actionLabel: 'Ir al ejercicio' },
    { key: 'sequence', title: 'Paso 2: Secuencia Espacial (1 ronda)', desc: 'Refuerza tu agenda visoespacial (prueba modo inverso cuando te sientas cómodo).', view: 'sequence', actionLabel: 'Ir al ejercicio' },
    { key: 'digits', title: 'Paso 3: Span Numérico (1 ronda)', desc: 'Practica agrupación (chunking) de dígitos en directo o inverso.', view: 'digits', actionLabel: 'Ir al ejercicio' },
    { key: 'mental', title: 'Paso 4: Cálculo Mental Activo (5 cadenas)', desc: 'Actualiza resultados en tu cabeza sin papel.', view: 'mental', actionLabel: 'Ir al ejercicio' },
    { key: 'focus', title: 'Paso 5: Bloque de Foco Profundo (15–25 min)', desc: 'Trabaja o estudia sin notificaciones ni multitarea.', view: 'focus', actionLabel: 'Abrir temporizador' },
  ];

  const HABITS_CONFIG = [
    { key: 'sleep', title: 'Dormí 7–8 horas de calidad', desc: 'La consolidación de memoria y la capacidad prefrontal dependen del descanso.' },
    { key: 'exercise', title: 'Hice 20+ min de ejercicio aeróbico', desc: 'Caminar rápido, correr o entrenar aumenta el flujo sanguíneo cerebral.' },
    { key: 'realLife', title: 'Transferencia a la vida real', desc: 'Memoricé una lista corta o resumí mentalmente una lectura sin mirar notas.' },
    { key: 'focus', title: 'Completé un bloque sin multitarea', desc: '15–25 minutos seguidos en una sola actividad sin revisar el teléfono.' },
  ];

  function renderDailySteps() {
    const today = getTodayRecord();
    const container = $('#daily-steps-list');
    container.innerHTML = '';

    let doneCount = 0;
    DAILY_STEPS_CONFIG.forEach((step) => {
      const isDone = Boolean(today[step.key]);
      if (isDone) doneCount++;

      const row = document.createElement('div');
      row.className = `step-row ${isDone ? 'done' : ''}`;
      row.innerHTML = `
        <div class="step-left">
          <div class="step-check" title="Marcar/desmarcar">${isDone ? '✓' : ''}</div>
          <div>
            <div class="step-title">${step.title}</div>
            <div class="step-desc">${step.desc}</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm">${isDone ? 'Repetir' : step.actionLabel}</button>
      `;

      row.querySelector('.step-check').addEventListener('click', () => {
        today[step.key] = !today[step.key];
        if (today[step.key]) {
          state.xp += 15;
          updateStreak();
        }
        saveState();
        renderAllUI();
      });

      row.querySelector('button').addEventListener('click', () => switchView(step.view));
      container.appendChild(row);
    });

    const pct = Math.round((doneCount / DAILY_STEPS_CONFIG.length) * 100);
    $('#kpi-daily-pct').textContent = `${pct}%`;
    $('#kpi-daily-bar').style.width = `${pct}%`;
    $('#today-date-badge').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  $('#btn-start-daily').addEventListener('click', () => {
    const today = getTodayRecord();
    const next = DAILY_STEPS_CONFIG.find((s) => !today[s.key]) || DAILY_STEPS_CONFIG[0];
    switchView(next.view);
  });

  function renderRoadmap() {
    const b = state.bests;
    const totalSessions = state.history.length;
    const phases = [
      {
        tag: 'Semana 1 · Base',
        title: 'Fundamentos y Constancia',
        goals: [
          { text: 'Completar 5 sesiones de entrenamiento', met: totalSessions >= 5 },
          { text: 'Superar 1-Back (≥80%)', met: b.nbackN >= 2 },
          { text: 'Alcanzar 5 dígitos en Span Numérico', met: Math.max(b.digitForward, b.digitBackward) >= 5 },
        ],
      },
      {
        tag: 'Semana 2 · Expansión',
        title: 'Capacidad Activa y Chunking',
        goals: [
          { text: 'Completar 12 sesiones totales', met: totalSessions >= 12 },
          { text: 'Dominar 2-Back (desbloquear 3-Back)', met: b.nbackN >= 3 },
          { text: 'Secuencia Espacial ≥ 5 bloques', met: Math.max(b.seqForward, b.seqBackward) >= 5 },
        ],
      },
      {
        tag: 'Semana 3 · Manipulación',
        title: 'Modo Inverso y Velocidad',
        goals: [
          { text: 'Completar 20 sesiones totales', met: totalSessions >= 20 },
          { text: 'Span Numérico Inverso ≥ 6 dígitos', met: b.digitBackward >= 6 },
          { text: 'Cálculo Activo ≥ 80% precisión', met: b.mentalAcc >= 80 },
        ],
      },
      {
        tag: 'Semana 4 · Dominio 100%',
        title: 'Alto Rendimiento Cognitivo',
        goals: [
          { text: 'Completar 28 sesiones totales', met: totalSessions >= 28 },
          { text: 'Alcanzar nivel 4-Back o superior', met: b.nbackN >= 4 },
          { text: 'Span ≥ 9 dígitos y Secuencia Inversa ≥ 6', met: b.digitForward >= 9 && b.seqBackward >= 6 },
        ],
      },
    ];

    const container = $('#roadmap-container');
    container.innerHTML = '';
    phases.forEach((p, idx) => {
      const allMet = p.goals.every((g) => g.met);
      const someMet = p.goals.some((g) => g.met) || idx === 0;
      const card = document.createElement('div');
      card.className = `phase-card ${allMet ? 'completed' : someMet ? 'unlocked' : ''}`;
      card.innerHTML = `
        <span class="phase-tag">${p.tag} ${allMet ? '✅' : ''}</span>
        <h4>${p.title}</h4>
        <ul class="phase-goals">
          ${p.goals.map((g) => `<li class="${g.met ? 'met' : ''}">${g.met ? '✓' : '○'} ${g.text}</li>`).join('')}
        </ul>
      `;
      container.appendChild(card);
    });
  }

  function renderChart() {
    const svg = $('#progress-chart');
    const emptyMsg = $('#chart-empty');
    const recent = state.history.slice(0, 15).reverse();

    if (recent.length === 0) {
      svg.innerHTML = '';
      emptyMsg.classList.remove('hidden');
      return;
    }

    emptyMsg.classList.add('hidden');
    const w = 500;
    const h = 180;
    const padX = 28;
    const padY = 22;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;

    const points = recent.map((item, i) => {
      const x = recent.length === 1 ? w / 2 : padX + (i / (recent.length - 1)) * plotW;
      const val = Math.max(0, Math.min(100, item.accuracy || 0));
      const y = padY + plotH - (val / 100) * plotH;
      return { x, y, val, label: item.game };
    });

    const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPoints = `${points[0].x.toFixed(1)},${h - padY} ${polyline} ${points[points.length - 1].x.toFixed(1)},${h - padY}`;

    svg.innerHTML = `
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <line x1="${padX}" y1="${padY}" x2="${w - padX}" y2="${padY}" stroke="rgba(148,163,184,0.18)" stroke-dasharray="4 4"/>
      <line x1="${padX}" y1="${padY + plotH * 0.2}" x2="${w - padX}" y2="${padY + plotH * 0.2}" stroke="rgba(16,185,129,0.35)" stroke-dasharray="4 4"/>
      <text x="${padX + 2}" y="${padY + plotH * 0.2 - 4}" fill="#10b981" font-size="10">Meta 80%</text>
      <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="rgba(148,163,184,0.22)"/>
      ${points.length > 1 ? `<polygon points="${areaPoints}" fill="url(#chartGrad)"/>` : ''}
      ${points.length > 1 ? `<polyline fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polyline}"/>` : ''}
      ${points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#6366f1" stroke="#fff" stroke-width="1.5"><title>${p.label}: ${p.val}%</title></circle>`).join('')}
    `;
  }

  function renderHistory() {
    const list = $('#history-list');
    if (state.history.length === 0) {
      list.innerHTML = '<li class="muted">Aún no hay sesiones registradas.</li>';
      return;
    }
    list.innerHTML = state.history.slice(0, 10).map((item) => `
      <li class="history-item">
        <div>
          <strong>${item.game}</strong>
          <div class="muted" style="font-size:0.78rem">${item.detail} · ${item.date}</div>
        </div>
        <span class="badge">${item.accuracy}%</span>
      </li>
    `).join('');
  }

  function renderHabits() {
    const today = getTodayRecord();
    const container = $('#habits-list');
    container.innerHTML = '';
    HABITS_CONFIG.forEach((h) => {
      const checked = Boolean(today[h.key]);
      const label = document.createElement('label');
      label.className = `habit-item ${checked ? 'checked' : ''}`;
      label.innerHTML = `
        <input type="checkbox" ${checked ? 'checked' : ''} />
        <div>
          <div style="font-weight:700;font-size:0.94rem">${h.title}</div>
          <div class="muted" style="font-size:0.82rem">${h.desc}</div>
        </div>
      `;
      label.querySelector('input').addEventListener('change', (e) => {
        today[h.key] = e.target.checked;
        if (e.target.checked) {
          state.xp += 15;
          updateStreak();
          playTone(660, 0.1, 'sine', 0.1);
        }
        saveState();
        renderAllUI();
      });
      container.appendChild(label);
    });
  }

  function renderAllUI() {
    // Level & XP
    const level = Math.floor(state.xp / 100) + 1;
    const xpInLevel = state.xp % 100;
    $('#sidebar-level').textContent = `Nivel ${level}`;
    $('#sidebar-xp').textContent = `${xpInLevel} / 100 XP`;
    $('#sidebar-xp-bar').style.width = `${xpInLevel}%`;
    $('#sidebar-streak').textContent = `${state.streak} ${state.streak === 1 ? 'día' : 'días'}`;

    // KPIs
    $('#kpi-nback-best').textContent = `${state.bests.nbackN}-Back`;
    const bestDigits = Math.max(state.bests.digitForward, state.bests.digitBackward);
    $('#kpi-digit-best').textContent = `${bestDigits} dígitos`;
    $('#kpi-sessions').textContent = String(state.history.length);

    // Game-specific best badges
    const seqMode = $('#seq-mode').value;
    $('#seq-best').textContent = seqMode === 'backward' ? state.bests.seqBackward : state.bests.seqForward;
    const digitMode = $('#digit-mode').value;
    $('#digit-best').textContent = digitMode === 'backward' ? state.bests.digitBackward : state.bests.digitForward;
    $('#mental-best').textContent = `${state.bests.mentalAcc}%`;

    renderDailySteps();
    renderRoadmap();
    renderChart();
    renderHistory();
    renderHabits();
  }

  $('#btn-reset-data').addEventListener('click', () => {
    if (confirm('¿Seguro que deseas reiniciar todo tu progreso e historial?')) {
      state = defaultState();
      saveState();
      applyThemeAndSound();
      renderAllUI();
      showToast('Progreso reiniciado.');
    }
  });

  // ==========================================================================
  // GAME 1: DUAL N-BACK
  // ==========================================================================
  const NBACK_LETTERS = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'];
  const NBACK_POSITIONS = [0, 1, 2, 3, 5, 6, 7, 8]; // exclude center cross (4)

  const nback = {
    running: false,
    n: 2,
    totalTrials: 20,
    speed: 2500,
    sequence: [],
    index: -1,
    timer: null,
    posPressed: false,
    audioPressed: false,
    hits: 0,
    misses: 0,
    falseAlarms: 0,
  };

  function generateNBackSequence(n, total) {
    const seq = [];
    for (let i = 0; i < total; i++) {
      let pos, letter;
      if (i >= n && Math.random() < 0.32) {
        pos = seq[i - n].pos;
      } else {
        pos = NBACK_POSITIONS[Math.floor(Math.random() * NBACK_POSITIONS.length)];
      }
      if (i >= n && Math.random() < 0.32) {
        letter = seq[i - n].letter;
      } else {
        letter = NBACK_LETTERS[Math.floor(Math.random() * NBACK_LETTERS.length)];
      }
      seq.push({ pos, letter });
    }
    return seq;
  }

  function clearNBackGrid() {
    $$('#nback-grid .nback-cell').forEach((c) => c.classList.remove('active'));
  }

  function evaluatePreviousNBackTrial() {
    const i = nback.index;
    if (i < nback.n) return;
    const curr = nback.sequence[i];
    const prev = nback.sequence[i - nback.n];
    const isPosMatch = curr.pos === prev.pos;
    const isAudioMatch = curr.letter === prev.letter;

    if (isPosMatch && !nback.posPressed) nback.misses++;
    if (isAudioMatch && !nback.audioPressed) nback.misses++;
    $('#nback-hits').textContent = String(nback.hits);
    $('#nback-errors').textContent = String(nback.misses + nback.falseAlarms);
  }

  function nextNBackTrial() {
    if (!nback.running) return;
    if (nback.index >= 0) {
      evaluatePreviousNBackTrial();
    }

    nback.index++;
    if (nback.index >= nback.totalTrials) {
      finishNBack();
      return;
    }

    nback.posPressed = false;
    nback.audioPressed = false;
    $('#nback-pos-btn').classList.remove('feedback-hit', 'feedback-miss');
    $('#nback-audio-btn').classList.remove('feedback-hit', 'feedback-miss');

    const trial = nback.sequence[nback.index];
    $('#nback-trial').textContent = `${nback.index + 1} / ${nback.totalTrials}`;

    clearNBackGrid();
    const cell = $(`#nback-grid .nback-cell[data-index="${trial.pos}"]`);
    if (cell) cell.classList.add('active');

    $('#nback-letter-display').textContent = $('#nback-show-letter').checked ? trial.letter : '🔊';
    speakLetter(trial.letter);

    setTimeout(() => {
      if (nback.running) clearNBackGrid();
    }, Math.min(900, nback.speed * 0.45));

    nback.timer = setTimeout(nextNBackTrial, nback.speed);
  }

  function handleNBackResponse(type) {
    if (!nback.running || nback.index < nback.n) return;
    const curr = nback.sequence[nback.index];
    const prev = nback.sequence[nback.index - nback.n];

    if (type === 'pos' && !nback.posPressed) {
      nback.posPressed = true;
      const btn = $('#nback-pos-btn');
      if (curr.pos === prev.pos) {
        nback.hits++;
        btn.classList.add('feedback-hit');
        playTone(640, 0.08, 'sine', 0.1);
      } else {
        nback.falseAlarms++;
        btn.classList.add('feedback-miss');
        playTone(210, 0.12, 'sawtooth', 0.08);
      }
    } else if (type === 'audio' && !nback.audioPressed) {
      nback.audioPressed = true;
      const btn = $('#nback-audio-btn');
      if (curr.letter === prev.letter) {
        nback.hits++;
        btn.classList.add('feedback-hit');
        playTone(720, 0.08, 'sine', 0.1);
      } else {
        nback.falseAlarms++;
        btn.classList.add('feedback-miss');
        playTone(210, 0.12, 'sawtooth', 0.08);
      }
    }
    $('#nback-hits').textContent = String(nback.hits);
    $('#nback-errors').textContent = String(nback.misses + nback.falseAlarms);
  }

  function startNBack() {
    nback.n = parseInt($('#nback-n-select').value, 10);
    nback.speed = parseInt($('#nback-speed-select').value, 10);
    nback.totalTrials = 20;
    nback.sequence = generateNBackSequence(nback.n, nback.totalTrials);
    nback.index = -1;
    nback.hits = 0;
    nback.misses = 0;
    nback.falseAlarms = 0;
    nback.running = true;

    $('#nback-current-n').textContent = `${nback.n}-Back`;
    $('#nback-hits').textContent = '0';
    $('#nback-errors').textContent = '0';
    $('#nback-result').classList.add('hidden');
    $('#nback-start-btn').classList.add('hidden');
    $('#nback-stop-btn').classList.remove('hidden');
    $('#nback-pos-btn').disabled = false;
    $('#nback-audio-btn').disabled = false;

    nextNBackTrial();
  }

  function stopNBack() {
    nback.running = false;
    clearTimeout(nback.timer);
    clearNBackGrid();
    $('#nback-letter-display').textContent = '—';
    $('#nback-start-btn').classList.remove('hidden');
    $('#nback-stop-btn').classList.add('hidden');
    $('#nback-pos-btn').disabled = true;
    $('#nback-audio-btn').disabled = true;
  }

  function finishNBack() {
    stopNBack();
    const totalEvents = nback.hits + nback.misses + nback.falseAlarms;
    const accuracy = totalEvents === 0 ? 100 : Math.round((nback.hits / totalEvents) * 100);
    const resEl = $('#nback-result');
    resEl.classList.remove('hidden', 'success', 'warn');

    let recommendation = 'Mantén este nivel en la próxima sesión para consolidarlo.';
    if (accuracy >= 80) {
      resEl.classList.add('success');
      const nextN = Math.min(5, nback.n + 1);
      if (nextN > state.bests.nbackN) state.bests.nbackN = nextN;
      $('#nback-n-select').value = String(nextN);
      recommendation = `¡Excelente! Superaste el 80%. Hemos subido automáticamente a ${nextN}-Back para tu próxima ronda.`;
      playTone(880, 0.18, 'triangle', 0.14);
    } else {
      resEl.classList.add('warn');
      if (accuracy < 50 && nback.n > 1) {
        const lowerN = nback.n - 1;
        $('#nback-n-select').value = String(lowerN);
        recommendation = `Precisión < 50%. Ajustamos a ${lowerN}-Back para entrenar en la zona óptima.`;
      }
    }

    resEl.innerHTML = `
      <strong>Sesión ${nback.n}-Back finalizada — Precisión: ${accuracy}%</strong><br/>
      Aciertos: ${nback.hits} · Omisiones: ${nback.misses} · Falsas alarmas: ${nback.falseAlarms}<br/>
      <span class="muted">${recommendation}</span>
    `;

    awardSession({
      game: 'Dual N-Back',
      detail: `${nback.n}-Back (${nback.hits} aciertos)`,
      accuracy,
      xpEarned: accuracy >= 80 ? 45 : 25,
      dailyKey: 'nback',
    });
  }

  $('#nback-start-btn').addEventListener('click', startNBack);
  $('#nback-stop-btn').addEventListener('click', stopNBack);
  $('#nback-pos-btn').addEventListener('click', () => handleNBackResponse('pos'));
  $('#nback-audio-btn').addEventListener('click', () => handleNBackResponse('audio'));

  window.addEventListener('keydown', (e) => {
    if (!nback.running) return;
    if (e.key === 'a' || e.key === 'A') handleNBackResponse('pos');
    if (e.key === 'l' || e.key === 'L') handleNBackResponse('audio');
  });

  // ==========================================================================
  // GAME 2: SPATIAL SEQUENCE (CORSI BLOCK)
  // ==========================================================================
  const seqGrid = $('#seq-grid');
  for (let i = 0; i < 16; i++) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'seq-tile';
    tile.dataset.idx = String(i);
    tile.setAttribute('aria-label', `Bloque ${i + 1}`);
    seqGrid.appendChild(tile);
  }

  const seqGame = {
    active: false,
    accepting: false,
    mode: 'forward',
    length: 3,
    sequence: [],
    expected: [],
    step: 0,
    maxCleared: 0,
  };

  $('#seq-mode').addEventListener('change', renderAllUI);

  async function playSequenceRound() {
    seqGame.accepting = false;
    seqGame.sequence = [];
    for (let i = 0; i < seqGame.length; i++) {
      let next;
      do {
        next = Math.floor(Math.random() * 16);
      } while (seqGame.sequence.length > 0 && seqGame.sequence[seqGame.sequence.length - 1] === next);
      seqGame.sequence.push(next);
    }
    seqGame.expected = seqGame.mode === 'backward' ? [...seqGame.sequence].reverse() : [...seqGame.sequence];
    seqGame.step = 0;

    $('#seq-level').textContent = String(seqGame.length);
    $('#seq-status').textContent = 'Observa la secuencia...';

    await sleep(500);
    for (const idx of seqGame.sequence) {
      if (!seqGame.active) return;
      const tile = seqGrid.children[idx];
      tile.classList.add('lit');
      playTone(300 + idx * 28, 0.18, 'sine', 0.11);
      await sleep(520);
      tile.classList.remove('lit');
      await sleep(190);
    }

    if (!seqGame.active) return;
    seqGame.accepting = true;
    $('#seq-status').textContent = seqGame.mode === 'backward'
      ? 'Tu turno: repítela AL REVÉS'
      : 'Tu turno: repite el orden';
  }

  $('#seq-start-btn').addEventListener('click', () => {
    seqGame.active = true;
    seqGame.mode = $('#seq-mode').value;
    seqGame.length = 3;
    seqGame.maxCleared = 0;
    $('#seq-result').classList.add('hidden');
    playSequenceRound();
  });

  seqGrid.addEventListener('click', async (e) => {
    const tile = e.target.closest('.seq-tile');
    if (!tile || !seqGame.accepting || !seqGame.active) return;
    const idx = parseInt(tile.dataset.idx, 10);

    if (idx === seqGame.expected[seqGame.step]) {
      tile.classList.add('correct');
      playTone(540 + seqGame.step * 45, 0.1, 'sine', 0.1);
      setTimeout(() => tile.classList.remove('correct'), 240);
      seqGame.step++;

      if (seqGame.step === seqGame.expected.length) {
        seqGame.accepting = false;
        seqGame.maxCleared = seqGame.length;
        $('#seq-status').textContent = '¡Correcto! Subiendo dificultad...';
        seqGame.length++;
        await sleep(750);
        playSequenceRound();
      }
    } else {
      tile.classList.add('wrong');
      playTone(180, 0.25, 'sawtooth', 0.1);
      setTimeout(() => tile.classList.remove('wrong'), 450);

      seqGame.active = false;
      seqGame.accepting = false;
      const achieved = seqGame.maxCleared;
      const key = seqGame.mode === 'backward' ? 'seqBackward' : 'seqForward';
      if (achieved > state.bests[key]) state.bests[key] = achieved;

      const targetGoal = seqGame.mode === 'backward' ? 6 : 7;
      const accuracy = Math.min(100, Math.round((achieved / targetGoal) * 100));

      $('#seq-status').textContent = 'Ronda terminada';
      const res = $('#seq-result');
      res.classList.remove('hidden', 'success', 'warn');
      res.classList.add(achieved >= 5 ? 'success' : 'warn');
      res.innerHTML = `
        <strong>Secuencia Espacial (${seqGame.mode === 'backward' ? 'Inverso' : 'Directo'})</strong><br/>
        Máxima longitud completada: <strong>${achieved} bloques</strong> (Objetivo: ${targetGoal}).
      `;

      awardSession({
        game: 'Secuencia Espacial',
        detail: `${seqGame.mode === 'backward' ? 'Inverso' : 'Directo'} · ${achieved} bloques`,
        accuracy,
        xpEarned: Math.max(15, achieved * 7),
        dailyKey: 'sequence',
      });
    }
  });

  // ==========================================================================
  // GAME 3: DIGIT SPAN & CHUNKING
  // ==========================================================================
  const digitGame = {
    active: false,
    mode: 'forward',
    len: 4,
    streak: 0,
    currentNumber: '',
    maxCleared: 0,
    timerId: null,
  };

  $('#digit-mode').addEventListener('change', renderAllUI);

  function showDigitRound() {
    let num = '';
    for (let i = 0; i < digitGame.len; i++) {
      num += String(Math.floor(Math.random() * 10));
    }
    digitGame.currentNumber = num;
    $('#digit-len').textContent = String(digitGame.len);
    $('#digit-streak').textContent = String(digitGame.streak);

    // Format visually in chunks of 3 for easier reading, but expect raw digits
    const formatted = num.replace(/(\d{3})(?=\d)/g, '$1 ');
    $('#digit-display').textContent = formatted;
    $('#digit-form').classList.add('hidden');
    $('#digit-timer-wrap').classList.remove('hidden');

    const showMs = Math.max(2000, digitGame.len * 650);
    const bar = $('#digit-timer-bar');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    requestAnimationFrame(() => {
      bar.style.transition = `width ${showMs}ms linear`;
      bar.style.width = '0%';
    });

    clearTimeout(digitGame.timerId);
    digitGame.timerId = setTimeout(() => {
      $('#digit-display').textContent = digitGame.mode === 'backward' ? 'Escríbelo AL REVÉS' : '¿Cuál era el número?';
      $('#digit-timer-wrap').classList.add('hidden');
      $('#digit-form').classList.remove('hidden');
      $('#digit-input').value = '';
      $('#digit-input').focus();
    }, showMs);
  }

  $('#digit-start-btn').addEventListener('click', () => {
    digitGame.active = true;
    digitGame.mode = $('#digit-mode').value;
    digitGame.len = parseInt($('#digit-start-len').value, 10);
    digitGame.streak = 0;
    digitGame.maxCleared = 0;
    $('#digit-result').classList.add('hidden');
    showDigitRound();
  });

  $('#digit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!digitGame.active) return;
    const raw = $('#digit-input').value.replace(/\s+/g, '');
    const expected = digitGame.mode === 'backward'
      ? digitGame.currentNumber.split('').reverse().join('')
      : digitGame.currentNumber;

    if (raw === expected) {
      playTone(680, 0.12, 'sine', 0.12);
      digitGame.maxCleared = digitGame.len;
      digitGame.streak++;
      digitGame.len++;
      showDigitRound();
    } else {
      playTone(200, 0.22, 'sawtooth', 0.1);
      digitGame.active = false;
      $('#digit-form').classList.add('hidden');
      $('#digit-display').textContent = 'Fin de la ronda';

      const key = digitGame.mode === 'backward' ? 'digitBackward' : 'digitForward';
      if (digitGame.maxCleared > state.bests[key]) {
        state.bests[key] = digitGame.maxCleared;
      }

      const goal = digitGame.mode === 'backward' ? 7 : 9;
      const accuracy = Math.min(100, Math.round((digitGame.maxCleared / goal) * 100));

      const res = $('#digit-result');
      res.classList.remove('hidden', 'success', 'warn');
      res.classList.add(digitGame.maxCleared >= 6 ? 'success' : 'warn');
      res.innerHTML = `
        <strong>Respuesta esperada:</strong> <code>${expected}</code> · <strong>Tu respuesta:</strong> <code>${raw || '(vacío)'}</code><br/>
        Máximo superado: <strong>${digitGame.maxCleared} dígitos</strong> (Objetivo: ${goal}).
      `;

      awardSession({
        game: 'Span Numérico',
        detail: `${digitGame.mode === 'backward' ? 'Inverso' : 'Directo'} · ${digitGame.maxCleared} dígitos`,
        accuracy,
        xpEarned: Math.max(15, digitGame.maxCleared * 6),
        dailyKey: 'digits',
      });
    }
  });

  // ==========================================================================
  // GAME 4: MENTAL MATH UPDATING
  // ==========================================================================
  const mentalGame = {
    active: false,
    round: 0,
    totalRounds: 5,
    score: 0,
    answer: 0,
    diff: 'medium',
  };

  function buildMentalChain(diff) {
    const stepsCount = diff === 'easy' ? 4 : diff === 'medium' ? 5 : 7;
    const delayMs = diff === 'hard' ? 1550 : 2000;
    let val = Math.floor(Math.random() * 20) + 10;
    const ops = [{ label: 'Número inicial', display: String(val) }];

    for (let i = 0; i < stepsCount; i++) {
      const r = Math.random();
      if (diff !== 'easy' && r < 0.22 && val <= 45) {
        val *= 2;
        ops.push({ label: `Paso ${i + 1} de ${stepsCount}`, display: '× 2' });
      } else if (r < 0.62 || val < 12) {
        const add = Math.floor(Math.random() * (diff === 'easy' ? 9 : 14)) + 3;
        val += add;
        ops.push({ label: `Paso ${i + 1} de ${stepsCount}`, display: `+ ${add}` });
      } else {
        const sub = Math.floor(Math.random() * Math.min(12, val - 2)) + 2;
        val -= sub;
        ops.push({ label: `Paso ${i + 1} de ${stepsCount}`, display: `− ${sub}` });
      }
    }
    return { ops, answer: val, delayMs };
  }

  async function runMentalRound() {
    mentalGame.round++;
    $('#mental-round').textContent = `${mentalGame.round} / ${mentalGame.totalRounds}`;
    $('#mental-score').textContent = String(mentalGame.score);
    $('#mental-form').classList.add('hidden');

    const { ops, answer, delayMs } = buildMentalChain(mentalGame.diff);
    mentalGame.answer = answer;

    for (const step of ops) {
      if (!mentalGame.active) return;
      $('#mental-step-label').textContent = step.label;
      $('#mental-display').textContent = step.display;
      playTone(460, 0.08, 'triangle', 0.08);
      await sleep(delayMs);
      $('#mental-display').textContent = '·';
      await sleep(260);
    }

    if (!mentalGame.active) return;
    $('#mental-step-label').textContent = '¿Resultado final?';
    $('#mental-display').textContent = '?';
    $('#mental-form').classList.remove('hidden');
    $('#mental-input').value = '';
    $('#mental-input').focus();
  }

  $('#mental-start-btn').addEventListener('click', () => {
    mentalGame.active = true;
    mentalGame.round = 0;
    mentalGame.score = 0;
    mentalGame.diff = $('#mental-diff').value;
    $('#mental-result').classList.add('hidden');
    runMentalRound();
  });

  $('#mental-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!mentalGame.active) return;
    const userVal = parseInt($('#mental-input').value, 10);
    const correct = userVal === mentalGame.answer;

    if (correct) {
      mentalGame.score++;
      playTone(720, 0.12, 'sine', 0.12);
      $('#mental-step-label').textContent = '¡Correcto!';
      $('#mental-display').textContent = `= ${mentalGame.answer}`;
    } else {
      playTone(200, 0.2, 'sawtooth', 0.1);
      $('#mental-step-label').textContent = `Incorrecto (era ${mentalGame.answer})`;
      $('#mental-display').textContent = `= ${mentalGame.answer}`;
    }

    $('#mental-form').classList.add('hidden');
    $('#mental-score').textContent = String(mentalGame.score);

    if (mentalGame.round < mentalGame.totalRounds) {
      await sleep(1100);
      runMentalRound();
    } else {
      mentalGame.active = false;
      const accuracy = Math.round((mentalGame.score / mentalGame.totalRounds) * 100);
      if (accuracy > state.bests.mentalAcc) state.bests.mentalAcc = accuracy;

      const res = $('#mental-result');
      res.classList.remove('hidden', 'success', 'warn');
      res.classList.add(accuracy >= 80 ? 'success' : 'warn');
      res.innerHTML = `
        <strong>Ronda de Cálculo Activo completada — ${mentalGame.score} / ${mentalGame.totalRounds} (${accuracy}%)</strong><br/>
        <span class="muted">${accuracy >= 80 ? '¡Gran control ejecutivo! Prueba subir la dificultad.' : 'Sigue practicando para fortalecer la actualización mental.'}</span>
      `;

      awardSession({
        game: 'Cálculo Activo',
        detail: `${mentalGame.diff} · ${mentalGame.score}/${mentalGame.totalRounds}`,
        accuracy,
        xpEarned: accuracy >= 80 ? 40 : 20,
        dailyKey: 'mental',
      });
    }
  });

  // ==========================================================================
  // FOCUS POMODORO TIMER
  // ==========================================================================
  const pomo = {
    totalSeconds: 25 * 60,
    remaining: 25 * 60,
    interval: null,
  };

  function renderPomo() {
    const m = String(Math.floor(pomo.remaining / 60)).padStart(2, '0');
    const s = String(pomo.remaining % 60).padStart(2, '0');
    $('#pomo-display').textContent = `${m}:${s}`;
  }

  $$('.timer-presets button').forEach((btn) => {
    btn.addEventListener('click', () => {
      clearInterval(pomo.interval);
      pomo.interval = null;
      $$('.timer-presets button').forEach((b) => b.classList.remove('active-preset'));
      btn.classList.add('active-preset');
      const mins = parseInt(btn.dataset.minutes, 10);
      pomo.totalSeconds = mins * 60;
      pomo.remaining = pomo.totalSeconds;
      renderPomo();
      $('#pomo-status').textContent = `Bloque configurado a ${mins} minutos.`;
    });
  });

  $('#pomo-start').addEventListener('click', () => {
    if (pomo.interval) return;
    $('#pomo-status').textContent = 'En foco profundo... evita distracciones.';
    pomo.interval = setInterval(() => {
      pomo.remaining--;
      renderPomo();
      if (pomo.remaining <= 0) {
        clearInterval(pomo.interval);
        pomo.interval = null;
        playTone(784, 0.25, 'triangle', 0.16);
        $('#pomo-status').textContent = '¡Bloque completado! Excelente trabajo.';
        awardSession({
          game: 'Foco Profundo',
          detail: `${Math.round(pomo.totalSeconds / 60)} min sin distracciones`,
          accuracy: 100,
          xpEarned: 40,
          dailyKey: 'focus',
        });
      }
    }, 1000);
  });

  $('#pomo-pause').addEventListener('click', () => {
    clearInterval(pomo.interval);
    pomo.interval = null;
    $('#pomo-status').textContent = 'Temporizador en pausa.';
  });

  $('#pomo-reset').addEventListener('click', () => {
    clearInterval(pomo.interval);
    pomo.interval = null;
    pomo.remaining = pomo.totalSeconds;
    renderPomo();
    $('#pomo-status').textContent = 'Temporizador reiniciado.';
  });

  // -------------------- INIT --------------------
  applyThemeAndSound();
  renderPomo();
  renderAllUI();
})();
