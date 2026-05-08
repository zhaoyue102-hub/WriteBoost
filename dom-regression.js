const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseHTML } = require('linkedom');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function extractInlineScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('No inline <script> found in HTML');
  return match[1];
}

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(String(k)),
    clear: () => store.clear(),
    _dump: () => Object.fromEntries(store.entries()),
  };
}

async function run() {
  const htmlPath = path.join(__dirname, 'writeboost.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const { window, document } = parseHTML(html);

  // Minimal browser-ish stubs
  window.localStorage = makeLocalStorage();
  window.confirm = () => false; // keep tests non-interactive
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.scrollY = 0;
  window.innerWidth = 1024;

  // Clipboard may not exist in this environment
  const existingNavigator = window.navigator;
  const patchedNavigator = existingNavigator && typeof existingNavigator === 'object'
    ? existingNavigator
    : {};
  if (!patchedNavigator.clipboard) {
    patchedNavigator.clipboard = { writeText: async () => {} };
  }
  try {
    // linkedom may expose navigator as a read-only getter; patch via defineProperty
    Object.defineProperty(window, 'navigator', {
      value: patchedNavigator,
      configurable: true,
      enumerable: true,
      writable: false,
    });
  } catch {
    // ignore if not patchable; tests that rely on clipboard will still work
  }

  // Export uses Blob + URL.createObjectURL
  window.Blob =
    window.Blob ||
    class Blob {
      constructor(parts, opts) {
        this.parts = parts;
        this.type = opts && opts.type;
      }
    };
  window.URL = window.URL || {};
  window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:mock');
  window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});

  // Anchor click stub
  if (!window.HTMLElement.prototype.click) {
    window.HTMLElement.prototype.click = function click() {
      // no-op
    };
  }

  // Capture runtime errors
  const errors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    errors.push(args.map(String).join(' '));
    originalConsoleError(...args);
  };

  // Run the page script in a VM context backed by linkedom window
  const script = extractInlineScript(html);
  const context = vm.createContext(window);
  vm.runInContext(script, context, { filename: 'writeboost.html', displayErrors: true });

  // Initialize like DOMContentLoaded
  assert(typeof window.init === 'function', 'init() not found');
  window.init();
  if (typeof window.setupAutoSave === 'function') window.setupAutoSave();

  // Dashboard should be present and prompts generated
  const promptGrid = document.getElementById('prompts-grid');
  assert(promptGrid, 'Missing #prompts-grid');
  assert(promptGrid.children.length > 0, 'Prompts not rendered');

  // Select prompt -> practice
  window.selectPrompt(0);
  assert(document.getElementById('practice').classList.contains('active'), 'Practice page not active after selectPrompt');

  // Enter essay text
  const textarea = document.getElementById('essay-input');
  textarea.value =
    'I was happy when I found a small door behind the old tree. "Who are you?" I said. ' +
    'It was cold and quiet, then suddenly the ground shook. I ran, scared, but I stayed brave. ' +
    'Finally, I felt relief as the mystery ended.';
  window.updateWordCount();
  window.analyzeFlatWords();
  window.drawStoryCoaster();

  const wc = Number(document.getElementById('word-count').textContent);
  assert(Number.isFinite(wc) && wc > 0, `Word count not updated (${wc})`);

  // Challenge card insertion
  window.openChallengeModal();
  const beforeChallenge = textarea.value;
  window.addChallengeToStory();
  assert(textarea.value.length > beforeChallenge.length, 'Challenge insertion did not update textarea');
  assert(textarea.value.includes('[') && textarea.value.includes(']') && textarea.value.includes(':'), 'Challenge format not inserted');

  // Power word lookup (modal)
  window.openPowerWordsModal();
  document.getElementById('modal-power-word').value = 'walk';
  window.searchModalPowerWord();
  const results = document.getElementById('modal-power-results').textContent;
  assert(results && results.toLowerCase().includes('level'), 'Power word results not rendered');

  // Submit -> results
  window.submitEssay();
  assert(document.getElementById('results').classList.contains('active'), 'Results page not active after submitEssay');
  const score = document.getElementById('final-score').textContent;
  assert(score && String(score).trim().length > 0, 'Final score not rendered');

  // Export should not throw
  window.exportData();

  // Streak should not grow multiple times for same day if submitted again
  const streakAfter1 = Number(document.getElementById('current-streak').textContent);
  textarea.value += ' Extra words to resubmit and test streak logic.';
  window.submitEssay();
  const streakAfter2 = Number(document.getElementById('current-streak').textContent);
  assert(streakAfter2 === streakAfter1, `Streak changed within same day (${streakAfter1} -> ${streakAfter2})`);

  // Avg score should be a number once essays exist
  const avg = document.getElementById('avg-score').textContent;
  assert(avg !== '--', 'Avg score did not update');

  if (errors.length) {
    throw new Error(`Console errors during regression:\n${errors.join('\n')}`);
  }

  console.log('OK');
}

run().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});

