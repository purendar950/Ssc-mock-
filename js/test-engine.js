/* ===========================================================
   ExamZen - Test engine
   Loads a test JSON, renders the CBT-style interface, tracks
   answers, runs the timer, and submits + scores the attempt.
   =========================================================== */

const TestEngine = (() => {
  let testData = null;
  let answers = {};          // key "s_q" -> { selected, status, marked }
  let currentSection = 0;
  let currentQuestion = 0;
  let timeRemaining = 0;
  let timerId = null;
  let lang = "en";           // en | hi | both
  let testId = null;

  const key = (s, q) => `${s}_${q}`;
  const progressKey = () => "ez_progress_" + testId;

  async function init() {
    testId = EZ.qs("testId");
    if (!testId) return fail("No test specified.");
    if (!EZAuth.currentUser()) {
      location.href = EZ.url("login.html?next=") + encodeURIComponent(location.pathname + location.search);
      return;
    }

    let res;
    try {
      res = await fetch("data/tests/" + testId + ".json");
      if (!res.ok) throw new Error("not found");
      testData = await res.json();
    } catch {
      // Fallback: load a demo bank so any listed mock is still attemptable.
      try {
        res = await fetch("data/tests/cgl-full-mock-01.json");
        testData = await res.json();
        testData = { ...testData, testName: (EZ.qs("title") || testData.testName) + " (Demo questions)", _demo: true };
      } catch {
        return fail("Could not load this test. Serve the site over HTTP (not file://).");
      }
    }

    // Premium gating: from the test file or the ?premium=1 flag passed by the portal.
    const wantsPremium = testData.isPremium || EZ.qs("premium") === "1";
    if (wantsPremium && !EZAuth.isPremium()) {
      alert("This is a Premium test. Redirecting to pricing.");
      location.href = EZ.url("pricing.html");
      return;
    }

    // Resume?
    const saved = EZ.get(progressKey());
    if (saved && confirm("You have a saved attempt for this test. Resume where you left off?")) {
      answers = saved.answers;
      timeRemaining = saved.timeRemaining;
      currentSection = saved.currentSection || 0;
      currentQuestion = saved.currentQuestion || 0;
      lang = saved.lang || "en";
    } else {
      EZ.del(progressKey());
      initAnswers();
      timeRemaining = testData.duration;
    }

    document.body.classList.add("test-mode");
    renderShell();
    renderSectionTabs();
    renderQuestion();
    renderPalette();
    startTimer();
  }

  function initAnswers() {
    answers = {};
    testData.sections.forEach((sec, si) =>
      sec.questions.forEach((_, qi) => {
        answers[key(si, qi)] = { selected: null, status: "not_visited", marked: false };
      })
    );
  }

  function fail(msg) {
    document.getElementById("app").innerHTML =
      `<div class="container page"><div class="empty-state"><div class="big">⚠️</div>${msg}<br><a href="exams/index.html">Back to exams</a></div></div>`;
  }

  /* ---------- Rendering ---------- */
  function renderShell() {
    document.getElementById("app").innerHTML = `
      <div class="test-shell">
        <div class="test-topbar">
          <div class="test-name">📋 ${testData.testName}</div>
          <div class="lang-toggle">
            <button data-lang="en" onclick="TestEngine.setLang('en')">EN</button>
            <button data-lang="hi" onclick="TestEngine.setLang('hi')">हिं</button>
            <button data-lang="both" onclick="TestEngine.setLang('both')">Both</button>
          </div>
          <div class="timer" id="timer">--:--</div>
        </div>
        <div class="section-tabs" id="section-tabs"></div>
        <div class="test-body">
          <div class="question-pane" id="question-pane"></div>
          <aside class="palette-pane" id="palette-pane"></aside>
        </div>
        <div class="palette-backdrop" id="palette-backdrop" onclick="TestEngine.togglePalette(false)"></div>
        <div class="action-bar">
          <button class="btn btn-outline btn-sm" onclick="TestEngine.markReview()" id="mark-btn">⚑ Mark for Review</button>
          <button class="btn btn-outline btn-sm" onclick="TestEngine.clearResponse()">Clear</button>
          <button class="btn btn-outline btn-sm palette-toggle" onclick="TestEngine.togglePalette(true)">☰ Palette</button>
          <span class="spacer"></span>
          <button class="btn btn-outline btn-sm" onclick="TestEngine.prev()">← Prev</button>
          <button class="btn btn-primary btn-sm" onclick="TestEngine.saveNext()">Save & Next →</button>
          <button class="btn btn-danger btn-sm" onclick="TestEngine.confirmSubmit()">Submit</button>
        </div>
      </div>`;
    updateLangButtons();
  }

  function setLang(l) { lang = l; updateLangButtons(); renderQuestion(); saveProgress(); }
  function updateLangButtons() {
    document.querySelectorAll(".lang-toggle button").forEach(b =>
      b.classList.toggle("active", b.dataset.lang === lang));
  }

  function renderSectionTabs() {
    document.getElementById("section-tabs").innerHTML = testData.sections.map((s, i) =>
      `<button class="${i===currentSection?'active':''}" onclick="TestEngine.gotoSection(${i})">
        ${s.sectionName} <span class="muted">(${s.questions.length})</span>
      </button>`).join("");
  }

  function globalQNo() {
    let n = 0;
    for (let i = 0; i < currentSection; i++) n += testData.sections[i].questions.length;
    return n + currentQuestion + 1;
  }

  function renderQuestion() {
    const sec = testData.sections[currentSection];
    const q = sec.questions[currentQuestion];
    const k = key(currentSection, currentQuestion);
    const st = answers[k];
    if (st.status === "not_visited") st.status = "not_answered";

    const showEn = lang === "en" || lang === "both";
    const showHi = lang === "hi" || lang === "both";

    const optHtml = ["A", "B", "C", "D"].map(o => {
      const opt = q.options[o];
      return `<div class="option ${st.selected===o?'selected':''}" onclick="TestEngine.select('${o}')">
        <div class="key">${o}</div>
        <div>
          ${showEn ? `<span>${opt.en}</span>` : ""}
          ${showHi ? `<span class="opt-hi">${opt.hi}</span>` : ""}
        </div>
      </div>`;
    }).join("");

    document.getElementById("question-pane").innerHTML = `
      <div class="q-no">Question ${globalQNo()} • ${sec.sectionName}</div>
      ${showEn ? `<div class="q-text">${q.en}</div>` : ""}
      ${showHi ? `<div class="q-text-hi">${q.hi}</div>` : ""}
      <div class="options">${optHtml}</div>`;

    document.getElementById("mark-btn").classList.toggle("btn-primary", st.marked);
    renderSectionTabs();
    renderPalette();
    saveProgress();
  }

  function renderPalette() {
    const sec = testData.sections[currentSection];
    const buttons = sec.questions.map((_, qi) => {
      const st = answers[key(currentSection, qi)];
      let cls = "pal-" + st.status;
      if (st.marked && st.selected) cls = "pal-answered_marked";
      else if (st.marked) cls = "pal-marked";
      if (qi === currentQuestion) cls += " pal-current";
      return `<button class="${cls}" onclick="TestEngine.goto(${qi})">${qi+1}</button>`;
    }).join("");

    document.getElementById("palette-pane").innerHTML = `
      <b>${sec.sectionName}</b>
      <div class="palette-grid">${buttons}</div>
      <div class="legend">
        <span><i class="dot pal-answered"></i> Answered</span>
        <span><i class="dot pal-not_answered"></i> Not answered</span>
        <span><i class="dot pal-marked"></i> Marked for review</span>
        <span><i class="dot pal-answered_marked"></i> Answered + marked</span>
        <span><i class="dot pal-not_visited" style="border:1px solid var(--border)"></i> Not visited</span>
      </div>`;
  }

  /* ---------- Interactions ---------- */
  function select(o) {
    const st = answers[key(currentSection, currentQuestion)];
    st.selected = o;
    st.status = "answered";
    renderQuestion();
  }
  function clearResponse() {
    const st = answers[key(currentSection, currentQuestion)];
    st.selected = null;
    st.status = "not_answered";
    renderQuestion();
  }
  function markReview() {
    const st = answers[key(currentSection, currentQuestion)];
    st.marked = !st.marked;
    renderQuestion();
  }
  function goto(qi) { currentQuestion = qi; togglePalette(false); renderQuestion(); }
  function gotoSection(si) { currentSection = si; currentQuestion = 0; renderQuestion(); }
  function prev() {
    if (currentQuestion > 0) currentQuestion--;
    else if (currentSection > 0) { currentSection--; currentQuestion = testData.sections[currentSection].questions.length - 1; }
    renderQuestion();
  }
  function saveNext() {
    const sec = testData.sections[currentSection];
    if (currentQuestion < sec.questions.length - 1) currentQuestion++;
    else if (currentSection < testData.sections.length - 1) { currentSection++; currentQuestion = 0; }
    else { EZ.toast("End of test. Review or submit."); return; }
    renderQuestion();
  }
  function togglePalette(open) {
    document.getElementById("palette-pane").classList.toggle("open", open);
    document.getElementById("palette-backdrop").classList.toggle("open", open);
  }

  /* ---------- Timer ---------- */
  function startTimer() {
    updateTimer();
    timerId = setInterval(() => {
      timeRemaining--;
      updateTimer();
      if (timeRemaining % 15 === 0) saveProgress();
      if (timeRemaining <= 0) { clearInterval(timerId); submit(true); }
    }, 1000);
  }
  function updateTimer() {
    const el = document.getElementById("timer");
    if (!el) return;
    el.textContent = EZ.fmtTime(timeRemaining);
    el.classList.toggle("warn", timeRemaining <= 60);
  }

  function saveProgress() {
    EZ.set(progressKey(), { answers, timeRemaining, currentSection, currentQuestion, lang });
  }

  /* ---------- Submit & score ---------- */
  function confirmSubmit() {
    let unattempted = 0;
    Object.values(answers).forEach(a => { if (!a.selected) unattempted++; });
    if (confirm(`Submit test?\n\n${unattempted} question(s) unattempted. This cannot be undone.`)) submit(false);
  }

  function submit(auto) {
    clearInterval(timerId);
    const marksPer = testData.marksPerQuestion ?? 2;
    const neg = testData.negativeMarking ?? 0;

    const result = {
      correct: 0, incorrect: 0, unattempted: 0, score: 0,
      sections: {}, answers: [],
    };

    testData.sections.forEach((sec, si) => {
      const secRes = { name: sec.sectionName, correct: 0, incorrect: 0, unattempted: 0, score: 0 };
      sec.questions.forEach((q, qi) => {
        const st = answers[key(si, qi)];
        const detail = {
          sectionId: sec.sectionId, qIndex: qi, en: q.en, hi: q.hi,
          options: q.options, correct: q.correct, explanation: q.explanation,
          topic: q.topic, subject: q.subject, selected: st.selected, isCorrect: null,
        };
        if (!st.selected) { result.unattempted++; secRes.unattempted++; }
        else if (st.selected === q.correct) {
          result.correct++; secRes.correct++;
          result.score += marksPer; secRes.score += marksPer; detail.isCorrect = true;
        } else {
          result.incorrect++; secRes.incorrect++;
          result.score -= neg; secRes.score -= neg; detail.isCorrect = false;
        }
        result.answers.push(detail);
      });
      result.sections[sec.sectionId] = secRes;
    });

    const u = EZAuth.currentUser();
    const resultId = "res_" + Date.now().toString(36);
    const record = {
      id: resultId,
      userId: u.uid,
      testId,
      testName: testData.testName,
      examType: testData.examType || "",
      score: Math.round(result.score * 100) / 100,
      maxScore: testData.totalMarks,
      correct: result.correct,
      incorrect: result.incorrect,
      unattempted: result.unattempted,
      timeTaken: testData.duration - timeRemaining,
      submittedAt: new Date().toISOString(),
      sections: result.sections,
      answers: result.answers,
      marksPerQuestion: marksPer,
      negativeMarking: neg,
    };

    // All-India rank among stored attempts for this test (demo logic).
    const all = EZ.get("ez_results", []);
    const others = all.filter(r => r.testId === testId);
    const higher = others.filter(r => r.score > record.score).length;
    record.allIndiaRank = higher + 1;
    record.totalAttempts = others.length + 1;

    all.push(record);
    EZ.set("ez_results", all);
    EZ.del(progressKey());

    location.href = EZ.url("result/index.html?id=") + resultId;
  }

  return {
    init, setLang, select, clearResponse, markReview, goto, gotoSection,
    prev, saveNext, togglePalette, confirmSubmit,
  };
})();

window.addEventListener("DOMContentLoaded", TestEngine.init);
