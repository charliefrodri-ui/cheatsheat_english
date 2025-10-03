/* ==============================
   app.js — Lógica de la aplicación (+ TTS por fila)
   ============================== */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // --- Persistencia de favoritos ---
  const favKey = "chuleta:favorites";
  function loadFavSet() {
    try { return new Set(JSON.parse(localStorage.getItem(favKey) || "[]")); }
    catch { return new Set(); }
  }
  function saveFavSet(set) { localStorage.setItem(favKey, JSON.stringify([...set])); }
  const favoriteIds = loadFavSet();

  // --- Estado global ---
  let state = { searchTerm: "", currentView: "home" };

  // --- TTS (Web Speech API) ---
  const ttsRateKey = "chuleta:ttsRate";
  const ttsVoiceKey = "chuleta:ttsVoiceURI";
  const Speech = {
    voices: [],
    voice: null,
    rate: parseFloat(localStorage.getItem(ttsRateKey) || "1.0"),
    ready: false
  };

  function pickDefaultVoice() {
    const byLang = (lang) => Speech.voices.find(v => (v.lang || "").toLowerCase().startsWith(lang));
    Speech.voice = byLang("en-gb") || byLang("en-us") || Speech.voices.find(v => (v.lang || "").toLowerCase().startsWith("en"));
    const savedURI = localStorage.getItem(ttsVoiceKey);
    if (savedURI) {
      const saved = Speech.voices.find(v => v.voiceURI === savedURI);
      if (saved) Speech.voice = saved;
    }
  }

  function loadVoicesAndBuildSelector() {
    Speech.voices = window.speechSynthesis.getVoices().filter(v => (v.lang||"").toLowerCase().startsWith("en"));
    pickDefaultVoice();
    const sel = $("#voice-select");
    if (sel) {
      sel.innerHTML = Speech.voices.map(v => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join("");
      if (Speech.voice) sel.value = Speech.voice.voiceURI;
      sel.onchange = () => {
        const v = Speech.voices.find(x => x.voiceURI === sel.value);
        if (v) { Speech.voice = v; localStorage.setItem(ttsVoiceKey, v.voiceURI); }
      };
    }
    const rate = $("#voice-rate");
    if (rate) {
      rate.value = Speech.rate;
      rate.oninput = () => { Speech.rate = parseFloat(rate.value || "1.0"); localStorage.setItem(ttsRateKey, String(Speech.rate)); };
    }
    Speech.ready = true;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => loadVoicesAndBuildSelector();
    setTimeout(() => loadVoicesAndBuildSelector(), 200);
  }

  function speak(text, langFallback = "en-GB") {
    if (!("speechSynthesis" in window)) { alert("Tu navegador no soporta síntesis de voz."); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Speech.rate || 1.0;
    if (Speech.voice) u.voice = Speech.voice; else u.lang = langFallback;
    window.speechSynthesis.speak(u);
  }

  // --- Búsqueda ---
  function setupSearch() {
    const input = $("#search-input");
    input.addEventListener("input", () => { state.searchTerm = input.value.trim(); render(); });
  }

  // --- Utilidades de tablas ---
  function rowMatchesSearch(row, searchLower) {
    if (!searchLower) return true;
    if (row && row.type === "heading") return true;
    return row.some?.((cell) => String(cell).toLowerCase().includes(searchLower));
  }
  function iconFav(id) {
    const fav = favoriteIds.has(id);
    return `<button class="btn-fav ${fav ? "favorited" : ""}" title="Favorito" data-fav="${id}">★</button>`;
  }
  function iconSpeak(text) {
    const safe = String(text).replace(/"/g,'&quot;');
    return `<button class="btn-play" title="Pronunciar" data-say="${safe}">🔊</button>`;
  }
  function rowId(sectionId, row) { return sectionId + "::" + (Array.isArray(row) ? row.join("|") : row.text); }
  
  function renderTable(section) {
    const search = state.searchTerm.toLowerCase();
    const headers = section.headers || [];
    let rows = section.rows || [];

    let html = `<div class="card" id="${section.id}">
      <div class="card-header"><h2>${section.title}</h2>${section.note ? `<small> — ${section.note}</small>` : ""}</div>
      <div class="card-content">`;

    html += `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}<th>★</th></tr></thead><tbody>`;

    rows.forEach((row) => {
      if (row && row.type === "heading") {
        html += `<tr><td class="subheading" colspan="${headers.length + 1}">${row.text}</td></tr>`;
        return;
      }
      if (!rowMatchesSearch(row, search)) return;
      const rid = rowId(section.id, row);
      
      let rowHtml = '<tr>';

      // =================================================================
      // LÓGICA PERSONALIZADA POR SECCIÓN
      // =================================================================

      // --- Verbos Irregulares: Audio en las 3 primeras columnas ---
      if (section.id === 'verbs_irregular') {
        row.forEach((cell, index) => {
          if (index <= 2) { // Base, Past, Participle
            rowHtml += `<td>${cell} ${iconSpeak(cell)}</td>`;
          } else { // Español
            rowHtml += `<td>${cell}</td>`;
          }
        });
      
      // --- Verbos Regulares: Audio en las 2 primeras columnas ---
      } else if (section.id === 'verbs_regular') {
        row.forEach((cell, index) => {
          if (index <= 1) { // Base, Past
            rowHtml += `<td>${cell} ${iconSpeak(cell)}</td>`;
          } else { // Español
            rowHtml += `<td>${cell}</td>`;
          }
        });
      
      // --- Secciones con audio solo en la primera columna ---
      } else if (['prepositions', 'vocab', 'phrasal', 'idioms', 'adverbs', 'connectors', 'false_friends'].includes(section.id)) {
        row.forEach((cell, index) => {
          if (index === 0) {
            rowHtml += `<td>${cell} ${iconSpeak(cell)}</td>`;
          } else {
            rowHtml += `<td>${cell}</td>`;
          }
        });

      // --- Secciones sin audio (por defecto) ---
      } else {
        rowHtml += row.map((cell) => `<td>${cell}</td>`).join("");
      }

      rowHtml += `<td>${iconFav(rid)}</td></tr>`;
      html += rowHtml;
    });
    html += `</tbody></table></div></div>`;
    return html;
  }

  // --- Aplanar filas para Favoritos ---
  function flattenRows() {
    const acc = [];
    Object.values(DATA).forEach((s) => {
      if (!Array.isArray(s.rows)) return;
      s.rows.forEach((row) => {
        if (row && row.type === "heading") return;
        if (!Array.isArray(row)) return;
        const id = rowId(s.id, row);
        acc.push({ id, row, section: s.title, sectionId: s.id });
      });
    });
    return acc;
  }

  // --- Renderizado de Favoritos (audio solo en el término en inglés) ---
  function renderFavorites() {
    const favs = flattenRows().filter((r) => favoriteIds.has(r.id));
    let html = `<div class="card" id="favorites">
      <div class="card-header"><h2>⭐ Favoritos</h2><small>— Acceso rápido a tu selección</small></div>
      <div class="card-content">
        <div class="note">Haz clic en la ⭐ de cualquier fila para añadir o quitar favoritos. Usa 🔊 para escuchar la pronunciación.</div>
        <table><thead><tr><th>Elemento</th><th>Descripción</th><th>Sección</th><th>★</th></tr></thead><tbody>`;
    favs.forEach(({ id, row, section, sectionId }) => {
      let term = row[0];
      // Para conectores/adverbios, el favorito es la categoría, no la lista. No ponemos audio.
      let speakButton = (sectionId !== 'adverbs' && sectionId !== 'connectors') ? iconSpeak(term) : '';
      
      html += `<tr>
        <td>${term} ${speakButton}</td>
        <td>${row.slice(1).join(" / ")}</td>
        <td>${section}</td>
        <td>${iconFav(id)}</td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
    return html;
  }


  // --- Importar/Exportar CSV/JSON ---
  function setupImportExport() {
    const btnImport = $("#btn-import");
    const btnExport = $("#btn-export");
    const selSection = $("#import-section");
    const fileInput = $("#file-import");

    selSection.innerHTML = Object.values(DATA)
      .filter(s => s.id !== "quiz")
      .map(s => `<option value="${s.id}">${s.title}</option>`).join("");

    btnImport.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const sectionId = selSection.value;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        try {
          if (file.name.endsWith(".json")) {
            const arr = JSON.parse(text);
            if (Array.isArray(arr)) {
              DATA[sectionId].rows.push(...arr);
              alert(`Importadas ${arr.length} filas en ${DATA[sectionId].title}`);
              render(); return;
            }
          }
          const lines = String(text).split(/\r?\n/).filter(Boolean);
          const rows = lines.map((ln) => ln.split(",").map((c) => c.trim()));
          DATA[sectionId].rows.push(...rows);
          alert(`Importadas ${rows.length} filas CSV en ${DATA[sectionId].title}`);
          render();
        } catch (err) { alert("Error al importar: " + err.message); }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    btnExport.addEventListener("click", () => {
      const payload = { exportedAt: new Date().toISOString(), data: DATA };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "chuleta_export.json"; a.click();
      URL.revokeObjectURL(url);
    });
  }

  // --- Quiz ---
  const Quiz = {
    poolSections: ["vocab", "phrasal", "idioms"],
    questions: [], current: 0, userAnswer: "", feedback: null,
    start(count = 15, sectionId = "vocab") {
      const src = (DATA[sectionId]?.rows || []).filter(r => Array.isArray(r));
      const shuffled = [...src].sort(() => Math.random() - 0.5);
      this.questions = shuffled.slice(0, count).map(([en, es, ex]) => ({ prompt: es, answer: en, extra: ex }));
      this.current = 0; this.userAnswer = ""; this.feedback = null; render();
      setTimeout(() => $("#quiz-input")?.focus(), 0);
    },
    getQ() { return this.questions[this.current]; },
    check() {
      const q = this.getQ(); if (!q) return;
      const guess = this.userAnswer.trim().toLowerCase();
      const ok = guess === q.answer.toLowerCase();
      this.feedback = { ok, msg: ok ? "✅ ¡Correcto!" : `❌ Incorrecto. Respuesta correcta: <b>${q.answer}</b>` };
      render(); setTimeout(() => $("#quiz-input")?.focus(), 0);
    },
    next() {
      if (this.current < this.questions.length - 1) {
        this.current++; this.userAnswer = ""; this.feedback = null; render();
        setTimeout(() => $("#quiz-input")?.focus(), 0);
      } else { this.feedback = { ok: true, msg: "🏁 ¡Has completado el quiz!" }; render(); }
    }
  };

  function renderQuiz() {
    const q = Quiz.getQ();
    const sectionOptions = Object.values(DATA).filter(s => ["vocab","phrasal","idioms"].includes(s.id))
      .map(s => `<option value="${s.id}">${s.title}</option>`).join("");
    return `
      <div class="card">
        <div class="card-header"><h2>🧠 Quiz Interactivo</h2>
          <small>— Escribe la traducción al <b>inglés</b>. Usa 🔊 para escuchar la solución.</small>
        </div>
        <div class="card-content quiz-container">
          <div style="max-width:680px;margin:0 auto">
            <div class="note">Elige fuente y número de preguntas:</div>
            <div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:16px">
              <label>Fuente:&nbsp;<select id="quiz-source">${sectionOptions}</select></label>
              <label>&nbsp;Preguntas:&nbsp;<input id="quiz-count" type="number" min="5" max="50" value="${Quiz.questions.length||15}" style="width:80px"></label>
              <button class="btn" id="quiz-start">Iniciar</button>
              ${q ? `<button class="btn" id="quiz-say">🔊 Pronunciar solución</button>` : ""}
            </div>
            ${q ? `
              <div class="quiz-prompt">Traduce la siguiente palabra al inglés:</div>
              <div class="quiz-word">${q.prompt}</div>
              <input id="quiz-input" type="text" placeholder="Escribe tu respuesta..." value="${Quiz.userAnswer || ""}">
              <div style="margin-top:12px;display:flex;gap:8px;justify-content:center">
                <button class="btn" id="quiz-check">Comprobar</button>
                <button class="btn" id="quiz-next">Siguiente</button>
              </div>
              <div class="quiz-feedback ${Quiz.feedback?.ok ? "feedback-correct":"feedback-incorrect"}">
                ${Quiz.feedback ? Quiz.feedback.msg : ""}
                ${q.extra ? `<div class="note" style="margin-top:8px">Ejemplo: <em>${q.extra}</em></div>` : ""}
              </div>
            ` : `<div class="quiz-feedback">Pulsa <b>Iniciar</b> para comenzar.</div>`}
          </div>
        </div>
      </div>`;
  }

  // --- Render principal ---
  function render() {
    const body = $("#app-body");
    const view = state.currentView;

    body.onclick = (e) => {
      const favBtn = e.target.closest("button[data-fav]");
      const sayBtn = e.target.closest("button[data-say]");
      if (favBtn) {
        const id = favBtn.getAttribute("data-fav");
        if (favoriteIds.has(id)) favoriteIds.delete(id); else favoriteIds.add(id);
        saveFavSet(favoriteIds); render(); return;
      }
      if (sayBtn) {
        const text = sayBtn.getAttribute("data-say") || "";
        if (text.trim()) speak(text);
        return;
      }
      if (e.target.id === "quiz-check") { Quiz.check(); return; }
      if (e.target.id === "quiz-next")  { Quiz.next();  return; }
      if (e.target.id === "quiz-start") {
        const count = parseInt($("#quiz-count").value || "15", 10);
        const source = $("#quiz-source").value;
        Quiz.start(count, source);
        return;
      }
      if (e.target.id === "quiz-say") {
        const q = Quiz.getQ(); if (q?.answer) speak(q.answer);
        return;
      }
    };
    body.oninput = (e) => { if (e.target.id === "quiz-input") { Quiz.userAnswer = e.target.value; } };
    body.onkeydown = (e) => { if (e.key === "Enter" && e.target.id === "quiz-input") { Quiz.check(); } };

    if (view === "quiz") { body.innerHTML = renderQuiz(); return; }

    const search = state.searchTerm.toLowerCase();
    const sections = Object.values(DATA).filter(s => s.id !== "quiz");
    const filtered = sections.map(s => ({ ...s, rows: (s.rows || []).filter((r) => r && r.type === "heading" || rowMatchesSearch(r, search)) }));
    
    body.innerHTML = (favoriteIds.size > 0 ? renderFavorites() : '') + filtered.map(s => renderTable(s)).join("");

    const activeId = view.startsWith("section:") ? view.split(":")[1] : null;
    $$("#nav-menu a").forEach(a => {
      const on = (activeId && a.dataset.id === activeId) || (!activeId && a.dataset.id === "favorites");
      a.classList.toggle("active", on);
    });
  }

  // --- Menú lateral ---
  function buildMenu() {
    const nav = $("#nav-menu");
    const sections = Object.values(DATA);
    nav.innerHTML = sections.map((s) => `<a href="#${s.id}" data-id="${s.id}">${s.title}</a>`).join("");
    nav.addEventListener("click", (e) => {
      if (e.target.matches("a[data-id]")) {
        e.preventDefault();
        const id = e.target.getAttribute("data-id");
        state.currentView = (id === "quiz") ? "quiz" : "section:" + id;
        render();
        const targetEl = document.getElementById(id);
        if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // --- Header / Herramientas ---
  function initHeader() {
    const header = document.querySelector("header");
    const tools = document.createElement("div");
    tools.style.marginLeft = "auto";
    tools.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        <select id="import-section" title="Sección destino"></select>
        <input id="file-import" type="file" accept=".csv,.json" style="display:none">
        <button class="btn" id="btn-import">Importar CSV/JSON</button>
        <button class="btn" id="btn-export">Exportar JSON</button>
        <button class="btn" id="btn-quiz">Quiz</button>
        <div class="note" style="margin-left:8px">Voz:</div>
        <select id="voice-select" title="Voz (en)"></select>
        <label class="note">Vel:&nbsp;<input id="voice-rate" type="range" min="0.6" max="1.4" step="0.05" value="${Speech.rate}" style="vertical-align:middle"></label>
      </div>`;
    header.appendChild(tools);
    $("#btn-quiz").addEventListener("click", () => { state.currentView = "quiz"; render(); });
  }

  function init() {
    buildMenu();
    setupSearch();
    initHeader();
    setupImportExport();
    render();
    if ("speechSynthesis" in window) {
      setTimeout(() => loadVoicesAndBuildSelector(), 0);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();