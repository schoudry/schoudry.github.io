(function () {
  'use strict';

  var TOTAL_QUESTIONS_PER_TEST = 50;
  var PASS_THRESHOLD = 39;
  var CATEGORIES = ['architecture', 'customizations', 'cloud'];
  var CATEGORY_LABEL = {
    architecture: '01 · Architecture',
    customizations: '02 · Customizations',
    cloud: '03 · Commerce Cloud'
  };
  var CATEGORY_CHIP_CLASS = {
    architecture: 'chip-a',
    customizations: 'chip-c',
    cloud: 'chip-cl'
  };
  var CATEGORY_BAR_COLOR = {
    architecture: '#5B8CFF',
    customizations: '#E8B54A',
    cloud: '#34D6C0'
  };

  var STORAGE_USED_KEY = 'acp1063_used_ids_v1';
  var STORAGE_ATTEMPTS_KEY = 'acp1063_attempts_v1';

  var allQuestions = [];
  var byCategory = { architecture: [], customizations: [], cloud: [] };

  var state = {
    set: [],          // the 50 chosen questions (each with shuffled options + correctIndex remapped)
    index: 0,
    answers: [],      // { selectedIndex: number|null, isCorrect: bool|null }
    score: 0,
    startTime: null
  };

  var els = {};

  function qs(id) { return document.getElementById(id); }

  function cacheEls() {
    els.screenLanding = qs('screen-landing');
    els.screenQuiz = qs('screen-quiz');
    els.screenResults = qs('screen-results');
    els.btnTakeTest = qs('btn-take-test');
    els.resumeNote = qs('resume-note');

    els.progressFill = qs('progress-fill');
    els.quizPosition = qs('quiz-position');
    els.quizCategoryTag = qs('quiz-category-tag');
    els.quizScoreLive = qs('quiz-score-live');
    els.quizQuestion = qs('quiz-question');
    els.quizOptions = qs('quiz-options');
    els.quizFeedback = qs('quiz-feedback');
    els.btnPrev = qs('btn-prev');
    els.btnNext = qs('btn-next');

    els.resultsScore = qs('results-score');
    els.resultsBanner = qs('results-banner');
    els.resultsCompleted = qs('results-completed');
    els.resultsDuration = qs('results-duration');
    els.resultsBreakdown = qs('results-breakdown');
    els.poolStatus = qs('pool-status');
    els.btnRetake = qs('btn-retake');
  }

  function showScreen(name) {
    els.screenLanding.classList.add('hidden');
    els.screenQuiz.classList.add('hidden');
    els.screenResults.classList.add('hidden');
    if (name === 'landing') els.screenLanding.classList.remove('hidden');
    if (name === 'quiz') els.screenQuiz.classList.remove('hidden');
    if (name === 'results') els.screenResults.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  // ---------- storage helpers ----------
  function loadUsedIds() {
    try {
      var raw = localStorage.getItem(STORAGE_USED_KEY);
      if (!raw) return { architecture: [], customizations: [], cloud: [] };
      var parsed = JSON.parse(raw);
      CATEGORIES.forEach(function (c) { if (!Array.isArray(parsed[c])) parsed[c] = []; });
      return parsed;
    } catch (e) {
      return { architecture: [], customizations: [], cloud: [] };
    }
  }

  function saveUsedIds(used) {
    try { localStorage.setItem(STORAGE_USED_KEY, JSON.stringify(used)); } catch (e) {}
  }

  function getAttempts() {
    try { return parseInt(localStorage.getItem(STORAGE_ATTEMPTS_KEY) || '0', 10); } catch (e) { return 0; }
  }
  function incAttempts() {
    var n = getAttempts() + 1;
    try { localStorage.setItem(STORAGE_ATTEMPTS_KEY, String(n)); } catch (e) {}
    return n;
  }

  // ---------- utils ----------
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pickN(arr, n) {
    return shuffle(arr).slice(0, n);
  }

  function splitCounts(total, buckets) {
    // e.g. total=50, buckets=3 -> [17,17,16] with the "short" bucket randomized
    var base = Math.floor(total / buckets);
    var remainder = total - base * buckets;
    var counts = [];
    for (var i = 0; i < buckets; i++) counts.push(base);
    var order = shuffle(counts.map(function (_, i) { return i; }));
    for (var r = 0; r < remainder; r++) counts[order[r]] += 1;
    return counts;
  }

  function formatDuration(ms) {
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    return h + ':' + pad(m) + ':' + pad(s);
  }

  // ---------- question set building ----------
  function buildQuestionSet() {
    var used = loadUsedIds();
    var counts = splitCounts(TOTAL_QUESTIONS_PER_TEST, CATEGORIES.length);
    var chosen = [];
    var poolNotesForStatus = [];

    CATEGORIES.forEach(function (cat, idx) {
      var need = counts[idx];
      var pool = byCategory[cat];
      var usedForCat = used[cat] || [];
      var available = pool.filter(function (q) { return usedForCat.indexOf(q.id) === -1; });

      if (available.length < need) {
        // exhausted (or nearly) -- reset this category's used tracking
        used[cat] = [];
        available = pool.slice();
      }

      var picked = pickN(available, need);
      picked.forEach(function (q) { used[cat].push(q.id); });
      chosen = chosen.concat(picked);
    });

    saveUsedIds(used);

    // shuffle overall order so categories interleave randomly
    chosen = shuffle(chosen);

    // shuffle each question's options, remapping the correct index
    chosen = chosen.map(function (q) {
      var optionIndices = shuffle(q.options.map(function (_, i) { return i; }));
      var newOptions = optionIndices.map(function (i) { return q.options[i]; });
      var newCorrect = optionIndices.indexOf(q.correct);
      return {
        id: q.id,
        category: q.category,
        question: q.question,
        options: newOptions,
        correct: newCorrect
      };
    });

    return chosen;
  }

  function remainingPoolText() {
    var used = loadUsedIds();
    var remainingTotal = 0;
    var totalPool = 0;
    CATEGORIES.forEach(function (cat) {
      totalPool += byCategory[cat].length;
      remainingTotal += Math.max(0, byCategory[cat].length - (used[cat] || []).length);
    });
    return remainingTotal + ' of ' + totalPool + ' questions remain unused before the pool repeats.';
  }

  // ---------- quiz flow ----------
  function startTest() {
    state.set = buildQuestionSet();
    state.index = 0;
    state.answers = state.set.map(function () { return { selectedIndex: null, isCorrect: null }; });
    state.score = 0;
    state.startTime = Date.now();
    showScreen('quiz');
    renderQuestion();
  }

  function renderQuestion() {
    var total = state.set.length;
    var i = state.index;
    var q = state.set[i];
    var ans = state.answers[i];

    els.progressFill.style.width = (((i + 1) / total) * 100) + '%';
    els.quizPosition.textContent = 'Q ' + pad2(i + 1) + ' / ' + total;

    els.quizCategoryTag.textContent = CATEGORY_LABEL[q.category];
    els.quizCategoryTag.className = 'chip ' + CATEGORY_CHIP_CLASS[q.category];

    els.quizScoreLive.textContent = 'Score: ' + state.score;

    els.quizQuestion.textContent = q.question;

    els.quizOptions.innerHTML = '';
    q.options.forEach(function (optText, optIdx) {
      var row = document.createElement('div');
      row.className = 'quiz-option';
      row.setAttribute('data-idx', optIdx);

      var radio = document.createElement('span');
      radio.className = 'radio';
      var label = document.createElement('span');
      label.textContent = optText;

      row.appendChild(radio);
      row.appendChild(label);

      if (ans.selectedIndex !== null) {
        row.classList.add('locked');
        if (optIdx === q.correct) row.classList.add('correct-answer');
        if (optIdx === ans.selectedIndex && optIdx !== q.correct) row.classList.add('wrong-answer');
        if (optIdx === ans.selectedIndex) row.classList.add('selected');
      } else {
        row.addEventListener('click', function () { handleAnswer(optIdx); });
      }

      els.quizOptions.appendChild(row);
    });

    if (ans.selectedIndex !== null) {
      renderFeedback(ans.isCorrect);
    } else {
      els.quizFeedback.className = 'quiz-feedback hidden';
      els.quizFeedback.innerHTML = '';
    }

    els.btnPrev.disabled = (i === 0);
    var answered = ans.selectedIndex !== null;
    els.btnNext.disabled = !answered;
    els.btnNext.innerHTML = (i === total - 1)
      ? '<span>See Results</span><span class="btn-arrow">→</span>'
      : '<span>Next</span><span class="btn-arrow">→</span>';
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function handleAnswer(selectedIdx) {
    var i = state.index;
    var q = state.set[i];
    var ans = state.answers[i];
    if (ans.selectedIndex !== null) return; // already answered, locked

    var isCorrect = (selectedIdx === q.correct);
    ans.selectedIndex = selectedIdx;
    ans.isCorrect = isCorrect;
    if (isCorrect) state.score += 1;

    renderQuestion();
  }

  function renderFeedback(isCorrect) {
    els.quizFeedback.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'wrong');
    els.quizFeedback.innerHTML = isCorrect
      ? '&#10003; Correct.'
      : '&#10007; Not quite — the correct answer is highlighted above.';
  }

  function goNext() {
    if (state.index < state.set.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      finishTest();
    }
  }

  function goPrev() {
    if (state.index > 0) {
      state.index -= 1;
      renderQuestion();
    }
  }

  function finishTest() {
    var endTime = Date.now();
    var durationMs = endTime - state.startTime;
    incAttempts();

    var score = state.score;
    var total = state.set.length;

    els.resultsScore.textContent = String(score);

    var passed = score >= PASS_THRESHOLD;
    els.resultsBanner.className = 'results-banner ' + (passed ? 'pass' : 'fail');
    els.resultsBanner.textContent = passed
      ? 'Your practice exam score meets the live exam\u2019s passing threshold. Nice work \u2014 keep reinforcing the domains below the 100% mark.'
      : 'Your practice exam score falls short of the live exam\u2019s passing threshold. Please review the breakdown below before re-attempting the practice test.';

    var completedDate = new Date(endTime);
    els.resultsCompleted.textContent = 'Completed: ' + completedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + completedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    els.resultsDuration.textContent = 'Duration: ' + formatDuration(durationMs);

    renderBreakdown();

    els.poolStatus.textContent = remainingPoolText();

    showScreen('results');
  }

  function renderBreakdown() {
    els.resultsBreakdown.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      var total = 0, correct = 0;
      state.set.forEach(function (q, i) {
        if (q.category === cat) {
          total += 1;
          if (state.answers[i].isCorrect) correct += 1;
        }
      });
      var pct = total > 0 ? Math.round((correct / total) * 100) : 0;

      var row = document.createElement('div');
      row.className = 'breakdown-row';

      var label = document.createElement('span');
      label.className = 'breakdown-label';
      label.textContent = CATEGORY_LABEL[cat].replace(/^\d+\s·\s/, '');

      var track = document.createElement('div');
      track.className = 'breakdown-bar-track';
      var fill = document.createElement('div');
      fill.className = 'breakdown-bar-fill';
      fill.style.width = pct + '%';
      fill.style.background = CATEGORY_BAR_COLOR[cat];
      track.appendChild(fill);

      var pctEl = document.createElement('span');
      pctEl.className = 'breakdown-pct';
      pctEl.textContent = pct + '%';

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(pctEl);
      els.resultsBreakdown.appendChild(row);
    });
  }

  // ---------- init ----------
  function updateResumeNote() {
    var attempts = getAttempts();
    if (attempts > 0) {
      els.resumeNote.classList.remove('hidden');
      els.resumeNote.textContent = '// you\u2019ve completed ' + attempts + ' practice attempt' + (attempts === 1 ? '' : 's') + ' so far · ' + remainingPoolText();
    }
  }

  function wireEvents() {
    els.btnTakeTest.addEventListener('click', startTest);
    els.btnNext.addEventListener('click', goNext);
    els.btnPrev.addEventListener('click', goPrev);
    els.btnRetake.addEventListener('click', startTest);
  }

  function init() {
    cacheEls();
    wireEvents();
    fetch('questions.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        allQuestions = data;
        allQuestions.forEach(function (q) {
          if (byCategory[q.category]) byCategory[q.category].push(q);
        });
        updateResumeNote();
        showScreen('landing');
      })
      .catch(function (err) {
        els.quizQuestion.textContent = 'Could not load questions.json — check that it was uploaded alongside index.html.';
        console.error(err);
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
