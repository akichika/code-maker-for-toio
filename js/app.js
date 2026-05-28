/* app.js — Main application orchestration for toio Visual Programming */

let workspace  = null;
let simulator  = null;
let runtime    = null;
let llmClient  = null;
let activeLang = 'javascript';
let _beginnerMode = false;  // STEAM: beginner / advanced mode toggle

// ─── Theme ───────────────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  applyTheme(saved);
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    const themes = ['light', 'dark', 'hc'];
    const cur = localStorage.getItem('theme') || 'light';
    const next = themes[(themes.indexOf(cur) + 1) % themes.length];
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'hc') {
    document.documentElement.setAttribute('data-theme', 'hc');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Update Blockly workspace theme if workspace is already initialised
  if (workspace) {
    try {
      if (theme === 'dark') {
        workspace.setTheme(buildThemeDark());
      } else if (theme === 'hc') {
        workspace.setTheme(buildThemeHC());
      } else {
        workspace.setTheme(buildTheme());
      }
    } catch (e) {
      console.warn('setTheme failed:', e);
    }
  }

  // Update theme toggle button icon / tooltip
  const themeNames = { light: 'ライト', dark: 'ダーク', hc: 'ハイコントラスト' };
  const themeIcons = { light: '☀', dark: '🌙', hc: '◑' };
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.title = `テーマ: ${themeNames[theme] || theme}`;
    const iconEl = btn.querySelector('.theme-icon');
    if (iconEl) iconEl.textContent = themeIcons[theme] || '☀';
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  /** Safe wrapper: run fn(), log any error to console but never crash the chain. */
  const _safe = (name, fn) => {
    try { fn(); }
    catch (e) { console.error(`[init] ${name} failed:`, e); }
  };

  _safe('initTheme',          () => initTheme());
  _safe('applyI18n',          () => applyI18n());
  _safe('initBlocks',         () => initBlocks());         // must run after i18n, before Blockly.inject
  _safe('initGenerators',     () => initGenerators());
  _safe('initBlockly',        () => initBlockly());
  _safe('applyTheme',         () => applyTheme(localStorage.getItem('theme') || 'light'));
  _safe('initSimulator',      () => initSimulator());
  _safe('initMatSelector',    () => initMatSelector());
  _safe('initRuntime',        () => initRuntime());
  _safe('initLLM',            () => initLLM());
  _safe('initUI',             () => initUI());
  _safe('initDividers',       () => initDividers());
  _safe('initFloating',       () => initFloating());
  _safe('initFullscreen',     () => initFullscreen());
  _safe('initWsCodeTab',      () => initWsCodeTab());
  _safe('initSamples',        () => initSamples());
  _safe('initUndoRedo',       () => initUndoRedo());
  _safe('initBeginnerMode',   () => initBeginnerMode());
  _safe('initVarMonitor',     () => initVarMonitor());
  _safe('initBlocklyDialog',  () => initBlocklyDialog());
  _safe('initLLMApiCollapse', () => initLLMApiCollapse());
  _safe('initTrashcanScale',  () => initTrashcanScale());
  _safe('initCodeEdit',       () => initCodeEdit());
  _safe('initBlockContextMenu',() => initBlockContextMenu());
  _safe('initCardScanner',    () => initCardScanner());

  // Register workspace-save hook so language-switch reload doesn't lose work
  window._onBeforeLangReload = () => {
    try {
      if (workspace) {
        const xml = Blockly.Xml.workspaceToDom(workspace);
        sessionStorage.setItem('_ws_lang_reload', Blockly.Xml.domToText(xml));
      }
      if (_codeOverride) sessionStorage.setItem('_code_override_reload', _codeOverride);
      else               sessionStorage.removeItem('_code_override_reload');
    } catch(e) {}
  };
  log(t('ui.ready'),  'info');
  log(t('ui.simMode'), 'info');
  // Auto-register any hat-block handlers from the initial workspace
  setTimeout(_autoRegisterHandlers, 800);
});

// ─── i18n ─────────────────────────────────────────────────────────────────────

/** Apply t() to all [data-i18n] elements and set language selector */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (el.tagName === 'OPTION') el.textContent = val;
    else el.textContent = val;
  });

  // Set language selector to current lang
  const sel = document.getElementById('lang-select');
  if (sel) {
    sel.value = currentLang();
    sel.addEventListener('change', e => setLang(e.target.value));
  }

  // Placeholder
  const llmInput = document.getElementById('llm-input');
  if (llmInput) llmInput.placeholder = t('llm.placeholder');

  const llmKey = document.getElementById('llm-api-key');
  if (llmKey) llmKey.placeholder = 'API Key';

  // LLM greeting
  const greet = document.getElementById('llm-greeting');
  if (greet) greet.innerHTML = t('llm.greeting').replace(/\n/g, '<br>');

  // Code output placeholder
  const code = document.getElementById('code-output');
  if (code && !code.textContent.trim()) code.textContent = '';

  // Titles for icon buttons
  const btnReset = document.getElementById('btn-reset-sim');
  if (btnReset) btnReset.title = t('ui.reset');
  const btnBtn = document.getElementById('btn-sim-button');
  if (btnBtn) btnBtn.title = t('ui.pressButton');
  const btnFS = document.getElementById('btn-fullscreen-sim');
  if (btnFS) btnFS.title = t('ui.fullscreen');
  const btnFloatSim = document.getElementById('btn-float-sim');
  if (btnFloatSim) btnFloatSim.title = t('ui.float');
  const btnFloatBot = document.getElementById('btn-float-bottom');
  if (btnFloatBot) btnFloatBot.title = t('ui.float');

  // New UI elements
  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) btnUndo.title = t('ui.undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnRedo) btnRedo.title = t('ui.redo');
  const btnNew = document.getElementById('btn-new-program');
  if (btnNew) btnNew.title = t('ui.newProgram');
  const btnLevel = document.getElementById('btn-level-toggle');
  if (btnLevel) btnLevel.title = _beginnerMode ? t('ui.levelAdv') : t('ui.levelEasy');
  const blockBadge = document.getElementById('block-count');
  if (blockBadge) blockBadge.title = t('ui.blockCount');
  const sampleSel = document.getElementById('sample-select');
  if (sampleSel) sampleSel.title = t('ui.samples');
}

// ─── Generators ──────────────────────────────────────────────────────────────

function initGenerators() {
  initJSGenerators();
  if (typeof initPythonGenerators === 'function') initPythonGenerators();

  // ── Patch JavaScript scrub_ to inject block comments as inline // comments ──
  // We suppress getCommentText during the original call so Blockly doesn't output
  // the same comment a second time (which caused double display).
  const G = Blockly.JavaScript;
  const _origScrub = G.scrub_.bind(G);
  G.scrub_ = function(block, code, thisOnly) {
    const comment = block.getCommentText ? block.getCommentText() : null;
    if (comment && comment.trim()) {
      const pos = block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : { x: 0, y: 0 };
      const prefix = comment.trim().split('\n')
        .map(l => `// ${l}`)
        .join('\n') + `  // @(${Math.round(pos.x)},${Math.round(pos.y)})\n`;
      // Temporarily return null from getCommentText so _origScrub won't add a second copy
      const _savedGCT = block.getCommentText;
      block.getCommentText = () => null;
      const result = prefix + _origScrub(block, code, thisOnly);
      block.getCommentText = _savedGCT;
      return result;
    }
    return _origScrub(block, code, thisOnly);
  };

  // ── Patch Python scrub_ similarly ──
  if (typeof Blockly.Python !== 'undefined' && Blockly.Python.scrub_) {
    const _origPyScrub = Blockly.Python.scrub_.bind(Blockly.Python);
    Blockly.Python.scrub_ = function(block, code, thisOnly) {
      const comment = block.getCommentText ? block.getCommentText() : null;
      if (comment && comment.trim()) {
        const pos = block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : { x: 0, y: 0 };
        const prefix = comment.trim().split('\n')
          .map(l => `# ${l}`)
          .join('\n') + `  # @(${Math.round(pos.x)},${Math.round(pos.y)})\n`;
        const _savedGCT = block.getCommentText;
        block.getCommentText = () => null;
        const result = prefix + _origPyScrub(block, code, thisOnly);
        block.getCommentText = _savedGCT;
        return result;
      }
      return _origPyScrub(block, code, thisOnly);
    };
  }

  // Override variables_set to track runtime values for variable monitor
  const _origSet = G.forBlock ? G.forBlock['variables_set'] : G['variables_set'];
  const patchedSet = function(block, generator) {
    const gen = generator || G;
    const varId = block.getFieldValue('VAR');
    const varName = gen.getVariableName
      ? gen.getVariableName(varId)
      : (gen.nameDB_ ? gen.nameDB_.getName(varId, Blockly.VARIABLE_CATEGORY_NAME) : varId);
    // Use the original Blockly variable name (not the JS-encoded name) as the _toioVars key
    const ws = Blockly.getMainWorkspace ? Blockly.getMainWorkspace() : workspace;
    const originalName = ws?.getVariableById?.(varId)?.name ?? varName;
    const value = gen.valueToCode(block, 'VALUE', gen.ORDER_ASSIGNMENT || 1) || '0';
    return `${varName} = ${value};\nif(window._toioVars!==undefined)window._toioVars[${JSON.stringify(originalName)}]=${varName};\n`;
  };
  if (G.forBlock) { G.forBlock['variables_set'] = patchedSet; }
  else { G['variables_set'] = patchedSet; }
}

// ─── Blockly ─────────────────────────────────────────────────────────────────

function initBlockly() {
  workspace = Blockly.inject('blockly-div', {
    toolbox:  buildToolbox(),
    theme:    buildTheme(),
    renderer: 'zelos',   // flat block design
    grid:     { spacing: 20, length: 3, colour: '#E0E3EA', snap: true },
    zoom:     { controls: true, wheel: true, startScale: 1.0 },
    trashcan: true,
    scrollbars: true,
  });

  // Register dynamic category callbacks — custom VARIABLE callback with pre-filled examples
  workspace.registerToolboxCategoryCallback('VARIABLE', (ws) => {
    const xmlList = Blockly.Variables.flyoutCategory(ws);
    if (ws.getAllVariables().length > 0) {
      const v = ws.getAllVariables()[0];
      // Separator
      const sep = Blockly.utils.xml.createElement('sep');
      sep.setAttribute('gap', '8');
      xmlList.push(sep);
      // Pre-filled set block with value 0
      const setBlock = Blockly.utils.xml.createElement('block');
      setBlock.setAttribute('type', 'variables_set');
      const fieldVar = Blockly.utils.xml.createElement('field');
      fieldVar.setAttribute('name', 'VAR');
      fieldVar.textContent = v.name;
      const val = Blockly.utils.xml.createElement('value');
      val.setAttribute('name', 'VALUE');
      const numBlock = Blockly.utils.xml.createElement('block');
      numBlock.setAttribute('type', 'math_number');
      const numField = Blockly.utils.xml.createElement('field');
      numField.setAttribute('name', 'NUM');
      numField.textContent = '0';
      numBlock.appendChild(numField);
      val.appendChild(numBlock);
      setBlock.appendChild(fieldVar);
      setBlock.appendChild(val);
      xmlList.push(setBlock);
    }
    return xmlList;
  });

  workspace.addChangeListener(() => {
    updateCodePanel();
    updateBlockCount();
    _scheduleAutoRegister();
  });
  loadDefaultProgram();
}

// ─── Simulator ───────────────────────────────────────────────────────────────

function initSimulator() {
  const canvas2d = document.getElementById('sim-canvas-2d');
  const div3d    = document.getElementById('sim-canvas-3d');

  simulator = new ToioSimulator();
  simulator.init(canvas2d, div3d);
  simulator.onStatus(cubes => {
    const strip = document.getElementById('sim-status');
    if (strip) simulator.buildStatusChips(strip);
  });
  // Set initial 2D trail button state (starts in 2D mode with trail ON)
  const trailBtn2d = document.getElementById('btn-2d-trail');
  if (trailBtn2d) trailBtn2d.classList.add('active');
}

// ─── Mat selector ────────────────────────────────────────────────────────────

function initMatSelector() {
  const sel = document.getElementById('mat-select');
  if (!sel) return;

  populateMatSelector(sel);

  sel.addEventListener('change', e => {
    const val = e.target.value;
    if (val === '__new__') {
      sel.value = simulator ? simulator._matType : 'simple';
      openCustomMatDialog(null);
    } else {
      simulator.setMatType(val);
    }
  });
}

function populateMatSelector(sel) {
  const current = sel ? sel.value : 'simple';
  if (!sel) return;
  sel.innerHTML = '';

  // Built-in mats
  const addOpt = (value, label) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    sel.appendChild(o);
  };

  addOpt('simple',   t('ui.matSimple'));
  addOpt('original', t('ui.matOriginal'));

  // Custom mats
  const customs = loadCustomMats();
  if (customs.length > 0) {
    const sep = document.createElement('option');
    sep.disabled = true; sep.textContent = '──────';
    sel.appendChild(sep);
    customs.forEach(m => addOpt(m.id, m.name));
  }

  // "New custom mat" entry
  const sep2 = document.createElement('option');
  sep2.disabled = true; sep2.textContent = '──────';
  sel.appendChild(sep2);
  addOpt('__new__', t('ui.matCustomNew'));

  // Restore selection
  if (current && [...sel.options].some(o => o.value === current)) {
    sel.value = current;
  }
}

// ─── Custom mat dialog ────────────────────────────────────────────────────────

function openCustomMatDialog(existingMat) {
  const overlay = document.createElement('div');
  overlay.className = 'mat-dialog-overlay';

  const dlg = document.createElement('div');
  dlg.className = 'mat-dialog';

  const isEdit = !!existingMat;
  const mat = existingMat || { id: 'custom_' + Date.now(), name: '', xMin: 45, yMin: 45, xMax: 455, yMax: 455 };

  dlg.innerHTML = `
    <h3>${t('ui.matTitle')}</h3>
    <div class="mat-dialog-grid">
      <label class="full">${t('ui.matName')}
        <input id="md-name" type="text" value="${escapeHtml(mat.name)}" placeholder="${t('ui.matName')}">
      </label>
      <label>${t('ui.matULX')} <input id="md-xmin" type="number" value="${mat.xMin}"></label>
      <label>${t('ui.matULY')} <input id="md-ymin" type="number" value="${mat.yMin}"></label>
      <label>${t('ui.matLRX')} <input id="md-xmax" type="number" value="${mat.xMax}"></label>
      <label>${t('ui.matLRY')} <input id="md-ymax" type="number" value="${mat.yMax}"></label>
    </div>
    <div class="mat-dialog-actions">
      ${isEdit ? `<button class="btn-del">${t('ui.matDelete')}</button>` : ''}
      <button class="btn btn-ghost btn-sm" id="md-cancel">${t('ui.matCancel')}</button>
      <button class="btn btn-primary btn-sm" id="md-save">${t('ui.matSave')}</button>
    </div>
  `;

  overlay.appendChild(dlg);
  document.body.appendChild(overlay);
  dlg.querySelector('#md-name').focus();

  // Cancel
  dlg.querySelector('#md-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Save
  dlg.querySelector('#md-save').addEventListener('click', () => {
    const name = dlg.querySelector('#md-name').value.trim();
    const xMin = parseInt(dlg.querySelector('#md-xmin').value) || 45;
    const yMin = parseInt(dlg.querySelector('#md-ymin').value) || 45;
    const xMax = parseInt(dlg.querySelector('#md-xmax').value) || 455;
    const yMax = parseInt(dlg.querySelector('#md-ymax').value) || 455;

    if (!name) { dlg.querySelector('#md-name').focus(); return; }

    const mats = loadCustomMats().filter(m => m.id !== mat.id);
    mats.push({ id: mat.id, name, xMin, yMin, xMax, yMax });
    saveCustomMats(mats);

    const sel = document.getElementById('mat-select');
    populateMatSelector(sel);
    sel.value = mat.id;
    simulator.setMatType(mat.id);

    overlay.remove();
  });

  // Delete
  const delBtn = dlg.querySelector('.btn-del');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      const mats = loadCustomMats().filter(m => m.id !== mat.id);
      saveCustomMats(mats);
      const sel = document.getElementById('mat-select');
      populateMatSelector(sel);
      sel.value = 'simple';
      simulator.setMatType('simple');
      overlay.remove();
    });
  }
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Fullscreen ───────────────────────────────────────────────────────────────

function initFullscreen() {
  const btn = document.getElementById('btn-fullscreen-sim');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const el = document.getElementById('sim-panel');
    if (!document.fullscreenElement) {
      el.requestFullscreen && el.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('btn-fullscreen-sim');
    if (!btn) return;
    const title = document.fullscreenElement ? t('ui.exitFullscreen') : t('ui.fullscreen');
    btn.title = title;
    if (simulator) simulator.resize();
  });
}

// ─── HTML Download ────────────────────────────────────────────────────────────

function initDownloadHTML() {
  // Old bottom panel button (may no longer exist, but harmless)
  const btn = document.getElementById('btn-download-html');
  if (btn) btn.addEventListener('click', downloadStandaloneHTML);
}

async function downloadStandaloneHTML() {
  const jsCode = Blockly.JavaScript.workspaceToCode(workspace);

  if (!jsCode || !jsCode.trim()) {
    log(t('rt.noDevice'), 'error');
    return;
  }

  // Fetch embedded JS sources (toio.js + runtime.js + simulator.js)
  const [toioSrc, runtimeSrc, simSrc] = await Promise.all([
    fetch('js/toio.js').then(r => r.text()).catch(() => ''),
    fetch('js/runtime.js').then(r => r.text()).catch(() => ''),
    fetch('js/simulator.js').then(r => r.text()).catch(() => ''),
  ]);

  const html = generateStandaloneHTML(jsCode, toioSrc, runtimeSrc, simSrc);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `toio-program-${Date.now()}.html`;
  a.click();
  log(t('ui.downloadHtml') + ' — OK', 'info');
}

function generateStandaloneHTML(jsCode, toioSrc, runtimeSrc, simSrc) {
  const lang = currentLang();
  // Escape </script> inside embedded sources to prevent early tag close
  const escapedCode = JSON.stringify(jsCode).replace(/<\//g, '<\\/');
  const safeToio    = toioSrc.replace(/<\/script>/gi,  '<\\/script>');
  const safeRuntime = runtimeSrc.replace(/<\/script>/gi, '<\\/script>');
  const safeSim     = simSrc.replace(/<\/script>/gi,   '<\\/script>');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>toio Program</title>
<!-- Three.js for 3D simulator mode -->
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"><\/script>
<style>
:root{--primary:#0078FF;--bg:#F0F2F7;--surface:#fff;--border:#D8DCE8;--text:#1A1A2E;--text-muted:#6B7280;--text-light:#9CA3AF;--sh-xs:0 1px 3px rgba(0,0,0,.08)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,'Hiragino Sans',sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column;overflow:hidden}

/* ── Header ─────────────────────────────────────────────────────────────── */
#hd{height:50px;background:#fff;border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 14px;gap:8px;box-shadow:0 1px 4px rgba(0,0,0,.06);flex-shrink:0;z-index:10}
.logo{font-weight:800;font-size:.9rem;display:flex;align-items:center;gap:7px;color:var(--text);letter-spacing:-.01em}
.logo-icon{width:26px;height:26px;border-radius:7px;background:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-icon svg{width:16px;height:16px}
#hd-badges{display:flex;gap:5px;align-items:center;flex-wrap:wrap;flex:1;overflow:hidden;margin:0 6px}
#hd-controls{display:flex;gap:5px;align-items:center;flex-shrink:0}
.btn{display:inline-flex;align-items:center;gap:4px;padding:5px 13px;border:none;border-radius:5px;font-size:.75rem;font-weight:700;cursor:pointer;transition:background .12s,opacity .12s;white-space:nowrap}
.btn:disabled{opacity:.38;cursor:not-allowed}
.btn-primary{background:var(--primary);color:#fff}.btn-primary:hover:not(:disabled){background:#005FC8}
.btn-run{background:#16A85F;color:#fff}.btn-run:hover:not(:disabled){background:#0E8A4D}
.btn-stop{background:#DC3545;color:#fff}.btn-stop:hover:not(:disabled){background:#B82B38}
.btn-ghost{background:transparent;color:var(--text-muted);border:1px solid var(--border)}.btn-ghost:hover{background:var(--bg);color:var(--text)}
select.lang-sel{padding:4px 7px;border:1px solid var(--border);border-radius:5px;font-size:.72rem;font-weight:600;background:#fff;cursor:pointer;color:var(--text)}

/* ── Main layout ─────────────────────────────────────────────────────────── */
#main{flex:1;display:flex;overflow:hidden;min-height:0}

/* ── Simulator panel ─────────────────────────────────────────────────────── */
#sim-panel{flex:1;display:flex;flex-direction:column;background:var(--bg);overflow:hidden;min-width:0}
#sim-panel:fullscreen{width:100vw;height:100vh}
#sim-panel:fullscreen #sim-inner{flex:1}

/* Sim toolbar */
.sim-toolbar{height:36px;background:#fff;border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 8px;gap:6px;flex-shrink:0;overflow-x:auto}
.btn-seg{display:flex;background:#F0F2F7;border:1px solid var(--border);border-radius:20px;padding:2px;gap:1px;flex-shrink:0}
.seg-opt{padding:2px 10px;border:none;background:transparent;border-radius:18px;font-size:.69rem;font-weight:700;color:var(--text-muted);cursor:pointer;transition:all .15s}
.seg-opt.active{background:#fff;color:var(--primary);box-shadow:var(--sh-xs)}
select#mat-select{padding:2px 6px;border:1px solid var(--border);border-radius:5px;font-size:.72rem;font-weight:600;background:#fff;cursor:pointer;color:var(--text);max-width:150px}
.cube-count-wrap{display:flex;align-items:center;gap:3px;color:var(--text-muted);font-size:.72rem}
.cube-count-wrap input{width:38px;padding:2px 5px;border:1px solid var(--border);border-radius:4px;font-size:.72rem;text-align:center}
.btn-flat{padding:4px 7px;border:none;background:transparent;color:var(--text-muted);font-size:.72rem;cursor:pointer;border-radius:5px;transition:all .15s;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.btn-flat:hover{background:#EEF2FF;color:var(--primary)}
.btn-flat.active{background:var(--primary);color:#fff}

/* Sim inner canvas area */
#sim-inner{flex:1;position:relative;overflow:hidden;min-height:0}
#sim-canvas-2d{position:absolute;inset:0;width:100%;height:100%;display:block}
#sim-canvas-3d{position:absolute;inset:0;width:100%;height:100%;display:none}

/* Sim status strip */
#sim-status{background:#fff;border-top:1px solid var(--border);display:flex;align-items:center;padding:4px 8px;gap:4px;flex-wrap:wrap;min-height:32px;flex-shrink:0;font-size:.68rem}
.cube-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;border:1px solid var(--chip-color,var(--border));font-size:.68rem;font-weight:600;color:var(--chip-color,var(--text-muted));background:color-mix(in srgb,var(--chip-color,transparent) 8%,white);white-space:nowrap}
.chip-num{font-weight:800}
.led-dot{width:6px;height:6px;border-radius:50%;background:var(--chip-led,#CCC);flex-shrink:0}
.led-dot.off{background:#DDD}

/* 3D toolbar (created by simulator.js, positioned inside #sim-canvas-3d) */
#sim3d-toolbar{position:absolute;left:6px;top:6px;display:flex;flex-direction:column;gap:4px;z-index:20;pointer-events:auto}
.sim3d-toolbar-row{display:flex;gap:3px}
.sim3d-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(26,28,42,.82);border:1px solid rgba(255,255,255,.22);border-radius:5px;color:rgba(255,255,255,.75);font-size:.7rem;font-weight:600;cursor:pointer;transition:all .15s;backdrop-filter:blur(6px);font-family:inherit}
.sim3d-btn:hover{background:rgba(50,50,80,.88);border-color:rgba(255,255,255,.45);color:#fff}
.sim3d-btn.active,.sim3d-btn-trail.active{background:var(--primary);border-color:var(--primary);color:#fff}
.sim3d-btn-trail.partial{background:rgba(0,120,255,.28);border-color:rgba(0,120,255,.5);color:rgba(255,255,255,.8)}
.sim3d-hint{font-size:.6rem;color:rgba(255,255,255,.55);background:rgba(0,0,0,.38);padding:3px 7px;border-radius:4px;margin-top:2px;pointer-events:none}
.sim3d-rot-handles{position:absolute;bottom:44px;right:8px;z-index:20;padding:6px;background:rgba(26,28,42,.82);border:1px solid rgba(255,255,255,.15);border-radius:7px;backdrop-filter:blur(4px);user-select:none}
.sim3d-rot-collapse{font-size:.55rem;color:rgba(255,255,255,.5);background:none;border:none;cursor:pointer;line-height:1;padding:0 4px;width:100%;text-align:center}
.sim3d-rot-collapse:hover{color:rgba(255,255,255,.9)}
.sim3d-rot-body{display:grid;grid-template-columns:26px 1fr 26px;grid-template-rows:1fr;gap:2px;align-items:center}
.sim3d-rot-col{display:flex;flex-direction:column;align-items:center;gap:2px}
.sim3d-rot-btn{width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:4px;color:#fff;font-size:11px;cursor:pointer;transition:background .1s}
.sim3d-rot-btn:hover{background:rgba(255,255,255,.25)}
.sim3d-rot-btn:active{background:rgba(255,255,255,.38)}
.sim3d-rot-center{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);border-radius:50%;color:#fff;cursor:grab;transition:background .1s}
.sim3d-rot-center:hover{background:rgba(255,255,255,.24)}
.sim3d-rpy{position:absolute;bottom:44px;left:8px;z-index:20;padding:7px 9px;background:rgba(26,28,42,.82);border:1px solid rgba(255,255,255,.15);border-radius:7px;color:#fff;font-family:inherit;font-size:.65rem;min-width:112px;user-select:none;backdrop-filter:blur(4px)}
.sim3d-rpy-hdr{display:flex;align-items:center;justify-content:space-between;gap:4px;padding-bottom:3px;border-bottom:1px solid rgba(255,255,255,.15)}
.sim3d-rpy-title{font-size:.65rem;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:.06em}
.sim3d-rpy-toggle{font-size:.6rem;color:rgba(255,255,255,.55);background:none;border:none;cursor:pointer;padding:0 2px;line-height:1}
.sim3d-rpy-toggle:hover{color:#fff}
.sim3d-rpy-body{display:flex;flex-direction:column;gap:3px}
.sim3d-rpy-section-lbl{font-size:.55rem;font-weight:600;color:rgba(255,255,255,.45);letter-spacing:.05em;text-transform:uppercase}
.sim3d-rpy-sel{font-size:.65rem;padding:1px 2px;background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:3px;flex:1;min-width:0;max-width:70px;cursor:pointer}
.sim3d-rpy-sel option{background:#1a1c2a;color:#fff}
.sim3d-rpy-axes{display:flex;flex-direction:column;gap:3px}
.sim3d-rpy-row{display:flex;align-items:center;gap:3px}
.sim3d-rpy-lbl{font-size:.6rem;color:rgba(255,255,255,.6);width:28px;flex-shrink:0}
.sim3d-rpy-btn{width:26px;height:22px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.18);border-radius:4px;color:#fff;cursor:pointer;font-size:.7rem;transition:background .1s;flex:1}
.sim3d-rpy-btn:hover{background:rgba(255,255,255,.26)}
.sim3d-rpy-btn:active{background:rgba(255,255,255,.40)}
.sim3d-rpy-move-grid{display:grid;grid-template-columns:repeat(4,26px);grid-template-rows:repeat(2,22px);gap:2px;justify-content:center}
.sim3d-rpy-move-grid>span{display:flex;align-items:center;justify-content:center}
.sim3d-rpy-reset{font-size:.6rem;color:rgba(255,255,255,.55);cursor:pointer;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:4px;padding:2px 0;text-align:center;margin-top:1px;transition:background .1s}
.sim3d-rpy-reset:hover{background:rgba(255,255,255,.18);color:#fff}
.sim3d-selected-badge{position:absolute;left:6px;bottom:6px;font-size:.6rem;background:rgba(26,28,42,.82);border:1px solid rgba(255,255,255,.15);border-radius:5px;padding:2px 8px;color:rgba(255,255,255,.75);pointer-events:none}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
#sidebar{width:320px;flex-shrink:0;display:flex;flex-direction:column;background:#1B1D2C;color:#C9CDD8;border-left:1px solid rgba(255,255,255,.06);transition:width .2s,opacity .2s;overflow:hidden}
#sidebar.collapsed{width:0;opacity:0;pointer-events:none}
#tab-bar{display:flex;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0;align-items:center}
.tab-btn{flex:1;padding:8px 4px;background:transparent;border:none;color:#7A8090;font-size:.73rem;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;transition:color .12s,border-color .12s;white-space:nowrap}
.tab-btn.active{color:#fff;border-bottom-color:var(--primary)}
.tab-btn:hover:not(.active){color:#aaa}
.tab-pane{flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column}
.tab-pane.hidden{display:none!important}

/* Console */
#console-pane{overflow-y:auto;padding:0}
.cl{padding:2px 6px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:.71rem;line-height:1.7;border-bottom:1px solid rgba(255,255,255,.03);white-space:pre-wrap;word-break:break-word}
.cl.start{color:#79C0FF}.cl.done{color:#56D364}.cl.stopped{color:#F78166}.cl.error{color:#FF7B72}.cl.info{color:#8B949E}.cl.log{color:#CDD6F4}

/* Code pane — horizontal scroll without word-break artifacts */
#code-pane{overflow:hidden}
.code-scroll{flex:1;overflow:auto}
#code-view{margin:0;padding:10px 14px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:.69rem;line-height:1.72;color:#ABB2BF;white-space:pre;background:transparent;border:none;outline:none;display:block;min-width:max-content}

/* Connection badge */
.conn-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:#162E1B;border:1px solid #1A6B3A;border-radius:20px;font-size:.71rem;font-weight:600;color:#56D364}
.conn-dot{width:6px;height:6px;border-radius:50%;background:#56D364;flex-shrink:0}

/* Sidebar toggle (in header) */
#btn-sidebar-toggle{padding:5px 8px;font-size:.8rem;line-height:1;min-width:28px}

/* Chip buttons inside status chips (from simulator.js buildStatusChips) */
.chip-btn-press{font-family:inherit}
.trail-btn{font-family:inherit}
</style>
</head>
<body>
<div id="hd">
  <div class="logo">
    <div class="logo-icon">
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="white" stroke-width="1.5"/>
        <circle cx="8" cy="8" r="3.5" fill="white"/>
      </svg>
    </div>
    toio VP
  </div>
  <div id="hd-badges"></div>
  <div id="hd-controls">
    <button class="btn btn-primary" id="btn-connect">+ Connect</button>
    <button class="btn btn-run"     id="btn-run">&#9654; Run</button>
    <button class="btn btn-stop"    id="btn-stop" disabled>&#9632; Stop</button>
    <button class="btn btn-ghost"   id="btn-sidebar-toggle" title="コード/コンソールを表示・非表示">&#8921;</button>
    <select class="lang-sel" id="lang-sel">
      <option value="ja">日本語</option>
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  </div>
</div>

<div id="main">
  <!-- ── Simulator panel ───────────────────────────────────────────────── -->
  <div id="sim-panel">
    <div class="sim-toolbar">
      <!-- 2D / 3D toggle -->
      <div class="btn-seg" id="seg-view">
        <button class="seg-opt active" data-view="2d">2D</button>
        <button class="seg-opt"        data-view="3d">3D</button>
      </div>
      <!-- Mat selector (populated by JS) -->
      <select id="mat-select"></select>
      <!-- Cube count -->
      <div class="cube-count-wrap">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm2-1a1 1 0 0 0-1 1v1h14V4a1 1 0 0 0-1-1H2zm13 4H1v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7z"/></svg>
        <input type="number" id="sim-cube-count" min="1" max="4" value="1">
      </div>
      <!-- Trail / Reset / Button / Fullscreen -->
      <button class="btn-flat" id="btn-2d-trail" title="軌跡 ON/OFF">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 20 C6 14 10 16 13 11 S18 5 21 4"/></svg>
      </button>
      <button class="btn-flat" id="btn-reset-sim" title="リセット">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/></svg>
      </button>
      <button class="btn-flat" id="btn-sim-button" title="ボタンを押す">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="8" cy="8" r="3"/></svg>
      </button>
      <button class="btn-flat" id="btn-fullscreen-sim" title="フルスクリーン">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1h4a.5.5 0 0 1 0 1H2v3.5a.5.5 0 0 1-1 0V1.5A.5.5 0 0 1 1.5 1zm9 0h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V2h-3.5a.5.5 0 0 1 0-1zM1 10.5a.5.5 0 0 1 .5-.5h.5v3.5h3.5a.5.5 0 0 1 0 1H1.5a.5.5 0 0 1-.5-.5v-4zm14 0v4a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1 0-1H14V10.5a.5.5 0 0 1 1 0z"/></svg>
      </button>
    </div>
    <!-- Canvas area -->
    <div id="sim-inner">
      <canvas id="sim-canvas-2d"></canvas>
      <div id="sim-canvas-3d"></div>
    </div>
    <!-- Status strip (built by simulator.js buildStatusChips) -->
    <div id="sim-status"></div>
  </div>

  <!-- ── Sidebar: console + code ──────────────────────────────────────── -->
  <div id="sidebar">
    <div id="tab-bar">
      <button class="tab-btn active" data-tab="console" id="tab-console-btn">Console</button>
      <button class="tab-btn"        data-tab="code"    id="tab-code-btn">Code</button>
    </div>
    <div class="tab-pane" id="console-pane"></div>
    <div class="tab-pane hidden" id="code-pane">
      <div class="code-scroll">
        <pre id="code-view"></pre>
      </div>
    </div>
  </div>
</div>

<script>
// ── i18n ──────────────────────────────────────────────────────────────────────
const I18N = {
  ja: {
    connect:'+ キューブ接続', run:'&#9654; 実行', stop:'&#9632; 停止',
    tabConsole:'コンソール', tabCode:'コード', togglePanel:'パネル',
    noBlue:'Bluetoothがサポートされていません。',
    connected:' が接続されました', connecting:' に接続中...',
    start:'▶ プログラムを開始します...', done:'✓ プログラムが完了しました。',
    stopped:'■ プログラムを停止しました。', error:'✗ エラー: ',
    pageTitle:'toio プログラム',
    // Simulator keys (used by simulator.js via window.t)
    'ui.matSimple':'簡易プレイマット (A3)',
    'ui.matOriginal':'トイコレマット(表)',
    'ui.cubeStatus':'キューブ状態',
    'ui.pressButtonSingle':'このキューブのボタンを押す',
    'ui.cube1':'キューブ1','ui.cube2':'キューブ2',
    'ui.cube3':'キューブ3','ui.cube4':'キューブ4',
    'ui.cubeAll':'すべて',
    'sim3d.orbit':'視点','sim3d.grab':'移動','sim3d.trail':'軌跡',
    'sim3d.hintOrbit':'ドラッグ: 視点回転  Shift+ドラッグ: パン  スクロール: ズーム',
    'sim3d.hintGrab':'L-ドラッグ: 移動  R-ドラッグ: 回転  Shift+R-ドラッグ: 傾き  スクロール: 持ち上げ  ダブルクリック: 落下'
  },
  en: {
    connect:'+ Connect Cube', run:'&#9654; Run', stop:'&#9632; Stop',
    tabConsole:'Console', tabCode:'Code', togglePanel:'Panel',
    noBlue:'Bluetooth is not supported on this browser.',
    connected:' connected', connecting:' connecting...',
    start:'▶ Program started...', done:'✓ Program completed.',
    stopped:'■ Program stopped.', error:'✗ Error: ',
    pageTitle:'toio Program',
    'ui.matSimple':'Simple Play Mat (A3)',
    'ui.matOriginal':'Toio Collection Mat',
    'ui.cubeStatus':'Cube Status',
    'ui.pressButtonSingle':"Press this cube's button",
    'ui.cube1':'Cube 1','ui.cube2':'Cube 2',
    'ui.cube3':'Cube 3','ui.cube4':'Cube 4',
    'ui.cubeAll':'All',
    'sim3d.orbit':'Orbit','sim3d.grab':'Grab','sim3d.trail':'Trail',
    'sim3d.hintOrbit':'Drag: rotate view  Shift+drag: pan  Scroll: zoom',
    'sim3d.hintGrab':'L-drag: move  R-drag: rotate  Shift+R-drag: tilt  Scroll: lift  Dbl-click: drop'
  },
  zh: {
    connect:'+ 连接方块', run:'&#9654; 运行', stop:'&#9632; 停止',
    tabConsole:'控制台', tabCode:'代码', togglePanel:'面板',
    noBlue:'此浏览器不支持蓝牙。',
    connected:' 已连接', connecting:' 连接中...',
    start:'▶ 程序开始运行...', done:'✓ 程序执行完毕。',
    stopped:'■ 程序已停止。', error:'✗ 错误: ',
    pageTitle:'toio 程序',
    'ui.matSimple':'简易游戏垫 (A3)',
    'ui.matOriginal':'原版游戏垫',
    'ui.cubeStatus':'方块状态',
    'ui.pressButtonSingle':'按下此方块按钮',
    'ui.cube1':'方块 1','ui.cube2':'方块 2',
    'ui.cube3':'方块 3','ui.cube4':'方块 4',
    'ui.cubeAll':'全部',
    'sim3d.orbit':'视角','sim3d.grab':'移动','sim3d.trail':'轨迹',
    'sim3d.hintOrbit':'拖拽: 旋转视角  Shift+拖拽: 平移  滚轮: 缩放',
    'sim3d.hintGrab':'左拖: 移动  右拖: 旋转  Shift+右拖: 倾斜  滚轮: 抬起  双击: 落下'
  }
};
let _lang = '${lang}';
function i(key){ return (I18N[_lang]||I18N.en)[key] ?? key; }
// window.t alias so that simulator.js t() calls work
window.t = i;

function applyLang(l) {
  _lang = l;
  window.t = i; // re-bind so subsequent t() calls use the new lang
  document.documentElement.lang = l;
  document.title = i('pageTitle');
  document.getElementById('btn-connect').innerHTML = i('connect');
  document.getElementById('btn-run').innerHTML = i('run');
  document.getElementById('btn-stop').innerHTML = i('stop');
  document.getElementById('tab-console-btn').textContent = i('tabConsole');
  document.getElementById('tab-code-btn').textContent = i('tabCode');
  document.getElementById('lang-sel').value = l;
  // Re-populate mat selector labels
  _populateMatSelector();
}

// ── Mat selector ──────────────────────────────────────────────────────────────
function _populateMatSelector() {
  const sel = document.getElementById('mat-select');
  if (!sel) return;
  const prev = sel.value || 'simple';
  sel.innerHTML = '';
  const addOpt = (value, label) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    sel.appendChild(o);
  };
  addOpt('simple',   i('ui.matSimple'));
  addOpt('original', i('ui.matOriginal'));
  // Custom mats from localStorage (reuse loadCustomMats from simulator.js)
  if (typeof loadCustomMats === 'function') {
    const customs = loadCustomMats();
    if (customs.length) {
      const sep = document.createElement('option');
      sep.disabled = true; sep.textContent = '──────';
      sel.appendChild(sep);
      customs.forEach(m => addOpt(m.id, m.name));
    }
  }
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab === 'console' ? 'console-pane' : 'code-pane')
      .classList.remove('hidden');
  });
});

// ── Sidebar toggle ────────────────────────────────────────────────────────────
document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// ── Code viewer ───────────────────────────────────────────────────────────────
document.getElementById('code-view').textContent = ${escapedCode};

// ── Embedded: toio.js ─────────────────────────────────────────────────────────
${safeToio}

// ── Embedded: simulator.js ────────────────────────────────────────────────────
${safeSim}

// ── Simulator init ────────────────────────────────────────────────────────────
const sim = new ToioSimulator();
sim.init(
  document.getElementById('sim-canvas-2d'),
  document.getElementById('sim-canvas-3d')
);
sim.onStatus(cubes => sim.buildStatusChips(document.getElementById('sim-status')));

// Populate mat selector now that simulator.js is loaded
document.getElementById('lang-sel').value = _lang;
_populateMatSelector();

// ── Simulator toolbar wiring ──────────────────────────────────────────────────
// 2D / 3D toggle
document.getElementById('seg-view').addEventListener('click', e => {
  const btn = e.target.closest('.seg-opt');
  if (!btn) return;
  document.querySelectorAll('#seg-view .seg-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  sim.setMode(btn.dataset.view);
  // Show/hide the 2D trail button
  const trailBtn = document.getElementById('btn-2d-trail');
  if (trailBtn) trailBtn.style.visibility = btn.dataset.view === '2d' ? '' : 'hidden';
});

// Mat selector
document.getElementById('mat-select').addEventListener('change', e => {
  sim.setMatType(e.target.value);
});

// Cube count
document.getElementById('sim-cube-count').addEventListener('change', e => {
  const n = Math.max(1, Math.min(4, parseInt(e.target.value) || 1));
  e.target.value = n;
  sim.setCubeCount(n);
});

// Trail toggle (2D)
const _trailBtn = document.getElementById('btn-2d-trail');
if (_trailBtn) {
  _trailBtn.classList.add('active');
  _trailBtn.addEventListener('click', () => {
    sim.toggleAllTrails();
    _trailBtn.classList.toggle('active');
  });
}

// Reset
document.getElementById('btn-reset-sim').addEventListener('click', () => sim.reset());

// Press button
document.getElementById('btn-sim-button').addEventListener('click', () => {
  for (let i = 0; i < sim.cubeCount; i++) sim.pressButton(i);
});

// Fullscreen
document.getElementById('btn-fullscreen-sim').addEventListener('click', () => {
  const panel = document.getElementById('sim-panel');
  if (!document.fullscreenElement) panel.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
});
document.addEventListener('fullscreenchange', () => sim.resize());

// ── Embedded: runtime.js ─────────────────────────────────────────────────────
${safeRuntime}

// ── App wiring ────────────────────────────────────────────────────────────────
const mgr = new ToioManager();
const rt  = new Runtime();
rt.setManager(mgr);
// Wire full ToioSimulator — it has getCubeBackend(), cubeCount, resume(), stop()
rt.setSimulator(sim);

function _addLog(msg, cls = 'log') {
  const pane = document.getElementById('console-pane');
  if (!pane) return;
  const row = document.createElement('div');
  row.className = 'cl ' + cls;
  const ts = new Date().toLocaleTimeString();
  row.textContent = '[' + ts + '] ' + msg;
  pane.appendChild(row);
  pane.scrollTop = pane.scrollHeight;
  // Auto-switch to console tab when a message arrives during run
  if (cls !== 'info') {
    const consoleTab = document.querySelector('[data-tab="console"]');
    const consolePaneCurrent = document.getElementById('console-pane');
    if (consoleTab && consolePaneCurrent && consolePaneCurrent.classList.contains('hidden')) {
      consoleTab.click();
    }
  }
}

rt.onLog(msg => _addLog(msg, 'log'));

// Connect button
document.getElementById('btn-connect').addEventListener('click', async () => {
  if (!navigator.bluetooth) { alert(i('noBlue')); return; }
  try {
    const cube = await mgr.addCube();
    // Sync sim cube count
    sim.setCubeCount(Math.max(sim.cubeCount, mgr.count));
    document.getElementById('sim-cube-count').value = sim.cubeCount;
    const badge = document.createElement('div');
    badge.className = 'conn-badge';
    badge.innerHTML = '<span class="conn-dot"></span>' + cube.name + i('connected');
    document.getElementById('hd-badges').appendChild(badge);
    _addLog(cube.name + i('connected'), 'done');
  } catch (e) { if (e.name !== 'NotFoundError') console.error(e); }
});

// Run / stop
const USER_CODE = ${escapedCode};
let _running = false;

document.getElementById('btn-run').addEventListener('click', async () => {
  if (_running) return;
  _running = true;
  document.getElementById('btn-run').disabled = true;
  document.getElementById('btn-stop').disabled = false;
  sim.resetPosition();   // Reset cube positions before each run (trail preserved until manual reset)
  _addLog(i('start'), 'start');
  try {
    await rt.run(USER_CODE);
    _addLog(i('done'), 'done');
  } catch (e) {
    _addLog(i('error') + e.message, 'error');
    console.error(e);
  }
  _running = false;
  document.getElementById('btn-run').disabled = false;
  document.getElementById('btn-stop').disabled = true;
});

document.getElementById('btn-stop').addEventListener('click', () => {
  rt.stop();
  _running = false;
  document.getElementById('btn-run').disabled = false;
  document.getElementById('btn-stop').disabled = true;
  _addLog(i('stopped'), 'stopped');
});

// Apply language
document.getElementById('lang-sel').addEventListener('change', e => applyLang(e.target.value));
applyLang('${lang}');
</script>
</body>
</html>`;
}

// ─── Runtime ─────────────────────────────────────────────────────────────────

function initRuntime() {
  runtime = new Runtime();
  runtime.setSimulator(simulator);
  runtime.setManager(toioManager);
  runtime.onLog(msg => log(msg));
}

// ─── LLM ─────────────────────────────────────────────────────────────────────

function initLLM() {
  // ── Shared settings helpers (same store as card scanner) ─────────────────────
  const _LS_KEY = 'cardScannerApiSettings';
  const _getS  = () => { try { return JSON.parse(localStorage.getItem(_LS_KEY) || '{}'); } catch { return {}; } };
  const _saveS = (patch) => {
    localStorage.setItem(_LS_KEY, JSON.stringify({ ..._getS(), ...patch }));
  };

  // ── Migrate deprecated Gemini model names (clear saved stale models) ──────────
  const _DEPRECATED_GEMINI = [
    'gemini-2.5-flash-preview-05-20', 'gemini-2.5-flash-preview-04-17',
    'gemini-2.5-flash-preview', 'gemini-2.5-pro-preview', 'gemini-2.5-flash',
  ];
  const _s0chk = _getS();
  if (_DEPRECATED_GEMINI.includes(_s0chk.geminiModel)) {
    _saveS({ geminiModel: '' });
    console.info('[LLM] Removed deprecated Gemini model from localStorage — will use default (gemini-2.0-flash).');
  }

  llmClient = new LLMClient();

  llmClient.onMessage(({ text, code }) => {
    addLLMMessage('assistant', text);
    if (code) addLLMCodeActions(code);
  });

  llmClient.onError(msg => addLLMMessage('error', msg));

  document.getElementById('btn-llm-send').addEventListener('click', sendLLMMessage);
  document.getElementById('llm-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendLLMMessage();
  });

  // ── UI elements ───────────────────────────────────────────────────────────────
  const providerSel = document.getElementById('llm-provider');
  const keyInput    = document.getElementById('llm-api-key');
  const modelSel    = document.getElementById('llm-model-select');
  const fetchBtn    = document.getElementById('btn-llm-fetch-models');

  const _safeSetModel = (provider, model) => {
    if (typeof llmClient.setModel === 'function') llmClient.setModel(provider, model);
  };

  /** Apply current UI values → llmClient + shared localStorage + notify card scanner */
  let _applyInProgress = false;
  const _applySettings = () => {
    const provider = providerSel.value;
    const key      = keyInput.value;
    const model    = modelSel ? modelSel.value : '';
    llmClient.configure(provider, key);
    _safeSetModel(provider, model);
    _saveS({ provider, [`${provider}Key`]: key, [`${provider}Model`]: model });
    // Dispatch so the card scanner settings dialog (if open) stays in sync.
    // _source='llm-panel' prevents our own listener below from re-entering.
    if (!_applyInProgress) {
      _applyInProgress = true;
      window.dispatchEvent(new CustomEvent('aiSettingsChanged', {
        detail: { ..._getS(), _source: 'llm-panel' }
      }));
      _applyInProgress = false;
    }
  };

  /** Fetch model list for current provider and populate the select */
  const _fetchModels = async () => {
    const provider = providerSel.value;
    const key      = keyInput.value.trim();
    if (!key) {
      if (modelSel) modelSel.innerHTML = '<option value="">── APIキーを入力 → ⟳ ──</option>';
      return;
    }
    if (modelSel) { modelSel.innerHTML = '<option value="">取得中...</option>'; modelSel.disabled = true; }
    if (fetchBtn) { fetchBtn.disabled = true; fetchBtn.textContent = '⏳'; }
    try {
      const list  = await window.fetchModelList(provider, key);
      const saved = _getS()[`${provider}Model`] || '';
      if (modelSel) {
        const defaults = window.LLM_DEFAULT_MODELS || {};
        modelSel.innerHTML = `<option value="">${defaults[provider] || '── デフォルト ──'}</option>` +
          list.map(m => `<option value="${m.id}"${m.id === saved ? ' selected' : ''}>${m.name || m.id}</option>`).join('');
        if (!modelSel.value && saved) {
          const o = document.createElement('option');
          o.value = saved; o.textContent = saved; o.selected = true;
          modelSel.appendChild(o);
        }
      }
      _applySettings();
    } catch (e) {
      if (modelSel) modelSel.innerHTML = `<option value="">取得失敗: ${e.message.slice(0,40)}</option>`;
    } finally {
      if (modelSel) modelSel.disabled = false;
      if (fetchBtn) { fetchBtn.disabled = false; fetchBtn.textContent = '⟳'; }
    }
  };

  // ── Event wiring ──────────────────────────────────────────────────────────────
  providerSel.addEventListener('change', () => {
    const p = providerSel.value;
    const s = _getS();
    // Restore key for newly selected provider
    keyInput.value = s[`${p}Key`] || '';
    // Reset model select (user must re-fetch or saved model appears below)
    const savedMdl = s[`${p}Model`] || '';
    if (modelSel) {
      const defaults = window.LLM_DEFAULT_MODELS || {};
      modelSel.innerHTML = savedMdl
        ? `<option value="${savedMdl}" selected>${savedMdl}</option><option value="">${defaults[p]||'デフォルト'}</option>`
        : '<option value="">── APIキーを入力 → ⟳ ──</option>';
    }
    _applySettings();
  });

  keyInput.addEventListener('input', _applySettings);
  if (modelSel)  modelSel.addEventListener('change', _applySettings);
  if (fetchBtn)  fetchBtn.addEventListener('click',  _fetchModels);

  // Listen for updates from the unified AI settings dialog (card scanner ⚙)
  // Ignore events we dispatched ourselves (_source='llm-panel') to avoid loops.
  window.addEventListener('aiSettingsChanged', (e) => {
    const s = e.detail || {};
    if (s._source === 'llm-panel') return;   // our own change, skip
    const p = s.provider || providerSel.value;
    providerSel.value = p;
    keyInput.value    = s[`${p}Key`] || '';
    const mdl = s[`${p}Model`] || '';
    if (modelSel) {
      const defaults = window.LLM_DEFAULT_MODELS || {};
      modelSel.innerHTML = mdl
        ? `<option value="${mdl}" selected>${mdl}</option><option value="">${defaults[p]||'デフォルト'}</option>`
        : `<option value="">${defaults[p]||'── APIキーを入力 → ⟳ ──'}</option>`;
    }
    llmClient.configure(p, s[`${p}Key`] || '');
    _safeSetModel(p, mdl);
  });

  // ── Restore on page load ──────────────────────────────────────────────────────
  const s0    = _getS();
  const prov0 = s0.provider || 'gemini';
  const key0  = s0[`${prov0}Key`]   || '';
  const mdl0  = s0[`${prov0}Model`] || '';

  providerSel.value = prov0;
  keyInput.value    = key0;

  if (modelSel) {
    const defaults = window.LLM_DEFAULT_MODELS || {};
    modelSel.innerHTML = mdl0
      ? `<option value="${mdl0}" selected>${mdl0}</option><option value="">${defaults[prov0]||'デフォルト'}</option>`
      : `<option value="">${defaults[prov0]||'── APIキーを入力 → ⟳ ──'}</option>`;
  }

  llmClient.configure(prov0, key0);
  _safeSetModel(prov0, mdl0);

  // ── Clear history ─────────────────────────────────────────────────────────────
  document.getElementById('btn-llm-clear').addEventListener('click', () => {
    llmClient.clearHistory();
    document.getElementById('llm-messages').innerHTML =
      `<div class="llm-msg assistant"><div class="msg-role">AI</div><div class="msg-body">${t('llm.greeting').replace(/\n/g,'<br>')}</div></div>`;
  });

  // ── Code style selector ────────────────────────────────────────────────────────
  const codeStyleSel = document.getElementById('llm-code-style');
  if (codeStyleSel) {
    // Apply i18n to option labels
    const posOpt  = codeStyleSel.querySelector('option[value="position"]');
    const timeOpt = codeStyleSel.querySelector('option[value="time"]');
    if (posOpt)  posOpt.textContent  = t('llm.stylePosition');
    if (timeOpt) timeOpt.textContent = t('llm.styleTime');
    // Restore saved style
    const savedStyle = (() => { try { return JSON.parse(localStorage.getItem('cardScannerParams') || '{}').llmStyle || 'position'; } catch { return 'position'; } })();
    codeStyleSel.value = savedStyle;
    codeStyleSel.addEventListener('change', () => {
      try {
        const params = JSON.parse(localStorage.getItem('cardScannerParams') || '{}');
        params.llmStyle = codeStyleSel.value;
        localStorage.setItem('cardScannerParams', JSON.stringify(params));
      } catch { /* ignore */ }
    });
  }
}

// ─── LLM API collapsible ─────────────────────────────────────────────────────

function initLLMApiCollapse() {
  const toggle = document.getElementById('btn-api-toggle');
  const area   = document.getElementById('llm-api-area');
  const keyIn  = document.getElementById('llm-api-key');
  if (!toggle || !area) return;

  function setCollapsed(collapsed) {
    area.classList.toggle('collapsed', collapsed);
    toggle.textContent = collapsed ? '▶' : '▼';
    toggle.title = collapsed ? 'API設定を開く' : 'API設定を閉じる';
  }

  // Start expanded; collapse if key already saved
  const hasSavedKey = !!localStorage.getItem('toio_llm_key');
  setCollapsed(hasSavedKey);

  toggle.addEventListener('click', () => {
    setCollapsed(!area.classList.contains('collapsed'));
  });

  // Auto-collapse when user leaves the key field after setting a value
  if (keyIn) {
    keyIn.addEventListener('blur', () => {
      if (keyIn.value.trim().length > 10) {
        setCollapsed(true);
      }
    });
  }
}

// ─── UI wiring ───────────────────────────────────────────────────────────────

function initUI() {
  // Hamburger menu toggle (mobile only)
  const hamburgerBtn = document.getElementById('btn-hamburger');
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', () => {
      document.getElementById('header').classList.toggle('menu-open');
    });
    // Close menu when clicking outside the header
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#header')) {
        document.getElementById('header').classList.remove('menu-open');
      }
    });
  }

  document.getElementById('btn-add-cube').addEventListener('click', addCube);

  const cubeCountInput = document.getElementById('sim-cube-count');
  if (cubeCountInput) {
    cubeCountInput.addEventListener('change', () => {
      const n = Math.max(1, Math.min(4, parseInt(cubeCountInput.value) || 1));
      cubeCountInput.value = n;
      simulator.setCubeCount(n);
      simulator._notifyUpdate();
    });
  }

  document.getElementById('btn-run').addEventListener('click', runProgram);
  document.getElementById('btn-stop').addEventListener('click', () => {
    runtime.stop(); updateRunButtons(false);
    // Re-register hat-block listeners after explicit stop
    setTimeout(_autoRegisterHandlers, 200);
  });

  document.getElementById('btn-save').addEventListener('click', saveProgram);
  document.getElementById('btn-load').addEventListener('click', () =>
    document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', loadProgramFile);

  document.querySelectorAll('#bottom-tabs .ptab').forEach(btn => {
    btn.addEventListener('click', () => switchBottomTab(btn.dataset.tab));
  });

  document.getElementById('btn-clear-console').addEventListener('click', () => {
    document.getElementById('console-output').innerHTML = '';
  });

  document.getElementById('btn-reset-sim').addEventListener('click', () => {
    simulator.reset();
    log(t('rt.simReset'), 'info');
  });

  document.getElementById('btn-sim-button').addEventListener('click', () => {
    // Press ALL simulator cube buttons
    for (let i = 0; i < simulator.cubeCount; i++) {
      simulator.pressButton(i);
    }
  });

  document.getElementById('seg-view').addEventListener('click', e => {
    const btn = e.target.closest('.seg-opt');
    if (!btn) return;
    document.querySelectorAll('#seg-view .seg-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    simulator.setMode(btn.dataset.view);
    // Show 2D trail button only in 2D mode (3D has its own toolbar)
    const trailBtn2d = document.getElementById('btn-2d-trail');
    if (trailBtn2d) trailBtn2d.style.display = btn.dataset.view === '2d' ? '' : 'none';
  });

  // Wire 2D trail toggle button
  document.getElementById('btn-2d-trail')?.addEventListener('click', () => {
    if (simulator) simulator.toggleAllTrails();
  });

  // Workspace tab switching (respects split-view state)
  document.getElementById('tab-blocks-btn')?.addEventListener('click', () => {
    const isSplit = document.getElementById('workspace-panel').classList.contains('ws-split');
    if (!isSplit) {
      document.getElementById('ws-blocks-view').style.display = '';
      document.getElementById('ws-code-view').style.display   = 'none';
    }
    document.getElementById('tab-blocks-btn').classList.add('active');
    document.getElementById('tab-wscode-btn').classList.remove('active');
    document.getElementById('ws-block-tools').style.display = '';
    Blockly.svgResize(workspace);
  });

  document.getElementById('tab-wscode-btn')?.addEventListener('click', () => {
    const isSplit = document.getElementById('workspace-panel').classList.contains('ws-split');
    if (!isSplit) {
      document.getElementById('ws-blocks-view').style.display = 'none';
      document.getElementById('ws-code-view').style.display   = '';
    }
    document.getElementById('tab-blocks-btn').classList.remove('active');
    document.getElementById('tab-wscode-btn').classList.add('active');
    // Keep ws-block-tools visible (new-program, cleanup, fit, level buttons)
    document.getElementById('ws-block-tools').style.display = '';
    // Sync code display
    updateCodePanel();
  });

  // New program button
  document.getElementById('btn-new-program')?.addEventListener('click', () => {
    if (workspace && confirm(t('ui.confirmNew') || 'Clear workspace?')) {
      workspace.clear();
      // Reset project name
      const nameField = document.getElementById('project-name');
      if (nameField) nameField.value = 'New Project';
      log(t('ui.newProgram') + ' — OK', 'info');
    }
  });

  // Block tools
  document.getElementById('btn-cleanup-blocks')?.addEventListener('click', () => {
    workspace?.cleanUp();
  });

  document.getElementById('btn-fit-blocks')?.addEventListener('click', () => {
    workspace?.scrollCenter();
    // Zoom to fit all blocks
    const bounds = workspace?.getBlocksBoundingBox?.();
    if (bounds && workspace) {
      const metrics = workspace.getMetrics();
      const scaleX = (metrics.viewWidth - 40) / (bounds.right - bounds.left + 40);
      const scaleY = (metrics.viewHeight - 40) / (bounds.bottom - bounds.top + 40);
      const newScale = Math.min(1, Math.max(0.2, Math.min(scaleX, scaleY)));
      workspace.setScale(newScale);
      workspace.scrollCenter();
    }
  });

  window.addEventListener('resize', () => {
    Blockly.svgResize(workspace);
    updateDividerBounds();
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Only when focus is NOT in a text input / textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      workspace?.undo(false);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      workspace?.undo(true);
    }
  });
}

// ─── Cube connection ──────────────────────────────────────────────────────────

async function addCube() {
  if (!navigator.bluetooth) {
    log(t('cube.noble'), 'error'); return;
  }
  try {
    log('Scanning...', 'info');
    const cube = await toioManager.addCube();
    cube.on('button', pressed => { /* forward if needed */ });
    simulator.setCubeCount(toioManager.count);

    // Mirror real cube position into the simulator (monitor mode)
    cube.on('position', () => {
      const simCube = simulator.getCubeBackend(cube.index);
      if (simCube && cube.position) {
        simCube._x     = cube.position.x;
        simCube._y     = cube.position.y;
        simCube._angle = cube.position.angle;
        simulator._dirty = true;
      }
    });

    // Also mirror LED colour updates so the chip colour is accurate
    cube.on('led', () => {
      const simCube = simulator.getCubeBackend(cube.index);
      if (simCube && cube.led) {
        simCube._led = { ...cube.led };
        simulator._dirty = true;
      }
    });

    // When this cube disconnects, refresh the title
    cube.on('disconnect', () => {
      updateMonitorMode();
      updateCubeList();
    });

    updateCubeList();
    updateMonitorMode();
    log(cube.name + t('cube.connected'), 'done');
    try {
      const bat = await cube.getBattery();
      log(`[Cube${cube.index + 1}] Battery: ${bat}%`, 'info');
    } catch {}
  } catch (e) {
    if (e.name !== 'NotFoundError') log(e.message, 'error');
  }
}

/** Switch the simulator panel title between Simulator / Monitor mode */
function updateMonitorMode() {
  const hasReal = toioManager && toioManager.count > 0;
  const titleEl = document.querySelector('#sim-panel .panel-header-title');
  if (titleEl) {
    titleEl.textContent = hasReal ? t('ui.monitor') : t('ui.simulator');
    titleEl.classList.toggle('monitor-mode', hasReal);
  }
}

function updateCubeList() {
  const list = document.getElementById('cube-list');
  list.querySelectorAll('.cube-badge').forEach(b => b.remove());
  toioManager.cubes.forEach((cube, i) => {
    const badge = document.createElement('div');
    badge.className = 'cube-badge connected';
    badge.innerHTML = `<span class="dot"></span><span>${cube.name || `Cube${i + 1}`}</span>`;
    badge.title = 'Click to disconnect';
    badge.addEventListener('click', () => { cube.disconnect(); updateCubeList(); });
    list.insertBefore(badge, document.getElementById('btn-add-cube'));
  });
}

// ─── Run / Stop ───────────────────────────────────────────────────────────────

async function runProgram() {
  if (runtime.isRunning) return;
  // Use manually-edited JS override if set; Python override stays display-only
  // (Python editing that successfully parses updates blocks, then JS is auto-generated)
  let jsCode = _codeOverride
    ? _codeOverride
    : Blockly.JavaScript.workspaceToCode(workspace);
  if (!jsCode || !jsCode.trim()) { log('Program is empty.', 'info'); return; }

  // Inject variable tracking for variable monitor
  const allVars = workspace.getAllVariables().map(v => v.name);
  if (allVars.length > 0) {
    window._toioVars = {};
    // Prepend a tracker initializer
    const preamble = `window._toioVars = window._toioVars || {};\n`;
    jsCode = preamble + jsCode;
    startVarMonitor();
  }

  updateRunButtons(true);
  await runtime.run(jsCode);
  stopVarMonitor();
  updateVarMonitorDisplay();  // Final refresh to show last values
  updateRunButtons(false);
  // Re-register hat-block listeners so buttons keep working after program ends
  setTimeout(_autoRegisterHandlers, 200);
}

function updateRunButtons(running) {
  document.getElementById('btn-run').disabled  = running;
  document.getElementById('btn-stop').disabled = !running;
}

// ─── Auto-register hat block (button event) listeners ────────────────────────

let _autoRegisterTimer = null;

function _scheduleAutoRegister() {
  clearTimeout(_autoRegisterTimer);
  _autoRegisterTimer = setTimeout(_autoRegisterHandlers, 600);
}

function _autoRegisterHandlers() {
  if (!workspace || !runtime || runtime.isRunning) return;
  const topBlocks = workspace.getTopBlocks(false);
  const hatBlocks = topBlocks.filter(b => b.type === 'toio_on_button');
  if (hatBlocks.length === 0) return;
  // Generate code only for the hat blocks (registers onButton() callbacks)
  const hatCode = hatBlocks
    .map(b => Blockly.JavaScript.blockToCode(b))
    .filter(Boolean)
    .join('\n');
  if (hatCode.trim()) runtime.autoRegisterHandlers(hatCode);
}

// ─── JS → Blockly reverse parser (bidirectional sync) ────────────────────────
// ─── JS → Blocks reverse parser ──────────────────────────────────────────────
// Parses the subset of JS that our own generator produces back into Blockly
// blocks.  Returns true (and loads blocks) on success, or false if ANY
// statement is unrecognisable (caller keeps the override in that case).

/** Parse a bare number string (plain or "-(N)" form) → string, or null. */
function _parseNum(s) {
  s = (s || '').trim();
  // Handle Blockly's -(N) pattern for negative literals
  const neg = s.match(/^-\s*\(\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (neg) return String(-parseFloat(neg[1]));
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  return null; // complex expression — give up
}

/** Strip the `D * 1000` suffix our generators emit, returning seconds. */
function _parseDuration(raw) {
  const stripped = raw.trim().replace(/\s*\*\s*1000$/, '');
  return _parseNum(stripped);
}

/** Split a top-level comma-separated arg list (handles nested parens). */
function _splitArgs(s) {
  const args = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      args.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(s.slice(start).trim());
  return args;
}

/**
 * Parse a "CUBE.method(args)" fragment (cube index or 'ALL').
 * Returns a block-def object or null if unrecognisable.
 */
function _parseCubeCall(cubeIdx, call) {
  const c = (cubeIdx === 'ALL') ? 'ALL' : String(cubeIdx);
  let m;

  // ── No-arg calls ─────────────────────────────────────────────────────────
  if (/^stop\(\)$/.test(call))
    return { type: 'toio_stop',       fields: { CUBE: c } };
  if (/^turnOffLED\(\)$/.test(call))
    return { type: 'toio_led_off',    fields: { CUBE: c } };
  if (/^stopSound\(\)$/.test(call))
    return { type: 'toio_stop_sound', fields: { CUBE: c } };

  // ── move(L, R, D*1000) ────────────────────────────────────────────────────
  m = call.match(/^move\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 3) return null;
    const L = _parseNum(args[0]), R = _parseNum(args[1]);
    const D = _parseDuration(args[2]);
    if (L === null || R === null || D === null) return null;
    return { type: 'toio_move_raw', fields: { CUBE: c },
             values: { LEFT: L, RIGHT: R, DURATION: D } };
  }

  // ── setLED(R, G, B, D*1000) ───────────────────────────────────────────────
  m = call.match(/^setLED\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 4) return null;
    const R = _parseNum(args[0]), G = _parseNum(args[1]), B = _parseNum(args[2]);
    const D = _parseDuration(args[3]);
    if (R === null || G === null || B === null || D === null) return null;
    return { type: 'toio_led', fields: { CUBE: c },
             values: { R, G, B, DURATION: D } };
  }

  // ── moveTo(X, Y, A|null, S) or moveTo(X, Y, A|null, S, 'MODE') ──────────
  // LLM-generated code uses 4 args; block generator uses 5 (with mode string).
  m = call.match(/^moveTo\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 4 && args.length !== 5) return null;
    const X = _parseNum(args[0]), Y = _parseNum(args[1]);
    const rawA = args[2], S = _parseNum(args[3]);
    // Extract mode string (5th arg) or default to NORMAL
    let MODE = 'NORMAL';
    if (args.length === 5) {
      const modeM = args[4].match(/^'([^']+)'$/) || args[4].match(/^"([^"]+)"$/);
      if (!modeM) return null;
      MODE = modeM[1];
    }
    if (X === null || Y === null || S === null) return null;
    // moveTo with null angle (POS_ONLY) → use the xy-only block
    if (rawA === 'null' || MODE === 'POS_ONLY') {
      return { type: 'toio_move_to_xy', fields: { CUBE: c },
               values: { X, Y, SPEED: S } };
    }
    const A = _parseNum(rawA);
    if (A === null) return null;
    return { type: 'toio_move_to', fields: { CUBE: c, MODE },
             values: { X, Y, ANGLE: A, SPEED: S } };
  }

  // ── rotateTo(A) ───────────────────────────────────────────────────────────
  m = call.match(/^rotateTo\((.+)\)$/);
  if (m) {
    const A = _parseNum(m[1].trim());
    if (A === null) return null;
    return { type: 'toio_rotate_to', fields: { CUBE: c }, values: { ANGLE: A } };
  }

  // ── moveRel(dist, speed) ──────────────────────────────────────────────────
  m = call.match(/^moveRel\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 2) return null;
    const D = _parseNum(args[0]), S = _parseNum(args[1]);
    if (D === null || S === null) return null;
    const dNum = parseFloat(D);
    const dir  = dNum >= 0 ? 'FORWARD' : 'BACKWARD';
    const dist = String(Math.abs(dNum));
    return { type: 'toio_move_rel', fields: { CUBE: c, DIRECTION: dir },
             values: { DIST: dist, SPEED: S } };
  }

  // ── rotateRel(dAngle, speed) ──────────────────────────────────────────────
  m = call.match(/^rotateRel\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 2) return null;
    const A = _parseNum(args[0]), S = _parseNum(args[1]);
    if (A === null || S === null) return null;
    const aNum  = parseFloat(A);
    const dir   = aNum >= 0 ? 'RIGHT' : 'LEFT';
    const angle = String(Math.abs(aNum));
    return { type: 'toio_rotate_rel', fields: { CUBE: c, DIRECTION: dir },
             values: { ANGLE: angle, SPEED: S } };
  }

  // ── playSoundEffect(ID) ───────────────────────────────────────────────────
  m = call.match(/^playSoundEffect\((\d+)\)$/);
  if (m) return { type: 'toio_sound_effect', fields: { CUBE: c, EFFECT: m[1] } };

  // ── playSound(NOTE, D*1000) ───────────────────────────────────────────────
  m = call.match(/^playSound\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 2) return null;
    const NOTE = args[0].trim();
    if (_parseNum(NOTE) === null) return null;   // must be a plain number
    const D = _parseDuration(args[1]);
    if (D === null) return null;
    return { type: 'toio_play_note', fields: { CUBE: c, NOTE }, values: { DURATION: D } };
  }

  return null;
}

/**
 * Parse one trimmed, semicolon-stripped statement line.
 * Returns a block-def object or null.
 */
function _parseToioStatement(line) {
  // Strip trailing semicolon
  line = line.replace(/;\s*$/, '').trim();
  let m;

  // ── await toio.wait(S) ────────────────────────────────────────────────────
  m = line.match(/^await toio\.wait\((.+)\)$/);
  if (m) {
    const S = _parseNum(m[1].trim());
    return S !== null ? { type: 'toio_wait', values: { SECONDS: S } } : null;
  }

  // ── await toio.waitButton(N) ──────────────────────────────────────────────
  m = line.match(/^await toio\.waitButton\((\d+)\)$/);
  if (m) return { type: 'toio_wait_button', fields: { CUBE: m[1] } };

  // ── toio.log(TEXT) — toio_print block ─────────────────────────────────────
  // Matches both `toio.log(...)` and `await toio.log(...)`
  m = line.match(/^(?:await\s+)?toio\.log\((.+)\)$/);
  if (m) {
    const arg = m[1].trim();
    // Simple quoted string literal
    const strM = arg.match(/^"((?:[^"\\]|\\.)*)"$/) || arg.match(/^'((?:[^'\\]|\\.)*)'$/);
    if (strM) return { type: 'toio_print', string_values: { TEXT: strM[1] } };
    // Simple number
    const num = _parseNum(arg);
    if (num !== null) return { type: 'toio_print', values: { TEXT: num } };
    // Complex expression — can't reconstruct
    return null;
  }

  // ── await toio.all(async t => { await t.CALL; }) ──────────────────────────
  m = line.match(/^await toio\.all\(async t\s*=>\s*\{\s*await t\.(.+?)\s*;\s*\}\)$/);
  if (m) return _parseCubeCall('ALL', m[1].trim());

  // ── await toio[N].CALL ────────────────────────────────────────────────────
  m = line.match(/^await toio\[(\d+)\]\.(.+)$/);
  if (m) return _parseCubeCall(m[1], m[2].trim());

  return null;
}

/**
 * Build Blockly XML from an ordered array of block-defs plus optional
 * workspace-comment lines.  Blocks are chained via <next> tags.
 *
 * Block-def shape:
 *   { type, fields, values, string_values }
 *   fields       → <field name=N>V</field>  (dropdown / text field)
 *   values       → <value name=N><block type="math_number">…</block></value>
 *   string_values → <value name=N><block type="text">…</block></value>
 */
function _buildBlocklyXml(defs, wsCommentLines) {
  const esc = (s) => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const numBlk = (v) =>
    `<block type="math_number"><field name="NUM">${esc(v)}</field></block>`;
  const strBlk = (v) =>
    `<block type="text"><field name="TEXT">${esc(v)}</field></block>`;

  // Build chain from innermost (last def) to outermost (first def)
  let inner = '';
  for (let i = defs.length - 1; i >= 0; i--) {
    const def = defs[i];
    const pos = i === 0 ? ' x="50" y="50"' : '';
    let s = `<block type="${esc(def.type)}"${pos}>`;
    Object.entries(def.fields        || {}).forEach(([n, v]) => {
      s += `<field name="${esc(n)}">${esc(v)}</field>`;
    });
    Object.entries(def.values        || {}).forEach(([n, v]) => {
      s += `<value name="${esc(n)}">${numBlk(v)}</value>`;
    });
    Object.entries(def.string_values || {}).forEach(([n, v]) => {
      s += `<value name="${esc(n)}">${strBlk(v)}</value>`;
    });
    if (inner) s += `<next>${inner}</next>`;
    s += '</block>';
    inner = s;
  }

  // Workspace comments placed to the right of the block stack
  let commentXml = '';
  if (wsCommentLines.length > 0) {
    const txt = esc(wsCommentLines.join('\n'));
    commentXml = `<comment x="360" y="50" w="220" h="${Math.max(60, wsCommentLines.length * 22)}">${txt}</comment>`;
  }

  return `<xml xmlns="https://developers.google.com/blockly/xml">${inner}${commentXml}</xml>`;
}

/**
 * Parse a Python cube method call (e.g. "move(50,50,0.5)") for a given cube index.
 * Mirrors _parseCubeCall() but for the Python API names.
 */
function _parsePythonCubeCall(cubeIdx, call) {
  const c = (cubeIdx === 'ALL') ? 'ALL' : String(cubeIdx);
  call = call.trim().replace(/\s*$/, '');
  let m;

  // No-arg calls
  if (/^stop\(\)$/.test(call))       return { type: 'toio_stop',       fields: { CUBE: c } };
  if (/^led_off\(\)$/.test(call))    return { type: 'toio_led_off',    fields: { CUBE: c } };
  if (/^stop_sound\(\)$/.test(call)) return { type: 'toio_stop_sound', fields: { CUBE: c } };

  // move(L, R, dur) — Python duration is in seconds (no * 1000)
  m = call.match(/^move\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 3) return null;
    const L = _parseNum(args[0]), R = _parseNum(args[1]), D = _parseNum(args[2]);
    if (L === null || R === null || D === null) return null;
    return { type: 'toio_move_raw', fields: { CUBE: c }, values: { LEFT: L, RIGHT: R, DURATION: D } };
  }

  // set_led(R, G, B, dur)
  m = call.match(/^set_led\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 4) return null;
    const R = _parseNum(args[0]), G = _parseNum(args[1]), B = _parseNum(args[2]), D = _parseNum(args[3]);
    if (R === null || G === null || B === null || D === null) return null;
    return { type: 'toio_led', fields: { CUBE: c }, values: { R, G, B, DURATION: D } };
  }

  // move_to(X, Y, angle_or_None, speed)
  m = call.match(/^move_to\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 4) return null;
    const X = _parseNum(args[0]), Y = _parseNum(args[1]), S = _parseNum(args[3]);
    if (X === null || Y === null || S === null) return null;
    if (args[2].trim() === 'None') {
      return { type: 'toio_move_to_xy', fields: { CUBE: c }, values: { X, Y, SPEED: S } };
    }
    const A = _parseNum(args[2]);
    if (A === null) return null;
    return { type: 'toio_move_to', fields: { CUBE: c, MODE: 'NORMAL' }, values: { X, Y, ANGLE: A, SPEED: S } };
  }

  // rotate_to(A)
  m = call.match(/^rotate_to\((.+)\)$/);
  if (m) {
    const A = _parseNum(m[1].trim());
    if (A === null) return null;
    return { type: 'toio_rotate_to', fields: { CUBE: c }, values: { ANGLE: A } };
  }

  // move_rel(dist, speed)
  m = call.match(/^move_rel\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 2) return null;
    const D = _parseNum(args[0]), S = _parseNum(args[1]);
    if (D === null || S === null) return null;
    const dNum = parseFloat(D);
    const dir  = dNum >= 0 ? 'FORWARD' : 'BACKWARD';
    const dist = String(Math.abs(dNum));
    return { type: 'toio_move_rel', fields: { CUBE: c, DIRECTION: dir },
             values: { DIST: dist, SPEED: S } };
  }

  // rotate_rel(dAngle, speed)
  m = call.match(/^rotate_rel\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 2) return null;
    const A = _parseNum(args[0]), S = _parseNum(args[1]);
    if (A === null || S === null) return null;
    const aNum  = parseFloat(A);
    const dir   = aNum >= 0 ? 'RIGHT' : 'LEFT';
    const angle = String(Math.abs(aNum));
    return { type: 'toio_rotate_rel', fields: { CUBE: c, DIRECTION: dir },
             values: { ANGLE: angle, SPEED: S } };
  }

  // play_effect(ID)
  m = call.match(/^play_effect\((\d+)\)$/);
  if (m) return { type: 'toio_sound_effect', fields: { CUBE: c, EFFECT: m[1] } };

  // play_note(NOTE, dur)
  m = call.match(/^play_note\((.+)\)$/);
  if (m) {
    const args = _splitArgs(m[1]);
    if (args.length !== 2) return null;
    const NOTE = args[0].trim(), D = _parseNum(args[1]);
    if (_parseNum(NOTE) === null || D === null) return null;
    return { type: 'toio_play_note', fields: { CUBE: c, NOTE }, values: { DURATION: D } };
  }

  // play_action(slot)
  m = call.match(/^play_action\((\d+)\)$/);
  if (m) return { type: 'toio_run_action', fields: { CUBE: c, SLOT: m[1] } };

  return null;
}

/**
 * Attempt to parse manually-edited Python code back into Blockly blocks.
 * Handles: for range, while True, if/else, await cubes[N].CALL, asyncio.sleep, print.
 * On full success : clears workspace, loads new blocks, returns true.
 * On partial      : loads what could be parsed, returns { partial:true, errorLines:[1-based] }
 * On full failure : returns false (workspace is NOT modified).
 */
function tryParsePythonToBlocks(code) {
  if (!workspace || !code || !code.trim()) return false;

  // ── XML helpers ─────────────────────────────────────────────────────────
  const esc = (s) => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const numBlk = (v) => `<block type="math_number"><field name="NUM">${esc(v)}</field></block>`;
  const boolBlk = `<block type="logic_boolean"><field name="BOOL">TRUE</field></block>`;

  function nodeToXml(node) {
    if (node.ctrlType === 'leaf') {
      const d = node.def;
      let s = `<block type="${esc(d.type)}">`;
      Object.entries(d.fields        || {}).forEach(([n,v]) => { s += `<field name="${esc(n)}">${esc(v)}</field>`; });
      Object.entries(d.values        || {}).forEach(([n,v]) => { s += `<value name="${esc(n)}">${numBlk(v)}</value>`; });
      Object.entries(d.string_values || {}).forEach(([n,v]) => { s += `<value name="${esc(n)}"><block type="text"><field name="TEXT">${esc(v)}</field></block></value>`; });
      return s + '</block>';
    }
    if (node.ctrlType === 'repeat') {
      const inner = chainXml(node.children);
      let s = `<block type="controls_repeat_ext"><value name="TIMES">${numBlk(node.times)}</value>`;
      if (inner) s += `<statement name="DO">${inner}</statement>`;
      return s + '</block>';
    }
    if (node.ctrlType === 'while') {
      const inner = chainXml(node.children);
      let s = `<block type="controls_whileUntil"><field name="MODE">WHILE</field><value name="BOOL">${boolBlk}</value>`;
      if (inner) s += `<statement name="DO">${inner}</statement>`;
      return s + '</block>';
    }
    if (node.ctrlType === 'if') {
      const inner     = chainXml(node.children);
      const elseInner = chainXml(node.elseChildren || []);
      const mut = elseInner ? '<mutation else="1"></mutation>' : '';
      let s = `<block type="controls_if">${mut}<value name="IF0">${boolBlk}</value>`;
      if (inner)     s += `<statement name="DO0">${inner}</statement>`;
      if (elseInner) s += `<statement name="ELSE">${elseInner}</statement>`;
      return s + '</block>';
    }
    return '';
  }
  function chainXml(nodes) {
    const parts = nodes.map(nodeToXml).filter(Boolean);
    if (parts.length === 0) return '';
    let xml = parts[parts.length - 1];
    for (let i = parts.length - 2; i >= 0; i--) {
      xml = parts[i].replace(/<\/block>$/, `<next>${xml}</next></block>`);
    }
    return xml;
  }

  // ── Strip Python boilerplate → get user code lines (with original line tracking) ──
  const allLines = code.split('\n');
  let userLines       = [];
  let userLineOrigIdx = [];   // allLines index for each entry in userLines (for error highlighting)
  let state = 'top';

  for (let origIdx = 0; origIdx < allLines.length; origIdx++) {
    const raw = allLines[origIdx];
    const t2  = raw.trim();
    if (!t2) continue;
    if (state === 'top') {
      if (t2.startsWith('import ') || t2.startsWith('from ') || t2.startsWith('asyncio.run(')) continue;
      if (t2 === 'async def main():') { state = 'main'; continue; }
      if (!t2.startsWith('#')) { userLines.push(raw); userLineOrigIdx.push(origIdx); }
      continue;
    }
    if (state === 'main') {
      if (t2.startsWith('async with BLEScanner') || t2.startsWith('if not found') ||
          t2.startsWith('cubes = ') || t2.startsWith('print("toioが見つかりません')  ||
          (t2 === 'return' && userLines.length === 0)) continue;
      if (t2.startsWith('async with cubes[')) { state = 'body'; continue; }
      userLines.push(raw); userLineOrigIdx.push(origIdx);
      continue;
    }
    if (state === 'body') { userLines.push(raw); userLineOrigIdx.push(origIdx); }
  }

  if (userLines.length === 0) return false;

  // Normalise indentation  (normLines[i] has same index as userLineOrigIdx[i])
  const nonEmpty   = userLines.filter(l => l.trim());
  const minIndent  = Math.min(...nonEmpty.map(l => l.match(/^(\s*)/)[1].length));
  const normLines  = userLines.map(l => l.slice(minIndent));

  // ── Parse with indent-level stack ────────────────────────────────────────
  const ROOT = { ctrlType: 'root', children: [], elseChildren: [], inElse: false, indent: -1 };
  const stack = [ROOT];
  const wsCommentLines  = [];
  const unparseableLines = [];   // 1-based original line numbers that could not be converted

  for (let li = 0; li < normLines.length; li++) {
    const rawLine = normLines[li];
    const line    = rawLine.trim();
    if (!line) continue;

    const origLineNum = userLineOrigIdx[li] + 1;   // 1-based for display / highlighting
    const indent = rawLine.match(/^(\s*)/)[1].length;

    // Pop frames that ended at this indent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();

    const top    = stack[stack.length - 1];
    const target = top.inElse ? top.elseChildren : top.children;

    // Comment
    if (line.startsWith('#')) {
      const txt = line.replace(/^#\s?/, '').trim();
      if (txt) wsCommentLines.push(txt);
      continue;
    }

    // else:
    if (/^else\s*:$/.test(line)) {
      if (stack.length > 1 && stack[stack.length - 1].ctrlType === 'if') {
        stack[stack.length - 1].inElse = true;
      }
      continue;
    }

    // for i in range(N): → repeat
    { const m = line.match(/^for\s+\w+\s+in\s+range\((\d+(?:\.\d+)?)\)\s*:$/);
      if (m) {
        const node = { ctrlType: 'repeat', times: m[1], children: [], elseChildren: [], inElse: false, indent };
        target.push(node); stack.push(node); continue;
      }
    }

    // while ...: → while
    if (/^while\s+.+\s*:$/.test(line)) {
      const node = { ctrlType: 'while', children: [], elseChildren: [], inElse: false, indent };
      target.push(node); stack.push(node); continue;
    }

    // if ...: → if
    if (/^if\s+.+\s*:$/.test(line)) {
      const node = { ctrlType: 'if', children: [], elseChildren: [], inElse: false, indent };
      target.push(node); stack.push(node); continue;
    }

    // for cube in cubes: → peek next line for ALL cube call
    if (/^for\s+\w+\s+in\s+cubes\s*:$/.test(line)) {
      let j = li + 1;
      while (j < normLines.length && !normLines[j].trim()) j++;
      if (j >= normLines.length) {
        console.warn('[PY→Blocks] empty for..cubes body');
        unparseableLines.push(origLineNum); continue;
      }
      const nextLine = normLines[j].trim();
      const m2 = nextLine.match(/^await\s+\w+\.(.+)$/);
      if (!m2) {
        console.warn('[PY→Blocks] unrecognised for..cubes body:', nextLine);
        unparseableLines.push(origLineNum); li = j; continue;
      }
      const def = _parsePythonCubeCall('ALL', m2[1]);
      if (!def) {
        console.warn('[PY→Blocks] unknown cube method in for..cubes:', m2[1]);
        unparseableLines.push(origLineNum); li = j; continue;
      }
      target.push({ ctrlType: 'leaf', def });
      li = j;
      continue;
    }

    // await asyncio.sleep(S)
    { const m = line.match(/^await\s+asyncio\.sleep\((.+)\)$/);
      if (m) {
        const S = _parseNum(m[1].trim());
        if (S === null) {
          console.warn('[PY→Blocks] bad sleep arg:', m[1]);
          unparseableLines.push(origLineNum); continue;
        }
        target.push({ ctrlType: 'leaf', def: { type: 'toio_wait', values: { SECONDS: S } } });
        continue;
      }
    }

    // await cubes[N].wait_button()
    { const m = line.match(/^await\s+cubes\[(\d+)\]\.wait_button\(\)$/);
      if (m) {
        target.push({ ctrlType: 'leaf', def: { type: 'toio_wait_button', fields: { CUBE: m[1] } } });
        continue;
      }
    }

    // print(...)
    { const m = line.match(/^print\((.+)\)$/);
      if (m) {
        const arg  = m[1].trim();
        const strM = arg.match(/^"((?:[^"\\]|\\.)*)"$/) || arg.match(/^'((?:[^'\\]|\\.)*)'$/);
        if (strM) { target.push({ ctrlType: 'leaf', def: { type: 'toio_print', string_values: { TEXT: strM[1] } } }); continue; }
        const num = _parseNum(arg);
        if (num !== null) { target.push({ ctrlType: 'leaf', def: { type: 'toio_print', values: { TEXT: num } } }); continue; }
        console.warn('[PY→Blocks] complex print arg:', arg);
        unparseableLines.push(origLineNum); continue;
      }
    }

    // await cubes[N].CALL
    { const m = line.match(/^await\s+cubes\[(\d+)\]\.(.+)$/);
      if (m) {
        const def = _parsePythonCubeCall(m[1], m[2]);
        if (!def) {
          console.warn('[PY→Blocks] unknown cube method:', m[2]);
          unparseableLines.push(origLineNum); continue;
        }
        target.push({ ctrlType: 'leaf', def });
        continue;
      }
    }

    // Unrecognised line — skip and highlight, do not abort
    console.warn('[PY→Blocks] unrecognised line — skipping:', line);
    unparseableLines.push(origLineNum);
  }

  // Nothing was convertible at all → complete failure (workspace untouched)
  if (ROOT.children.length === 0 && wsCommentLines.length === 0) return false;

  // ── Serialise to Blockly XML ─────────────────────────────────────────────
  let bodyXml = chainXml(ROOT.children);
  if (bodyXml) bodyXml = bodyXml.replace(/^<block /, '<block x="50" y="50" ');

  let commentXml = '';
  if (wsCommentLines.length > 0) {
    const txt = esc(wsCommentLines.join('\n'));
    commentXml = `<comment x="360" y="50" w="220" h="${Math.max(60, wsCommentLines.length * 22)}">${txt}</comment>`;
  }

  const xml = `<xml xmlns="https://developers.google.com/blockly/xml">${bodyXml}${commentXml}</xml>`;

  try {
    const parseDom = Blockly.utils?.xml?.textToDom || Blockly.Xml?.textToDom;
    if (!parseDom) throw new Error('Blockly XML API not found');
    const dom = parseDom(xml);
    workspace.clear();
    Blockly.Xml.domToWorkspace(dom, workspace);
    return unparseableLines.length > 0
      ? { partial: true, errorLines: unparseableLines }
      : true;
  } catch (e) {
    console.warn('[PY→Blocks] XML load failed:', e, '\nXML:\n', xml);
    return false;
  }
}

/**
 * Pre-process JS code to substitute array-variable accesses and unroll
 * array-indexed for loops, producing flat literal-only code that the existing
 * tryParseJSToBlocks() parser can handle.
 *
 * Handles patterns like:
 *   const pts = [[250,100],[300,250],...];
 *   await toio[0].moveTo(pts[0][0], pts[0][1], 0, 80);
 *   for (let i = 1; i < pts.length; i++) {
 *       await toio[0].moveTo(pts[i][0], pts[i][1], 0, 80);
 *   }
 *
 * Returns: expanded code string, or null if no array vars were found.
 */
function _tryPreExpandJS(code) {
  const lines = code.split('\n');
  const vars = {};           // name → JS array value
  const varLineSet = new Set(); // indices of var-declaration lines to skip

  // ── Pass 1: collect array variable declarations ────────────────────────
  // Supports both single-line and multi-line (indented) array literals.
  let li = 0;
  while (li < lines.length) {
    const t = lines[li].trim();

    // Single-line: const NAME = [ ... ];
    const singleM = t.match(/^(?:const|let|var)\s+(\w+)\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
    if (singleM) {
      try {
        const parsed = JSON.parse(singleM[2]);
        if (Array.isArray(parsed)) { vars[singleM[1]] = parsed; varLineSet.add(li); }
      } catch { /* not pure JSON — skip */ }
      li++; continue;
    }

    // Multi-line start: const NAME = [
    const mlM = t.match(/^(?:const|let|var)\s+(\w+)\s*=\s*\[/);
    if (mlM && !singleM) {
      const startLi = li;
      const parts = [t];
      let depth = (t.match(/\[/g)||[]).length - (t.match(/\]/g)||[]).length;
      li++;
      while (li < lines.length && depth > 0) {
        const bl = lines[li].trim();
        parts.push(bl);
        varLineSet.add(li);
        for (const ch of bl) { if (ch === '[') depth++; else if (ch === ']') depth--; }
        li++;
      }
      varLineSet.add(startLi);
      // Extract and parse the array portion
      const full = parts.join(' ');
      const arrM = full.match(/=\s*(\[[\s\S]*\])/);
      if (arrM) {
        try {
          const parsed = JSON.parse(arrM[1]);
          if (Array.isArray(parsed)) vars[mlM[1]] = parsed;
        } catch { /* skip */ }
      }
      continue;
    }

    li++;
  }

  if (Object.keys(vars).length === 0) return null; // nothing to expand

  // ── Substitute NAME[idx1][idx2] or NAME[idx1] with literal values ──────
  function substVars(line, loopBindings) {
    return line.replace(/\b([A-Za-z_]\w*)\[([^\]]+)\](?:\[(\d+)\])?/g,
      (match, name, idx1Str, idx2Str) => {
        if (!(name in vars)) return match;
        const arr = vars[name];
        const idx1 = idx1Str.trim();
        let i1;
        if (/^\d+$/.test(idx1)) {
          i1 = parseInt(idx1, 10);
        } else if (loopBindings && idx1 in loopBindings) {
          i1 = loopBindings[idx1];
        } else {
          return match; // unresolvable index
        }
        if (i1 < 0 || i1 >= arr.length) return match;
        if (idx2Str !== undefined) {
          const i2 = parseInt(idx2Str, 10);
          if (!Array.isArray(arr[i1]) || i2 < 0 || i2 >= arr[i1].length) return match;
          return String(arr[i1][i2]);
        } else {
          if (Array.isArray(arr[i1])) return match; // element is sub-array
          return String(arr[i1]);
        }
      }
    );
  }

  // ── Pass 2: expand lines ───────────────────────────────────────────────
  const output = [];
  li = 0;
  while (li < lines.length) {
    if (varLineSet.has(li)) { li++; continue; } // skip var declarations

    const rawLine = lines[li];
    const t = rawLine.trim();
    if (!t) { li++; continue; }

    // for (let/var/const VAR = START; VAR < ARRNAME.length; VAR++) {
    // Note: allow optional spaces around the dot (e.g. "pts. length" from LLM output)
    const forM = t.match(
      /^for\s*\(\s*(?:let|var|const)\s+(\w+)\s*=\s*(\d+)\s*;\s*\w+\s*[<]=?\s*(\w+)\s*\.\s*length\s*;\s*\w+\+\+\s*\)\s*\{$/
    );
    if (forM && forM[3] in vars) {
      const loopVar  = forM[1];
      const startIdx = parseInt(forM[2], 10);
      const arrName  = forM[3];
      const arr      = vars[arrName];

      // Collect loop body until matching closing }
      const bodyLines = [];
      let depth = 1;
      li++;
      while (li < lines.length && depth > 0) {
        const bl = lines[li].trim();
        for (const ch of bl) { if (ch === '{') depth++; else if (ch === '}') depth--; }
        if (depth > 0 && bl) bodyLines.push(bl);
        li++;
      }
      // Unroll: emit body once per array element from startIdx to end
      for (let idx = startIdx; idx < arr.length; idx++) {
        for (const bLine of bodyLines) {
          output.push(substVars(bLine, { [loopVar]: idx }));
        }
      }
      continue;
    }

    // Regular line: substitute any direct array accesses (e.g., pts[0][0])
    output.push(substVars(t, null));
    li++;
  }

  return output.join('\n');
}

/**
 * Attempt to reverse-parse manually-edited JS back into Blockly blocks.
 * Handles control flow: for loops, while(true), if/else, plus all toio statements.
 * On success: clears workspace, loads new blocks, returns true.
 * On failure: returns false (caller keeps the JS override unchanged).
 */
function tryParseJSToBlocks(code) {
  if (!workspace || !code || !code.trim()) return false;

  // ── Pre-expand array variables and unroll array-indexed loops ────────────
  // This lets us parse LLM-generated code that uses array variables and
  // for-loops over arrays (e.g. const pts=[...]; for(let i=0;i<pts.length;i++))
  const expandedCode = _tryPreExpandJS(code);
  if (expandedCode && expandedCode.trim()) {
    code = expandedCode;
  }

  // ── XML helpers ─────────────────────────────────────────────────────────
  const esc = (s) => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const numBlk = (v) => `<block type="math_number"><field name="NUM">${esc(v)}</field></block>`;
  const boolBlk = `<block type="logic_boolean"><field name="BOOL">TRUE</field></block>`;

  /** Serialise one tree node to a complete `<block>…</block>` XML string. */
  function nodeToXml(node) {
    if (node.ctrlType === 'leaf') {
      const d = node.def;
      let s = `<block type="${esc(d.type)}">`;
      Object.entries(d.fields        || {}).forEach(([n,v]) => { s += `<field name="${esc(n)}">${esc(v)}</field>`; });
      Object.entries(d.values        || {}).forEach(([n,v]) => { s += `<value name="${esc(n)}">${numBlk(v)}</value>`; });
      Object.entries(d.string_values || {}).forEach(([n,v]) => { s += `<value name="${esc(n)}"><block type="text"><field name="TEXT">${esc(v)}</field></block></value>`; });
      return s + '</block>';
    }
    if (node.ctrlType === 'repeat') {
      const inner = chainXml(node.children);
      let s = `<block type="controls_repeat_ext">`;
      s += `<value name="TIMES">${numBlk(node.times)}</value>`;
      if (inner) s += `<statement name="DO">${inner}</statement>`;
      return s + '</block>';
    }
    if (node.ctrlType === 'while') {
      const inner = chainXml(node.children);
      let s = `<block type="controls_whileUntil"><field name="MODE">WHILE</field>`;
      s += `<value name="BOOL">${boolBlk}</value>`;
      if (inner) s += `<statement name="DO">${inner}</statement>`;
      return s + '</block>';
    }
    if (node.ctrlType === 'if') {
      const inner     = chainXml(node.children);
      const elseInner = chainXml(node.elseChildren || []);
      const mut = elseInner ? '<mutation else="1"></mutation>' : '';
      let s = `<block type="controls_if">${mut}`;
      s += `<value name="IF0">${boolBlk}</value>`;
      if (inner)     s += `<statement name="DO0">${inner}</statement>`;
      if (elseInner) s += `<statement name="ELSE">${elseInner}</statement>`;
      return s + '</block>';
    }
    return '';
  }

  /**
   * Chain an array of nodes right-to-left using Blockly's <next> pattern.
   * Returns a complete XML string for the whole chain, or '' if empty.
   */
  function chainXml(nodes) {
    const parts = nodes.map(nodeToXml).filter(Boolean);
    if (parts.length === 0) return '';
    let xml = parts[parts.length - 1];
    for (let i = parts.length - 2; i >= 0; i--) {
      xml = parts[i].replace(/<\/block>$/, `<next>${xml}</next></block>`);
    }
    return xml;
  }

  // ── Tree-building parser ─────────────────────────────────────────────────
  const ROOT = { ctrlType: 'root', children: [], elseChildren: [], inElse: false };
  const stack = [ROOT];
  const wsCommentLines = [];
  const unparseableLines = []; // 1-based line numbers that couldn't be converted

  const rawLines = code.split('\n');
  for (let rawLineIdx = 0; rawLineIdx < rawLines.length; rawLineIdx++) {
    const rawLine = rawLines[rawLineIdx];
    const line = rawLine.trim();
    if (!line) continue;

    const top    = stack[stack.length - 1];
    const target = (top.inElse) ? top.elseChildren : top.children;

    // ── Comment ─────────────────────────────────────────────────────────
    if (line.startsWith('//')) {
      let text = line
        .replace(/^\/\/\s?/, '')
        .replace(/\s*\/\/\s*@\(\s*-?\d+\s*,\s*-?\d+\s*\)\s*$/, '')
        .replace(/\s*@\(\s*-?\d+\s*,\s*-?\d+\s*\)\s*$/, '')
        .replace(/^===+\s*(.*?)\s*===+$/, '$1')
        .trim();
      if (text) wsCommentLines.push(text);
      continue;
    }

    // ── Closing brace: } or }); ──────────────────────────────────────────
    if (/^\}\s*;?\s*$/.test(line)) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // ── } else { ────────────────────────────────────────────────────────
    if (/^\}\s*else\s*\{$/.test(line)) {
      if (stack.length > 1 && stack[stack.length - 1].ctrlType === 'if') {
        stack[stack.length - 1].inElse = true;
      }
      continue;
    }

    // ── for (let/var/const x = 0; x < N; x++) { ─────────────────────────
    {
      const m = line.match(/^for\s*\(\s*(?:let|var|const)\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*(\d+(?:\.\d+)?)\s*;\s*\w+\+\+\s*\)\s*\{$/);
      if (m) {
        const node = { ctrlType: 'repeat', times: m[1], children: [], elseChildren: [], inElse: false };
        target.push(node);
        stack.push(node);
        continue;
      }
    }

    // ── while (...) { ───────────────────────────────────────────────────
    {
      const m = line.match(/^while\s*\(.+\)\s*\{$/);
      if (m) {
        const node = { ctrlType: 'while', children: [], elseChildren: [], inElse: false };
        target.push(node);
        stack.push(node);
        continue;
      }
    }

    // ── if (...) { ──────────────────────────────────────────────────────
    {
      const m = line.match(/^if\s*\(.+\)\s*\{$/);
      if (m) {
        const node = { ctrlType: 'if', children: [], elseChildren: [], inElse: false };
        target.push(node);
        stack.push(node);
        continue;
      }
    }

    // ── Simple toio statement ────────────────────────────────────────────
    const def = _parseToioStatement(line);
    if (!def) {
      console.warn('[JS→Blocks] unrecognised line (skipped):', line);
      // Record 1-based line number for error highlighting — don't abort
      unparseableLines.push(rawLineIdx + 1);
      continue;
    }
    target.push({ ctrlType: 'leaf', def });
  }

  if (ROOT.children.length === 0 && wsCommentLines.length === 0) return false;

  // ── Serialise to Blockly XML ─────────────────────────────────────────────
  let bodyXml = chainXml(ROOT.children);
  // Add canvas position to first block
  if (bodyXml) bodyXml = bodyXml.replace(/^<block /, '<block x="50" y="50" ');

  let commentXml = '';
  if (wsCommentLines.length > 0) {
    const txt = esc(wsCommentLines.join('\n'));
    commentXml = `<comment x="360" y="50" w="220" h="${Math.max(60, wsCommentLines.length * 22)}">${txt}</comment>`;
  }

  const xml = `<xml xmlns="https://developers.google.com/blockly/xml">${bodyXml}${commentXml}</xml>`;

  try {
    // Support both Blockly v9+ (utils.xml) and older compat API
    const parseDom = Blockly.utils?.xml?.textToDom || Blockly.Xml?.textToDom;
    if (!parseDom) throw new Error('Blockly XML API not found');
    const dom = parseDom(xml);
    workspace.clear();
    Blockly.Xml.domToWorkspace(dom, workspace);
    // Return true on full success, or the unparseable line numbers for partial conversion
    return unparseableLines.length === 0 ? true : { partial: true, errorLines: unparseableLines };
  } catch (e) {
    console.warn('[JS→Blocks] XML load/parse failed:', e, '\nXML was:\n', xml);
    return false;
  }
}

// ─── Code generation with inline workspace comments ──────────────────────────

/**
 * Generate code for the workspace, interleaving workspace-level comments at
 * their Y-coordinate positions among the top-level blocks.  Block comments
 * (attached to individual blocks) are still handled by the scrub_ patches.
 */
function generateCodeWithInlineComments(ws, lang) {
  const isJS  = lang === 'javascript';
  const generator = isJS ? Blockly.JavaScript
    : (typeof Blockly.Python !== 'undefined' ? Blockly.Python : null);
  if (!generator) return isJS ? '// Python not available' : '# Python not available';
  const prefix = isJS ? '// ' : '# ';

  // Collect workspace comments sorted by canvas Y
  const wsComments = [];
  try {
    (ws.getTopComments ? ws.getTopComments(false) : []).forEach(c => {
      const text = (typeof c.getText === 'function' ? c.getText() :
                    typeof c.getContent === 'function' ? c.getContent() : '').trim();
      if (!text) return;
      const pos = c.getRelativeToSurfaceXY ? c.getRelativeToSurfaceXY() : { y: 0 };
      wsComments.push({ y: pos.y, text });
    });
    wsComments.sort((a, b) => a.y - b.y);
  } catch(_e) {}

  // Fast path — no workspace comments, use normal generation
  if (wsComments.length === 0) {
    if (isJS) {
      return Blockly.JavaScript.workspaceToCode(ws) || '// Add blocks to generate code';
    } else {
      const body = generator.workspaceToCode(ws);
      return wrapPython(body) || '# Add blocks to generate code';
    }
  }

  // Slow path — interleave workspace comments into the block stream by Y position
  try {
    if (typeof generator.init === 'function') generator.init(ws);

    const topBlocks = ws.getTopBlocks(true)
      .map(b => ({ type: 'block', y: (b.getRelativeToSurfaceXY?.() || { y: 0 }).y, block: b }))
      .sort((a, b) => a.y - b.y);

    const items = [
      ...topBlocks,
      ...wsComments.map(c => ({ type: 'wscomment', y: c.y, text: c.text }))
    ].sort((a, b) => a.y - b.y);

    const parts = [];
    for (const item of items) {
      if (item.type === 'wscomment') {
        // Format workspace comment lines with appropriate comment prefix
        const lines = item.text.split('\n').map(l => prefix + l).join('\n');
        parts.push(lines);
      } else {
        const blockCode = generator.blockToCode(item.block);
        if (blockCode && blockCode.trim()) parts.push(blockCode.trim());
      }
    }

    const combinedBody = parts.join('\n\n');

    if (isJS) {
      const finalCode = typeof generator.finish === 'function'
        ? generator.finish(combinedBody) : combinedBody;
      return finalCode || '// Add blocks to generate code';
    } else {
      return wrapPython(combinedBody) || '# Add blocks to generate code';
    }
  } catch(e) {
    // Fallback to plain generation if per-block API is unavailable
    try {
      if (isJS) return Blockly.JavaScript.workspaceToCode(ws) || '// Add blocks to generate code';
      return wrapPython(generator.workspaceToCode(ws)) || '# Add blocks to generate code';
    } catch(e2) {
      return isJS ? `// Code generation error: ${e2.message}` : `# Code generation error: ${e2.message}`;
    }
  }
}

// ─── Code panel ──────────────────────────────────────────────────────────────

function updateCodePanel() {
  if (!workspace) return;
  let codeText = '';
  try {
    codeText = generateCodeWithInlineComments(workspace, activeLang);
  } catch(e) {
    codeText = activeLang === 'javascript'
      ? `// Code generation error: ${e.message}`
      : `# Code generation error: ${e.message}`;
  }

  // Override applies per-language
  const overrideActive =
    (activeLang === 'javascript' && _codeOverride !== null) ||
    (activeLang === 'python'     && _pythonOverride !== null);
  const overrideText = activeLang === 'python' ? _pythonOverride : _codeOverride;

  // Remove any old overlay div (replaced by inline comments)
  const oldOverlay = document.getElementById('ws-code-comments-overlay');
  if (oldOverlay) oldOverlay.remove();

  // Update the editable code pre
  if (!_codeEditMode) {
    const wsCodeOut = document.getElementById('ws-code-output');
    if (wsCodeOut) {
      if (overrideActive) {
        wsCodeOut.textContent = overrideText;
        wsCodeOut.classList.add('code-override');
      } else {
        wsCodeOut.textContent = codeText;
        wsCodeOut.classList.remove('code-override');
        wsCodeOut.style.backgroundImage = ''; // clear any error highlight
      }
    }
  }
  // Hidden code-output (for LLM / HTML export)
  const out = document.getElementById('code-output');
  if (out) out.textContent = overrideActive ? overrideText : codeText;
}

// ─── Bottom tabs ─────────────────────────────────────────────────────────────

function switchBottomTab(tab) {
  // Bottom panel now only has llm + console
  document.querySelectorAll('#bottom-tabs .ptab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#bottom-panel .panel-content').forEach(c =>
    c.classList.toggle('active', c.id === `tab-${tab}`));
}

// ─── LLM chat ────────────────────────────────────────────────────────────────

async function sendLLMMessage() {
  const input = document.getElementById('llm-input');
  const text  = input.value.trim();
  if (!text) return;

  // ── API key check: expand + flash the settings area ─────────────────────
  if (!llmClient.apiKey) {
    const area   = document.getElementById('llm-api-area');
    const toggle = document.getElementById('btn-api-toggle');
    const keyIn  = document.getElementById('llm-api-key');
    if (area && area.classList.contains('collapsed')) {
      area.classList.remove('collapsed');
      if (toggle) { toggle.textContent = '▼'; toggle.title = 'API設定を閉じる'; }
    }
    // Flash highlight the API area and key input
    if (area) {
      area.classList.remove('api-key-flash');
      // Force reflow to restart animation
      void area.offsetWidth;
      area.classList.add('api-key-flash');
      setTimeout(() => area.classList.remove('api-key-flash'), 1400);
    }
    if (keyIn) keyIn.focus();
    return; // Don't proceed without a key
  }

  input.value = '';
  addLLMMessage('user', text);

  // Apply code style + current mat context if buildSystemPrompt is available
  const styleEl = document.getElementById('llm-code-style');
  if (styleEl && typeof window.buildSystemPrompt === 'function') {
    const matCfg = (typeof sim !== 'undefined' && sim._matCfg) ? sim._matCfg : null;
    llmClient._systemPromptOverride = window.buildSystemPrompt(styleEl.value, matCfg);
  }

  const btn = document.getElementById('btn-llm-send');
  btn.disabled = true;
  const sendIcon = btn.innerHTML;
  btn.innerHTML = '...';

  await llmClient.send(text);

  btn.disabled = false;
  btn.innerHTML = sendIcon;
}

function addLLMMessage(role, text) {
  const container = document.getElementById('llm-messages');
  const div = document.createElement('div');
  div.className = `llm-msg ${role}`;

  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const userLabel = currentLang() === 'en' ? 'You' : currentLang() === 'zh' ? '你' : 'あなた';

  if (role === 'assistant') {
    const html = escaped
      .replace(/```(?:javascript|js)?\n([\s\S]*?)```/g, '<pre class="code-block">$1</pre>')
      .replace(/\n/g, '<br>');
    div.innerHTML = `<div class="msg-role">AI</div><div class="msg-body">${html}</div>`;
  } else if (role === 'user') {
    div.innerHTML = `<div class="msg-role">${userLabel}</div><div class="msg-body">${escaped}</div>`;
  } else {
    div.innerHTML = `<div class="msg-role">Error</div><div class="msg-body" style="color:var(--danger)">${escaped}</div>`;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addLLMCodeActions(code) {
  const container = document.getElementById('llm-messages');
  const div = document.createElement('div');
  div.className = 'llm-code-actions';
  div.style.cssText = 'display:flex;gap:6px;padding:4px 0 8px;flex-wrap:wrap';
  div.innerHTML =
    `<button class="btn btn-success btn-sm" id="_llm-run-btn">` +
      `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg> ${t('ui.run')}</button>` +
    `<button class="btn btn-primary btn-sm" id="_llm-toblock-btn">` +
      `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">` +
        `<path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3A1.5 1.5 0 0 1 15 10.5v3A1.5 1.5 0 0 1 13.5 15h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg> ` +
      `ブロック／コードに反映</button>`;

  // Run button — execute code directly via runtime
  div.querySelector('#_llm-run-btn').addEventListener('click', async () => {
    updateRunButtons(true);
    await runtime.run(code);
    updateRunButtons(false);
  });

  // "ブロック／コードに反映" button — try to apply code to workspace
  div.querySelector('#_llm-toblock-btn').addEventListener('click', () => {
    _applyLLMCode(code);
  });

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/**
 * Apply AI-generated JS code to the workspace.
 * 1. Try to parse it into Blockly blocks (tryParseJSToBlocks).
 * 2. If that fails, set it as a runnable JS override in the code view.
 * Always switches the workspace panel to show the result.
 */
function _applyLLMCode(code) {
  if (!code || !code.trim()) return;

  // Switch left panel to code view so the user can see the result
  const wsCodeBtn = document.getElementById('tab-wscode-btn');
  if (wsCodeBtn) wsCodeBtn.click();

  // Try converting to Blockly blocks
  if (typeof tryParseJSToBlocks === 'function') {
    const parsed = tryParseJSToBlocks(code);
    if (parsed === true) {
      // Full success — blocks updated; ensure JS lang tab is active
      activeLang = 'javascript';
      if (typeof updateCodePanel === 'function') updateCodePanel();
      if (typeof updateBlocksOverrideNotice === 'function') updateBlocksOverrideNotice();
      log(t('ui.codeAppliedToBlocks') || 'AIコードをブロックに反映しました ✓', 'info');
      document.getElementById('tab-blocks-btn')?.click();
      return;
    }
    if (parsed && parsed.partial) {
      // Partial success — converted what we could; highlight error lines
      activeLang = 'javascript';
      if (typeof updateCodePanel === 'function') updateCodePanel();
      if (typeof updateBlocksOverrideNotice === 'function') updateBlocksOverrideNotice();
      const pre = document.getElementById('ws-code-output');
      if (pre) {
        const lineH = parseFloat(getComputedStyle(pre).lineHeight) || 19;
        const padT  = parseFloat(getComputedStyle(pre).paddingTop)  || 12;
        const bands = parsed.errorLines.map(n => {
          const y1 = Math.round(padT + (n - 1) * lineH);
          const y2 = Math.round(y1 + lineH);
          return `transparent ${y1}px,rgba(255,60,60,.28) ${y1}px,rgba(255,60,60,.28) ${y2}px,transparent ${y2}px`;
        });
        pre.style.backgroundImage = bands.length ? `linear-gradient(to bottom,${bands.join(',')})` : '';
      }
      const n = parsed.errorLines.length;
      log(`⚠ ${n}行をブロックに変換できませんでした（赤ハイライト）— 変換可能な部分はブロックに反映しました`, 'warn');
      document.getElementById('tab-blocks-btn')?.click();
      return;
    }
  }

  // Fallback — set as JS override (runnable even without block conversion)
  _codeOverride = code;
  const pre = document.getElementById('ws-code-output');
  if (pre) {
    pre.textContent = code;
    pre.classList.add('code-override');
  }
  activeLang = 'javascript';
  if (typeof _switchLangTab === 'function') _switchLangTab('javascript');
  if (typeof updateCodePanel === 'function') updateCodePanel();
  if (typeof updateBlocksOverrideNotice === 'function') updateBlocksOverrideNotice();
  if (_showCodeOverrideBanner) _showCodeOverrideBanner(null);
  log((t('ui.codeOverrideOn') || 'AIコードをコードビューに適用しました') + ' — ▶実行ボタンで実行できます', 'info');
}

// ─── Save / Load ─────────────────────────────────────────────────────────────

function saveProgram() {
  // Read project name directly from the inline input field
  const nameField = document.getElementById('project-name');
  const name = nameField ? (nameField.value.trim() || `toio-program-${Date.now()}`) : `toio-program-${Date.now()}`;
  const filename = name + '.xml';
  const xml  = Blockly.Xml.workspaceToDom(workspace);
  const text = Blockly.Xml.domToText(xml);
  const blob = new Blob([text], { type: 'text/xml' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  log(t('ui.save') + ': ' + filename, 'info');
}

function showProjectNameDialog(callback) {
  const overlay = document.createElement('div');
  overlay.className = 'mat-dialog-overlay';
  overlay.style.zIndex = '1500';
  const dlg = document.createElement('div');
  dlg.className = 'mat-dialog';
  dlg.innerHTML = `
    <h3 style="margin-bottom:12px;font-size:.95rem">${t('ui.projectName')}</h3>
    <input type="text" id="_pn-input" placeholder="${t('ui.projectNamePlaceholder') || 'project name'}"
      style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem;outline:none;color:var(--text)">
    <div class="mat-dialog-actions" style="margin-top:12px">
      <button class="btn btn-ghost btn-sm" id="_pn-cancel">${t('ui.matCancel')}</button>
      <button class="btn btn-primary btn-sm" id="_pn-ok">${t('ui.save')}</button>
    </div>
  `;
  overlay.appendChild(dlg);
  document.body.appendChild(overlay);
  const inp = dlg.querySelector('#_pn-input');
  inp.focus();
  const submit = () => { overlay.remove(); callback(inp.value); };
  const cancel = () => { overlay.remove(); callback(null); };
  dlg.querySelector('#_pn-ok').addEventListener('click', submit);
  dlg.querySelector('#_pn-cancel').addEventListener('click', cancel);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
}

function loadProgramFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      workspace.clear();
      Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(ev.target.result), workspace);
      // Set project name from filename (strip .xml extension)
      const nameField = document.getElementById('project-name');
      if (nameField) nameField.value = file.name.replace(/\.xml$/i, '');
      log(file.name + ' loaded', 'info');
    } catch (err) {
      log('Load error: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ─── Console ─────────────────────────────────────────────────────────────────

function log(msg, type) {
  const out  = document.getElementById('console-output');
  const line = document.createElement('div');

  // Auto-classify by message prefix
  let cls = type || 'log';
  if (!type) {
    if (msg.startsWith('▶')) cls = 'start';
    else if (msg.startsWith('✓')) cls = 'done';
    else if (msg.startsWith('■')) cls = 'stop';
    else if (msg.startsWith('✗') || msg.startsWith('⚠')) cls = 'error';
  }

  line.className = `console-line ${cls}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

// ─── Resizable dividers ───────────────────────────────────────────────────────

let _colMin = 280, _colMax = 700;
let _rowMin = 140, _rowMax = 600;

function updateDividerBounds() {
  const main = document.getElementById('main');
  if (!main) return;
  _colMax = main.clientWidth  - 300;
  _rowMax = main.clientHeight - 160;
}

function initDividers() {
  updateDividerBounds();

  // Set responsive initial row-split: ~60% of available main height, capped at 320px,
  // ensuring the bottom panel always gets at least 120px.
  const mainH = document.getElementById('main')?.clientHeight || 400;
  const initialRowSplit = Math.min(320, Math.max(_rowMin, Math.floor(mainH * 0.60)));
  document.documentElement.style.setProperty('--row-split', initialRowSplit + 'px');

  makeDivider(
    document.getElementById('div-v'), 'horizontal',
    val => {
      const c = Math.max(_colMin, Math.min(_colMax, val));
      document.documentElement.style.setProperty('--col-split', c + 'px');
      Blockly.svgResize(workspace);
    },
    () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--col-split')) || 440
  );

  makeDivider(
    document.getElementById('div-h'), 'vertical',
    val => {
      const c = Math.max(_rowMin, Math.min(_rowMax, val));
      document.documentElement.style.setProperty('--row-split', c + 'px');
    },
    () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--row-split')) || 320
  );
}

function makeDivider(el, axis, onValue, getCurrent) {
  if (!el) return;
  let startPos = 0, startVal = 0;

  el.addEventListener('mousedown', e => {
    e.preventDefault();
    startPos = axis === 'horizontal' ? e.clientX : e.clientY;
    startVal = getCurrent();
    el.classList.add('dragging');

    const onMove = ev => {
      if (axis === 'horizontal') {
        onValue(startVal + (startPos - ev.clientX));
      } else {
        onValue(startVal + (ev.clientY - startPos));
      }
    };
    const onUp = () => {
      el.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  });
}

// ─── Floating panels ─────────────────────────────────────────────────────────

const _floatState = {};

function initFloating() {
  document.getElementById('btn-float-sim')?.addEventListener('click', () => {
    toggleFloat('sim-panel', t('ui.simulator'), 300, 60, 460, 360);
  });
  document.getElementById('btn-float-bottom')?.addEventListener('click', () => {
    toggleFloat('bottom-panel', `${t('ui.ai')} / ${t('ui.console')}`, 100, 430, 500, 320);
  });

  // Split view toggle
  const btnSplit = document.getElementById('btn-split-view');
  if (btnSplit) {
    // Restore split state
    const splitSaved = localStorage.getItem('wsSplitView') === '1';
    if (splitSaved) applySplitView(true);

    btnSplit.addEventListener('click', () => {
      const panel = document.getElementById('workspace-panel');
      const isSplit = panel.classList.contains('ws-split');
      applySplitView(!isSplit);
      localStorage.setItem('wsSplitView', !isSplit ? '1' : '0');
    });
  }
}

/** Expand/collapse right column and workspace based on float state */
function _updateRightColLayout() {
  const simFloating    = _floatState['sim-panel']    && _floatState['sim-panel'].floating;
  const bottomFloating = _floatState['bottom-panel'] && _floatState['bottom-panel'].floating;
  const mainEl         = document.getElementById('main');

  if (mainEl) {
    if (simFloating && bottomFloating) {
      // Both panels floated → CSS hides right-col and expands workspace
      mainEl.classList.add('right-col-hidden');
    } else {
      mainEl.classList.remove('right-col-hidden');
    }
  }
  setTimeout(() => Blockly.svgResize(workspace), 100);
}

function applySplitView(split) {
  const panel      = document.getElementById('workspace-panel');
  const blocksView = document.getElementById('ws-blocks-view');
  const codeView   = document.getElementById('ws-code-view');
  const btn        = document.getElementById('btn-split-view');

  if (split) {
    panel.classList.add('ws-split');
    blocksView.style.display = '';
    codeView.style.display   = '';
    if (btn) { btn.classList.add('active'); btn.title = '分割表示を解除'; }
    setTimeout(() => Blockly.svgResize(workspace), 80);
  } else {
    panel.classList.remove('ws-split');
    // Restore tab visibility
    const blocksActive = document.getElementById('tab-blocks-btn')?.classList.contains('active');
    blocksView.style.display = blocksActive ? '' : 'none';
    codeView.style.display   = blocksActive ? 'none' : '';
    if (btn) { btn.classList.remove('active'); btn.title = '並列表示'; }
    setTimeout(() => Blockly.svgResize(workspace), 80);
  }
}

function toggleFloatPane(viewId, title, left, top, width, height) {
  const state = _floatState[viewId];
  if (state && state.floating) {
    dockPane(viewId);
  } else {
    floatPane(viewId, title, left, top, width, height);
  }
}

function floatPane(viewId, title, left, top, width, height) {
  const view = document.getElementById(viewId);
  if (!view) return;

  // Force visible before floating
  const prevDisplay = view.style.display;
  view.style.display = '';

  const placeholder = document.createElement('div');
  placeholder.id = viewId + '-ph';
  placeholder.style.cssText = 'display:none;';
  view.parentNode.insertBefore(placeholder, view);

  const win = document.createElement('div');
  win.className = 'floating-win';
  win.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;`;

  const header = document.createElement('div');
  header.className = 'floating-win-header';
  header.innerHTML =
    `<span class="fwin-title">${title}</span>` +
    `<span class="fwin-actions"><button class="fwin-btn" data-action="dock">${t('ui.dock')}</button></span>`;

  const body = document.createElement('div');
  body.className = 'floating-win-body';

  win.appendChild(header); win.appendChild(body);
  document.body.appendChild(win);
  body.appendChild(view);
  view.style.height = '100%'; view.style.flex = '1'; view.style.display = '';

  makeDraggable(header, win);
  header.querySelector('[data-action="dock"]').addEventListener('click', () => dockPane(viewId));

  _floatState[viewId] = { floating: true, win, placeholder, prevDisplay };
  setTimeout(() => Blockly.svgResize(workspace), 80);
}

function dockPane(viewId) {
  const state = _floatState[viewId];
  if (!state || !state.floating) return;
  const { win, placeholder, prevDisplay } = state;
  const view = document.getElementById(viewId);
  placeholder.parentNode.insertBefore(view, placeholder);
  placeholder.remove();
  view.style.height = ''; view.style.flex = '';
  // Restore visibility based on active tab
  if (viewId === 'ws-blocks-view') {
    view.style.display = document.getElementById('tab-blocks-btn')?.classList.contains('active') ? '' : 'none';
  } else if (viewId === 'ws-code-view') {
    view.style.display = document.getElementById('tab-wscode-btn')?.classList.contains('active') ? '' : 'none';
  } else {
    view.style.display = prevDisplay || '';
  }
  win.remove();
  _floatState[viewId] = { floating: false };
  setTimeout(() => Blockly.svgResize(workspace), 60);
  setTimeout(() => Blockly.svgResize(workspace), 200);
}

function toggleFloat(panelId, title, left, top, width, height) {
  const state = _floatState[panelId];
  if (state && state.floating) dockPanel(panelId);
  else floatPanel(panelId, title, left, top, width, height);
}

function floatPanel(panelId, title, left, top, width, height) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const placeholder = document.createElement('div');
  placeholder.id = panelId + '-placeholder';
  placeholder.style.cssText = 'flex-shrink:0;';
  if (panelId === 'sim-panel') {
    placeholder.style.height = getComputedStyle(document.documentElement).getPropertyValue('--row-split');
  } else {
    placeholder.style.flex = '1';
  }
  panel.parentNode.insertBefore(placeholder, panel);

  const win = document.createElement('div');
  win.className = 'floating-win';
  win.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;`;

  const header = document.createElement('div');
  header.className = 'floating-win-header';
  header.innerHTML =
    `<span class="fwin-title">${title}</span>` +
    `<span class="fwin-actions"><button class="fwin-btn" data-action="dock">${t('ui.dock')}</button></span>`;

  const body = document.createElement('div');
  body.className = 'floating-win-body';

  win.appendChild(header); win.appendChild(body);
  document.body.appendChild(win);
  body.appendChild(panel);
  panel.style.height = '100%'; panel.style.flex = '1';

  makeDraggable(header, win);
  header.querySelector('[data-action="dock"]').addEventListener('click', () => dockPanel(panelId));

  _floatState[panelId] = { floating: true, win, placeholder };
  _updateRightColLayout();
  setTimeout(() => Blockly.svgResize(workspace), 100);
}

function dockPanel(panelId) {
  const state = _floatState[panelId];
  if (!state || !state.floating) return;
  const { win, placeholder } = state;
  const panel = document.getElementById(panelId);
  placeholder.parentNode.insertBefore(panel, placeholder);
  placeholder.remove();
  panel.style.height = ''; panel.style.flex = '';
  win.remove();
  _floatState[panelId] = { floating: false };
  _updateRightColLayout();
  // Resize Blockly after docking to fix zoom controls
  setTimeout(() => { Blockly.svgResize(workspace); }, 60);
  setTimeout(() => { Blockly.svgResize(workspace); }, 200);
}

function makeDraggable(handle, win) {
  let ox = 0, oy = 0, dragging = false;
  handle.addEventListener('mousedown', e => {
    dragging = true; ox = e.clientX - win.offsetLeft; oy = e.clientY - win.offsetTop; win.style.zIndex = 600;
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    win.style.left = (e.clientX - ox) + 'px'; win.style.top = (e.clientY - oy) + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; });
}

// ─── Left-panel code view ─────────────────────────────────────────────────────

function initWsCodeTab() {
  // Language toggle buttons in the LEFT panel code toolbar
  document.querySelectorAll('#ws-code-toolbar .lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ws-code-toolbar .lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeLang = btn.dataset.lang;
      updateCodePanel();
      // Show/hide HTML button (JS only)
      const htmlBtn = document.getElementById('btn-ws-html');
      if (htmlBtn) htmlBtn.style.display = activeLang === 'javascript' ? '' : 'none';
      // Edit button: hidden on pseudo-Python (read-only)
      const editBtnEl = document.getElementById('btn-ws-edit');
      if (editBtnEl) editBtnEl.style.display = activeLang === 'javascript' ? '' : 'none';
      // Update export label
      const lbl = document.getElementById('ws-export-label');
      if (lbl) lbl.dataset.i18n = activeLang === 'javascript' ? 'ui.exportJs' : 'ui.exportPy';
      if (lbl) lbl.textContent = t(activeLang === 'javascript' ? 'ui.exportJs' : 'ui.exportPy');
    });
  });

  // Copy button in left panel
  document.getElementById('btn-ws-copy')?.addEventListener('click', () => {
    const code = document.getElementById('ws-code-output')?.textContent || '';
    navigator.clipboard.writeText(code).then(() => log(t('ui.copy') + ' OK', 'info'));
  });

  // Export (download code file) button
  document.getElementById('btn-ws-export')?.addEventListener('click', async () => {
    const code = document.getElementById('ws-code-output')?.textContent || '';
    if (activeLang === 'javascript') {
      // JS: single .js file
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = 'toio-program.js';
      a.click();
      log(`JavaScript ${t('ui.save')} OK`, 'info');
    } else {
      // Python: ZIP with main.py + toio_helpers.py + README.txt
      if (typeof JSZip === 'undefined') {
        log('JSZip not loaded — cannot create ZIP', 'error');
        return;
      }
      const zip = new JSZip();
      zip.file('main.py',         code);
      zip.file('toio_helpers.py', buildPythonHelpers());
      zip.file('README.txt',      buildPythonReadme());
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = 'toio-program.zip';
      a.click();
      log(`Python ZIP ${t('ui.save')} OK  (main.py + toio_helpers.py + README.txt)`, 'info');
    }
  });

  // HTML save button (JS only)
  document.getElementById('btn-ws-html')?.addEventListener('click', downloadStandaloneHTML);

  // Sync old bottom-panel copy button if it exists
  document.getElementById('btn-copy-code')?.addEventListener('click', () => {
    const code = document.getElementById('ws-code-output')?.textContent || '';
    navigator.clipboard.writeText(code).then(() => log(t('ui.copy') + ' OK', 'info'));
  });
}

// ─── Trashcan scale ──────────────────────────────────────────────────────────
// CSS transform on .blocklyTrash overrides Blockly's SVG position attribute.
// Instead we intercept the attribute, remove it, and re-apply as CSS so we can
// scale while keeping the Blockly-set position intact.

function initTrashcanScale() {
  const SCALE = 0.55;
  const TRASH_NATIVE_W = 47;  // Blockly default trashcan SVG width (approx)
  let _busy = false;

  const apply = (el) => {
    if (_busy) return;
    const attr = el.getAttribute('transform') || '';
    const m    = attr.match(/translate\(\s*([^,\s)]+)[,\s]+([^)\s]+)\s*\)/);
    if (!m) return;
    _busy = true;
    const tx = parseFloat(m[1]), ty = parseFloat(m[2]);
    el.removeAttribute('transform');

    // Align trashcan centre-X with the zoom controls centre-X
    let finalTx = tx;
    const zoomEl = document.querySelector('.blocklyZoom');
    if (zoomEl) {
      const za = zoomEl.getAttribute('transform') || zoomEl.style.transform || '';
      const zm = za.match(/translate\(\s*([^,\s)]+)/);
      if (zm) {
        // Zoom buttons are ~16 px wide circles; their visual centre ≈ their translate-X + 8
        const zoomCenterX = parseFloat(zm[1]) + 8;
        // Centre the scaled trashcan at the same X
        finalTx = zoomCenterX - (TRASH_NATIVE_W * SCALE) / 2;
      }
    }

    el.style.transform       = `translate(${finalTx}px,${ty}px) scale(${SCALE})`;
    el.style.transformOrigin = '0 0';
    _busy = false;
  };

  const waitForTrash = () => {
    const el = document.querySelector('.blocklyTrash');
    if (!el) { setTimeout(waitForTrash, 200); return; }
    apply(el);
    new MutationObserver(() => apply(el))
      .observe(el, { attributes: true, attributeFilter: ['transform'] });
  };

  waitForTrash();
}

// ─── Editable code panel ─────────────────────────────────────────────────────

let _codeOverride    = null;
let _pythonOverride  = null;   // manually-edited Python code (separate from JS override)
let _codeEditMode    = false;
let _editingLang     = 'javascript'; // which lang was active when Edit was clicked
let _showCodeOverrideBanner = null;  // assigned by initCodeEdit; used by addLLMCodeActions

// ── Undo / Redo stack for the code editor ──────────────────────────────────
let _codeUndoStack   = [];   // past snapshots (oldest first)
let _codeRedoStack   = [];   // future snapshots for redo
let _codeLastContent = '';   // content just before last tracked change
let _codeUndoLock    = false; // prevent re-entry during undo/redo restore

function initCodeEdit() {
  const pre       = document.getElementById('ws-code-output');
  const editBtn   = document.getElementById('btn-ws-edit');
  const applyBtn  = document.getElementById('btn-ws-apply');
  const cancelBtn = document.getElementById('btn-ws-cancel');
  if (!pre || !editBtn) return;

  // Pre must not be auto-spellchecked
  pre.setAttribute('spellcheck', 'false');
  pre.setAttribute('autocorrect', 'off');

  // Push a snapshot whenever the user makes a change
  pre.addEventListener('input', () => {
    if (!_codeEditMode || _codeUndoLock) return;
    _codeUndoStack.push(_codeLastContent);   // save state before this change
    _codeLastContent = pre.textContent;
    _codeRedoStack = [];                     // new edit invalidates redo history
    if (_codeUndoStack.length > 200) _codeUndoStack.shift();
  });

  /** Restore content to `text` without affecting undo/redo stacks. */
  const _restoreContent = (text) => {
    _codeUndoLock = true;
    pre.textContent = text;
    _codeLastContent = text;
    // Place cursor at end
    try {
      const range = document.createRange();
      range.selectNodeContents(pre);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
    _codeUndoLock = false;
  };

  const enterEdit = () => {
    _codeEditMode = true;
    // Reset undo/redo stacks for this editing session
    _codeUndoStack   = [];
    _codeRedoStack   = [];
    _codeLastContent = pre.textContent;
    try { pre.contentEditable = 'plaintext-only'; }
    catch { pre.contentEditable = 'true'; }
    editBtn.classList.add('active');
    applyBtn.style.display  = '';
    cancelBtn.style.display = '';
    pre.focus();
    // Place cursor at end
    const range = document.createRange();
    range.selectNodeContents(pre);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const clearOverride = () => {
    _codeOverride   = null;
    _pythonOverride = null;
    pre.classList.remove('code-override');
    pre.style.backgroundImage = ''; // clear error-line highlight
    const banner = document.getElementById('code-override-banner');
    if (banner) banner.remove();
    updateCodePanel();
    updateBlocksOverrideNotice();
  };

  const showOverrideBanner = (syntaxError) => {
    let banner = document.getElementById('code-override-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'code-override-banner';
      banner.className = 'code-override-banner';
      const codeView = document.getElementById('ws-code-view');
      if (codeView) codeView.insertBefore(banner, codeView.querySelector('#ws-code-toolbar')?.nextSibling || codeView.firstChild);
    }
    window.clearCodeOverride = clearOverride;
    if (syntaxError) {
      // Build QuickFix suggestions based on the error
      const fixes = _buildQuickFixes(syntaxError, pre);
      const fixBtns = fixes.map(f =>
        `<button class="qf-btn" data-qf="${f.id}">${f.label}</button>`
      ).join('');
      banner.className = 'code-override-banner code-override-error';
      banner.innerHTML =
        `<span class="code-err-icon" title="${syntaxError.replace(/"/g,'&quot;')}">!</span>` +
        `<span class="err-msg">${t('ui.codeEditSyntaxError') || '構文エラー'}: <code>${syntaxError.split('\n')[0]}</code></span>` +
        fixBtns +
        `<button onclick="clearCodeOverride()" class="qf-btn qf-revert">${t('ui.codeEditClear') || 'ブロックに戻す'}</button>`;
      // Wire QuickFix buttons after DOM insert
      setTimeout(() => {
        fixes.forEach(f => {
          banner.querySelector(`[data-qf="${f.id}"]`)
               ?.addEventListener('click', () => f.apply());
        });
      }, 0);
    } else {
      banner.className = 'code-override-banner';
      banner.innerHTML =
        `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>` +
        `<span>${t('ui.codeEditApplied') || 'コードを保存しました'}</span>` +
        `<button onclick="clearCodeOverride()">${t('ui.codeEditClear') || 'ブロックに戻す'}</button>`;
    }
  };

  // ── QuickFix builder ──────────────────────────────────────────────────────
  const _buildQuickFixes = (errMsg, targetPre) => {
    const fixes = [];
    const code  = targetPre ? targetPre.textContent : (_codeOverride || '');

    // Fix: await in non-async context → this shouldn't happen after our check,
    // but handle the edge case of a user typing raw code without our runtime wrapper
    if (/await/i.test(errMsg) && /async/.test(errMsg)) {
      fixes.push({
        id: 'wrap-async',
        label: '⚡ async でラップ',
        apply: () => {
          const wrapped = `(async () => {\n${code}\n})();`;
          targetPre.textContent = wrapped;
          _codeOverride = wrapped;
          showOverrideBanner(null);
          updateCodePanel();
        },
      });
    }

    // Fix: unclosed brace/paren — offer to auto-close
    const opens  = (code.match(/\{/g) || []).length;
    const closes = (code.match(/\}/g) || []).length;
    if (opens > closes) {
      const missing = '}\n'.repeat(opens - closes);
      fixes.push({
        id: 'close-brace',
        label: `⚡ } を補完 (+${opens - closes})`,
        apply: () => {
          const fixed = code.trimEnd() + '\n' + missing;
          targetPre.textContent = fixed;
          _codeOverride = fixed;
          let err2 = null;
          try { new Function(`return async function(){\n${fixed}\n}`); } catch(e) { err2 = e.message; }
          showOverrideBanner(err2);
          updateCodePanel();
        },
      });
    }

    return fixes;
  };

  // ── Error line highlighting ───────────────────────────────────────────────
  const _highlightErrorLine = (errObj) => {
    pre.style.backgroundImage = '';
    if (!errObj) return;
    // Parse line number from error stack (V8: <anonymous>:LINE:COL)
    const m = (errObj.stack || '').match(/<anonymous>:(\d+):/);
    if (!m) return;
    // Line 1 of the async wrapper = "return async function(){"  so subtract 1
    const lineNum = parseInt(m[1]) - 1;
    if (lineNum < 1) return;
    const lineH = parseFloat(getComputedStyle(pre).lineHeight) || 19;
    const padT  = parseFloat(getComputedStyle(pre).paddingTop)  || 12;
    const y1 = Math.round(padT + (lineNum - 1) * lineH);
    const y2 = Math.round(y1 + lineH);
    pre.style.backgroundImage =
      `linear-gradient(to bottom,transparent ${y1}px,rgba(255,60,60,.22) ${y1}px,rgba(255,60,60,.22) ${y2}px,transparent ${y2}px)`;
  };

  /** Helper: switch the lang-tab buttons to a given language. */
  const _switchLangTab = (lang) => {
    activeLang = lang;
    document.querySelectorAll('#ws-code-toolbar .lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    // Edit button only available on JavaScript (Pseudo-Python is read-only)
    const _editBtnEl = document.getElementById('btn-ws-edit');
    if (_editBtnEl) _editBtnEl.style.display = lang === 'javascript' ? '' : 'none';
    // HTML export only makes sense for JavaScript
    const _htmlBtnEl = document.getElementById('btn-ws-html');
    if (_htmlBtnEl) _htmlBtnEl.style.display = lang === 'javascript' ? '' : 'none';
    // Update export label
    const _lbl = document.getElementById('ws-export-label');
    if (_lbl) {
      _lbl.dataset.i18n = lang === 'javascript' ? 'ui.exportJs' : 'ui.exportPy';
      _lbl.textContent  = t(lang === 'javascript' ? 'ui.exportJs' : 'ui.exportPy');
    }
  };

  const exitEdit = (apply) => {
    _codeEditMode = false;
    pre.contentEditable = 'false';
    editBtn.classList.remove('active');
    applyBtn.style.display  = 'none';
    cancelBtn.style.display = 'none';
    if (apply) {
      const code = pre.textContent;
      document.querySelectorAll('.code-error-marker').forEach(m => m.remove());

      // ── Python editing path ─────────────────────────────────────────────
      if (_editingLang === 'python') {
        // Snapshot current state so we can restore if parse fails
        let _snapXml = null;
        const _snapCodeOverride   = _codeOverride;
        const _snapPythonOverride = _pythonOverride;
        try {
          const d = Blockly.Xml.workspaceToDom(workspace);
          _snapXml = Blockly.Xml.domToText(d);
        } catch(e) {}

        // Restore to the state captured just before this edit attempt
        const _restorePrev = () => {
          if (_snapXml) {
            try {
              const parseDom = Blockly.utils?.xml?.textToDom || Blockly.Xml?.textToDom;
              if (parseDom) {
                workspace.clear();
                Blockly.Xml.domToWorkspace(parseDom(_snapXml), workspace);
              }
            } catch(e) {}
          }
          _codeOverride   = _snapCodeOverride;
          _pythonOverride = _snapPythonOverride;
          pre.classList.toggle('code-override',
            _pythonOverride !== null || _codeOverride !== null);
          pre.style.backgroundImage = '';
          const oldBanner = document.getElementById('code-override-banner');
          if (oldBanner) oldBanner.remove();
          updateCodePanel();
          updateBlocksOverrideNotice();
        };
        // Expose so the banner button can call it after the function returns
        window._restorePrevPythonState = _restorePrev;

        const parsed = tryParsePythonToBlocks(code);

        if (parsed === true) {
          // Full success: blocks loaded, JS + Python auto-regenerate
          _codeOverride   = null;
          _pythonOverride = null;
          pre.classList.remove('code-override');
          pre.style.backgroundImage = '';
          _switchLangTab('python');
          updateCodePanel();
          updateBlocksOverrideNotice();
          log(t('ui.codeAppliedToBlocks') || 'Pythonコードをブロックに反映しました', 'info');

        } else if (parsed && parsed.partial) {
          // Partial success: some blocks loaded, highlight unconvertible lines in red
          _codeOverride   = null;
          _pythonOverride = null;
          pre.classList.remove('code-override');
          _switchLangTab('python');
          updateCodePanel();
          updateBlocksOverrideNotice();
          // Build multi-band gradient to highlight error lines in the pre element
          const lineH = parseFloat(getComputedStyle(pre).lineHeight) || 19;
          const padT  = parseFloat(getComputedStyle(pre).paddingTop)  || 12;
          const bands = parsed.errorLines.map(n => {
            const y1 = Math.round(padT + (n - 1) * lineH);
            const y2 = Math.round(y1 + lineH);
            return `transparent ${y1}px,rgba(255,60,60,.28) ${y1}px,rgba(255,60,60,.28) ${y2}px,transparent ${y2}px`;
          });
          pre.style.backgroundImage = bands.length ? `linear-gradient(to bottom,${bands.join(',')})` : '';
          const n = parsed.errorLines.length;
          log(`ℹ ${n}行が変換不可（赤でハイライト）— その他の行はブロックに反映済みです。`, 'info');
          let banner = document.getElementById('code-override-banner');
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'code-override-banner';
            banner.className = 'code-override-banner';
            const codeView = document.getElementById('ws-code-view');
            if (codeView) codeView.insertBefore(banner, codeView.querySelector('#ws-code-toolbar')?.nextSibling || codeView.firstChild);
          }
          banner.className = 'code-override-banner code-override-error';
          banner.innerHTML =
            `<span class="code-err-icon">!</span>` +
            `<span class="err-msg">${n}行が変換不可（赤）— import/def/asyncio等は非対応。対応行はブロックに反映済み</span>` +
            `<button onclick="window._restorePrevPythonState&&window._restorePrevPythonState()">前の状態に戻す</button>` +
            `<button onclick="document.getElementById('ws-code-output').style.backgroundImage='';document.getElementById('code-override-banner')?.remove()">閉じる</button>`;

        } else {
          // Complete failure: workspace untouched by parser — but restore snapshot to be safe,
          // then show error banner. The user's edited code stays visible in the pre element.
          _restorePrev();
          log('⚠ Pythonコードをブロックに変換できませんでした。前の状態に戻しました。', 'warn');
          let banner = document.getElementById('code-override-banner');
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'code-override-banner';
            banner.className = 'code-override-banner';
            const codeView = document.getElementById('ws-code-view');
            if (codeView) codeView.insertBefore(banner, codeView.querySelector('#ws-code-toolbar')?.nextSibling || codeView.firstChild);
          }
          banner.className = 'code-override-banner code-override-error';
          banner.innerHTML =
            `<span class="code-err-icon">!</span>` +
            `<span class="err-msg">Pythonコードをブロックに変換できませんでした（import/def/asyncio等は非対応）。前の状態を保持しています。</span>` +
            `<button onclick="document.getElementById('code-override-banner')?.remove()">閉じる</button>`;
          _switchLangTab('python');
          updateCodePanel();
        }
        return;
      }

      // ── JavaScript editing path ─────────────────────────────────────────
      let syntaxError = null;
      let syntaxErrorObj = null;
      try { new Function(`return async function(){\n${code}\n}`); }
      catch(e) { syntaxError = e.message; syntaxErrorObj = e; }

      if (syntaxError) {
        // Keep as JS override and show error
        _codeOverride = code;
        pre.classList.add('code-override');
        _highlightErrorLine(syntaxErrorObj);
        log('⚠ Syntax: ' + syntaxError, 'error');
        showOverrideBanner(syntaxError);
        _switchLangTab('javascript');
        updateCodePanel();
        updateBlocksOverrideNotice();
      } else {
        const parsed = tryParseJSToBlocks(code);
        if (parsed === true) {
          // Full success: blocks restored, both JS+Python auto-regenerate
          _codeOverride   = null;
          _pythonOverride = null;
          pre.classList.remove('code-override');
          pre.style.backgroundImage = '';
          _switchLangTab('javascript');
          updateCodePanel();
          updateBlocksOverrideNotice();
          log(t('ui.codeAppliedToBlocks') || 'JSコードをブロックに反映しました', 'info');
        } else if (parsed && parsed.partial) {
          // Partial success: converted what we could; highlight unparseable lines in red
          _codeOverride   = null;
          _pythonOverride = null;
          pre.classList.remove('code-override');
          _switchLangTab('javascript');
          updateCodePanel();
          updateBlocksOverrideNotice();
          // Build multi-band background gradient to highlight error lines
          const lineH = parseFloat(getComputedStyle(pre).lineHeight) || 19;
          const padT  = parseFloat(getComputedStyle(pre).paddingTop)  || 12;
          const bands = parsed.errorLines.map(n => {
            const y1 = Math.round(padT + (n - 1) * lineH);
            const y2 = Math.round(y1 + lineH);
            return `transparent ${y1}px,rgba(255,60,60,.28) ${y1}px,rgba(255,60,60,.28) ${y2}px,transparent ${y2}px`;
          });
          pre.style.backgroundImage = bands.length ? `linear-gradient(to bottom,${bands.join(',')})` : '';
          const n = parsed.errorLines.length;
          log(`ℹ ${n}行が変換不可（赤でハイライト）— その他の行はブロックに反映済みです。`, 'info');
          // Show a partial-warning banner
          let banner = document.getElementById('code-override-banner');
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'code-override-banner';
            banner.className = 'code-override-banner';
            const codeView = document.getElementById('ws-code-view');
            if (codeView) codeView.insertBefore(banner, codeView.querySelector('#ws-code-toolbar')?.nextSibling || codeView.firstChild);
          }
          banner.className = 'code-override-banner code-override-error';
          banner.innerHTML =
            `<span class="code-err-icon">!</span>` +
            `<span class="err-msg">${n}行が変換不可（赤）— 変数・関数定義はブロック非対応。対応行はブロックに反映済み</span>` +
            `<button onclick="document.getElementById('ws-code-output').style.backgroundImage='';document.getElementById('code-override-banner')?.remove()">閉じる</button>`;
        } else {
          // Complete failure: keep as JS override
          _codeOverride = code;
          pre.classList.add('code-override');
          pre.style.backgroundImage = '';
          log('ℹ JSコードを直接実行モードで保存しました（ブロックへの変換ができませんでした）', 'info');
          showOverrideBanner(null);
          _switchLangTab('javascript');
          updateCodePanel();
          updateBlocksOverrideNotice();
        }
      }
    } else {
      clearOverride();
    }
  };

  // Expose showOverrideBanner so addLLMCodeActions can call it
  _showCodeOverrideBanner = showOverrideBanner;

  editBtn.addEventListener('click', () => {
    if (_codeEditMode) { exitEdit(false); return; }
    // Remember which language was active so exitEdit() applies correctly
    _editingLang = (typeof activeLang !== 'undefined') ? activeLang : 'javascript';
    enterEdit();
  });
  applyBtn.addEventListener('click', () => exitEdit(true));
  cancelBtn.addEventListener('click', () => exitEdit(false));

  // Keyboard shortcuts while editing
  pre.addEventListener('keydown', (e) => {
    if (!_codeEditMode) return;

    // Ctrl+Enter / Cmd+Enter → Apply
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exitEdit(true); return; }
    // Escape → Cancel
    if (e.key === 'Escape') { e.preventDefault(); exitEdit(false); return; }

    // ── Undo: Ctrl+Z / Cmd+Z ──────────────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (_codeUndoStack.length > 0) {
        _codeRedoStack.push(_codeLastContent);
        const prev = _codeUndoStack.pop();
        _restoreContent(prev);
      }
      return;
    }

    // ── Redo: Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z ────────────────────────
    if ((e.ctrlKey && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
      e.preventDefault();
      if (_codeRedoStack.length > 0) {
        _codeUndoStack.push(_codeLastContent);
        const next = _codeRedoStack.pop();
        _restoreContent(next);
      }
      return;
    }
  });
}

// ─── Blocks-panel override notice ────────────────────────────────────────────
// Shows a banner above the Blockly workspace whenever JS code override is active,
// so users in split (blocks + code) mode can see the blocks are not in sync.

function updateBlocksOverrideNotice() {
  const blocksView = document.getElementById('ws-blocks-view');
  if (!blocksView) return;
  let notice = document.getElementById('ws-blocks-override-notice');
  if (_codeOverride) {
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'ws-blocks-override-notice';
      notice.className = 'ws-blocks-override-notice';
      const msg = document.createElement('span');
      msg.style.flex = '1';
      msg.textContent = t('ui.codeOverrideOn') || 'コードを直接編集中 — 実行ボタンでこのコードが使われます';
      const btn = document.createElement('button');
      btn.className = 'notice-revert-btn';
      btn.textContent = t('ui.codeEditClear') || 'ブロックに戻す';
      btn.onclick = () => { if (typeof window.clearCodeOverride === 'function') window.clearCodeOverride(); };
      notice.appendChild(msg);
      notice.appendChild(btn);
      // Insert before the blockly-div but inside ws-blocks-view
      blocksView.insertBefore(notice, blocksView.firstChild);
    }
  } else {
    if (notice) notice.remove();
  }
}

// ─── Block / Workspace context menu ──────────────────────────────────────────

function _getBlockFromEvent(e) {
  // Traverse DOM from event target looking for a Blockly block SVG group
  let el = e.target;
  while (el && el !== document.body) {
    const id = el.getAttribute?.('data-id');
    if (id && workspace) {
      const block = workspace.getBlockById(id);
      if (block) return block;
    }
    el = el.parentElement;
  }
  return null;
}

function initBlockContextMenu() {
  const blocklyDiv = document.getElementById('blockly-div');
  if (!blocklyDiv) return;

  let _clipboard = null;  // XML dom node

  // capture=true → fires before Blockly's own contextmenu handler
  blocklyDiv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // blockUnderCursor: block physically beneath the pointer (null on empty space)
    // block: block to operate on (cursor target, or fallback to last selected)
    const blockUnderCursor = _getBlockFromEvent(e);
    const block = blockUnderCursor ||
      (typeof Blockly.common !== 'undefined' ? Blockly.common.getSelected?.() : null);

    const infoIcon   = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>`;
    const trashIcon  = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118z"/></svg>`;

    // Build menu items
    const items = [];

    if (block) {
      items.push({
        label: t('ctx.duplicate') || '複製',
        icon: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>`,
        action: () => {
          try {
            Blockly.Events.setGroup(true);
            const xml = Blockly.Xml.blockToDom(block);
            const newBlock = Blockly.Xml.domToBlock(xml, workspace);
            newBlock.moveBy(28, 28);
            workspace.setResizesEnabled(true);
          } catch(err) { console.warn('Duplicate failed:', err); }
          finally { Blockly.Events.setGroup(false); }
        },
      });

      items.push({
        label: t('ctx.copy') || 'コピー',
        icon: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10 1.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-1zm-5 0A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5v1A1.5 1.5 0 0 1 9.5 4h-3A1.5 1.5 0 0 1 5 2.5v-1zM4.5 5.5A1.5 1.5 0 0 0 3 7v7a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 14V7a1.5 1.5 0 0 0-1.5-1.5h-7z"/></svg>`,
        action: () => {
          try { _clipboard = Blockly.Xml.blockToDom(block); } catch(err) {}
        },
      });
    }

    items.push({
      label: t('ctx.paste') || 'ペースト',
      disabled: !_clipboard,
      icon: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>`,
      action: () => {
        if (!_clipboard) return;
        try {
          const newBlock = Blockly.Xml.domToBlock(_clipboard.cloneNode(true), workspace);
          newBlock.moveBy(20, 20);
        } catch(err) { console.warn('Paste failed:', err); }
      },
    });

    if (block) {
      items.push({ separator: true });

      items.push({
        label: t('ctx.delete') || '削除',
        icon: trashIcon,
        action: () => { try { block.dispose(true); } catch(err) {} },
      });

      // ── Comment add / edit / delete ────────────────────────────────────────
      const hasComment = block.getCommentText() !== null;
      items.push({
        label: hasComment ? (t('ctx.editComment') || 'コメント編集') : (t('ctx.addComment') || 'コメント追加'),
        icon: infoIcon,
        action: () => {
          try {
            if (workspace) {
              workspace.getAllBlocks(false).forEach(b => {
                if (b !== block && b.commentModel && b.commentModel.pinned) {
                  b.commentModel.setPinned(false);
                }
              });
            }
            if (!hasComment) block.setCommentText('');
            if (block.commentModel) block.commentModel.setPinned(true);
          } catch(err) {}
        },
      });

      if (hasComment) {
        items.push({
          label: t('ctx.deleteComment') || 'コメントを削除',
          icon: trashIcon,
          action: () => {
            try {
              if (block.commentModel) block.commentModel.setPinned(false);
              block.setCommentText(null);
            } catch(err) {}
          },
        });
      }

      items.push({ separator: true });
    }

    items.push({
      label: t('ctx.align') || '整列',
      icon: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h2v2H2V2zm0 4h2v2H2V6zm0 4h2v2H2v-2zm4-8h8v2H6V2zm0 4h8v2H6V6zm0 4h8v2H6v-2z"/></svg>`,
      action: () => { workspace?.cleanUp(); },
    });

    // ── Workspace comment — shown when right-clicking on empty space ──────────
    // Uses blockUnderCursor (not the fallback-to-selected `block`) so that
    // the option always appears when there is no block physically under the pointer.
    if (!blockUnderCursor) {
      items.push({ separator: true });
      items.push({
        label: t('ctx.addWsComment') || 'コメントを追加',
        icon: infoIcon,
        action: () => {
          if (typeof Blockly.WorkspaceCommentSvg === 'undefined') {
            log('WorkspaceCommentSvg not available in this Blockly build', 'info');
            return;
          }
          try {
            const injDiv = workspace.getInjectionDiv ? workspace.getInjectionDiv() : blocklyDiv;
            const rect   = injDiv.getBoundingClientRect();
            const scale  = workspace.scale || 1;
            const wsX    = (e.clientX - rect.left - (workspace.scrollX || 0)) / scale;
            const wsY    = (e.clientY - rect.top  - (workspace.scrollY || 0)) / scale;
            const comment = new Blockly.WorkspaceCommentSvg(workspace, 'コメント', 80, 160);
            comment.initSvg();
            comment.render();
            comment.moveBy(wsX, wsY);
            workspace.setResizesEnabled(true);
          } catch(err) { console.warn('WorkspaceComment failed:', err); }
        },
      });
    }

    _showCtxMenu(e.clientX, e.clientY, items);
  }, { capture: true });   // capture=true → fires before Blockly's own handler

  // ── Replace Blockly's '?' comment-icon text with 'i' ────────────────────
  // Blockly v9 renders a <text> '?' inside .blocklyIconGroup via characterData
  // mutations (not just childList), so observe both. Also run a periodic sweep
  // to catch any that slip through (e.g. when the comment bubble is toggled).
  const _fixCommentIcons = () => {
    blocklyDiv.querySelectorAll('.blocklyIconGroup text').forEach(el => {
      if (el.textContent === '?') el.textContent = 'i';
    });
  };
  const _iconObs = new MutationObserver((mutations) => {
    let needFix = false;
    for (const m of mutations) {
      if (m.type === 'characterData') {
        // Direct text-node change — check if it's inside a comment icon
        if (m.target.textContent === '?') {
          const parent = m.target.parentElement;
          if (parent && parent.closest('.blocklyIconGroup')) {
            m.target.textContent = 'i';
          }
        }
      } else if (m.type === 'childList') {
        needFix = true;
      }
    }
    if (needFix) _fixCommentIcons();
  });
  _iconObs.observe(blocklyDiv, { subtree: true, childList: true, characterData: true });
  setTimeout(_fixCommentIcons, 200);
  setTimeout(_fixCommentIcons, 800);
  // Periodic sweep every 2s as a safety net
  setInterval(_fixCommentIcons, 2000);

  // ── Keyboard shortcuts (Ctrl+C / Ctrl+V / Ctrl+D / Delete) ─────────────────
  document.addEventListener('keydown', (e) => {
    // Only fire when Blockly workspace has focus (not in text input)
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    if (_codeEditMode) return;

    const block = typeof Blockly.common !== 'undefined'
      ? Blockly.common.getSelected?.()
      : (workspace?.getBlockById ? workspace.getAllBlocks(false).find(b => b.isSelected?.()) : null);

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      if (block) {
        try { _clipboard = Blockly.Xml.blockToDom(block); } catch(err) {}
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      if (_clipboard) {
        try {
          const newBlock = Blockly.Xml.domToBlock(_clipboard.cloneNode(true), workspace);
          newBlock.moveBy(24, 24);
        } catch(err) {}
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      if (block) {
        try {
          Blockly.Events.setGroup(true);
          const xml = Blockly.Xml.blockToDom(block);
          const nb = Blockly.Xml.domToBlock(xml, workspace);
          nb.moveBy(28, 28);
        } catch(err) {}
        finally { Blockly.Events.setGroup(false); }
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && block && !e.ctrlKey && !e.metaKey) {
      // Delete selected block (only if no modifier — don't intercept browser back-nav)
      if (e.key === 'Delete') { e.preventDefault(); try { block.dispose(true); } catch(err) {} }
    }
  });
}

function _showCtxMenu(x, y, items) {
  document.getElementById('_blockCtxMenu')?.remove();

  const menu = document.createElement('div');
  menu.id = '_blockCtxMenu';
  menu.className = 'block-ctx-menu';

  items.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'ctx-item' + (item.disabled ? ' disabled' : '');
    btn.innerHTML = (item.icon || '') + `<span>${item.label}</span>`;
    if (!item.disabled) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.remove();
        item.action();
      });
    }
    menu.appendChild(btn);
  });

  // Position (keep on screen)
  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  const vw = window.innerWidth,  vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - mw - 6) + 'px';
  menu.style.top  = Math.min(y, vh - mh - 6) + 'px';

  // Close on outside click or Escape
  const close = (e) => {
    if (!menu.contains(e.target)) { menu.remove(); }
  };
  const closeKey = (e) => {
    if (e.key === 'Escape') { menu.remove(); document.removeEventListener('keydown', closeKey); }
  };
  setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
  document.addEventListener('keydown', closeKey);
}

// ─── Workspace comment output ─────────────────────────────────────────────────

function getWorkspaceComments(ws, lang) {
  const prefix = lang === 'python' ? '# ' : '// ';
  let out = '';
  try {
    const wsComments = ws.getTopComments ? ws.getTopComments(false) : [];
    wsComments.forEach(c => {
      const text = (typeof c.getText === 'function' ? c.getText() :
                    typeof c.getContent === 'function' ? c.getContent() : '').trim();
      if (!text) return;
      const pos = c.getRelativeToSurfaceXY ? c.getRelativeToSurfaceXY() : { x: 0, y: 0 };
      out += `${prefix}=== コメント @ (${Math.round(pos.x)},${Math.round(pos.y)}) ===\n`;
      text.split('\n').forEach(line => { out += `${prefix}${line}\n`; });
      out += '\n';
    });
  } catch(e) {}
  return out;
}

// ─── Block count ─────────────────────────────────────────────────────────────

function updateBlockCount() {
  if (!workspace) return;
  const badge = document.getElementById('block-count');
  if (!badge) return;
  const count = workspace.getAllBlocks(false).length;
  badge.textContent = count;
  badge.classList.toggle('zero', count === 0);
}

// ─── Undo / Redo ─────────────────────────────────────────────────────────────

function initUndoRedo() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.addEventListener('click', () => workspace?.undo(false));
  if (btnRedo) btnRedo.addEventListener('click', () => workspace?.undo(true));
}

// ─── Beginner mode ───────────────────────────────────────────────────────────

function initBeginnerMode() {
  const btn = document.getElementById('btn-level-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    _beginnerMode = !_beginnerMode;
    btn.classList.toggle('easy', _beginnerMode);
    btn.title = _beginnerMode ? t('ui.levelAdv') : t('ui.levelEasy');
    // Rebuild toolbox
    if (workspace) workspace.updateToolbox(buildToolbox());
    log(_beginnerMode ? t('ui.levelEasy') + ' ON' : t('ui.levelAdv') + ' ON', 'info');
  });
}

// ─── Sample programs ─────────────────────────────────────────────────────────

const SAMPLE_PROGRAMS = {
  '1': `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="toio_move" x="30" y="30">
    <field name="CUBE">ALL</field><field name="DIRECTION">FORWARD</field>
    <value name="SPEED"><block type="math_number"><field name="NUM">60</field></block></value>
    <value name="DURATION"><block type="math_number"><field name="NUM">2</field></block></value>
    <next><block type="toio_led_color">
      <field name="CUBE">ALL</field><field name="COLOR">GREEN</field>
      <value name="DURATION"><block type="math_number"><field name="NUM">0.5</field></block></value>
      <next><block type="toio_stop"><field name="CUBE">ALL</field></block></next>
    </block></next>
  </block>
</xml>`,
  '2': `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_repeat_ext" x="30" y="30">
    <value name="TIMES"><block type="math_number"><field name="NUM">4</field></block></value>
    <statement name="DO">
      <block type="toio_move">
        <field name="CUBE">ALL</field><field name="DIRECTION">FORWARD</field>
        <value name="SPEED"><block type="math_number"><field name="NUM">60</field></block></value>
        <value name="DURATION"><block type="math_number"><field name="NUM">1</field></block></value>
        <next><block type="toio_turn">
          <field name="CUBE">ALL</field><field name="DIRECTION">RIGHT</field>
          <value name="SPEED"><block type="math_number"><field name="NUM">50</field></block></value>
          <value name="DURATION"><block type="math_number"><field name="NUM">0.5</field></block></value>
        </block></next>
      </block>
    </statement>
    <next><block type="toio_stop"><field name="CUBE">ALL</field></block></next>
  </block>
</xml>`,
  '3': `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="controls_repeat_ext" x="30" y="30">
    <value name="TIMES"><block type="math_number"><field name="NUM">3</field></block></value>
    <statement name="DO">
      <block type="toio_led_color">
        <field name="CUBE">ALL</field><field name="COLOR">RED</field>
        <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
        <next><block type="toio_led_color">
          <field name="CUBE">ALL</field><field name="COLOR">GREEN</field>
          <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
          <next><block type="toio_led_color">
            <field name="CUBE">ALL</field><field name="COLOR">BLUE</field>
            <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
            <next><block type="toio_led_color">
              <field name="CUBE">ALL</field><field name="COLOR">YELLOW</field>
              <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
              <next><block type="toio_led_color">
                <field name="CUBE">ALL</field><field name="COLOR">CYAN</field>
                <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
              </block></next>
            </block></next>
          </block></next>
        </block></next>
      </block>
    </statement>
    <next><block type="toio_led_off"><field name="CUBE">ALL</field></block></next>
  </block>
</xml>`,
  '4': `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="toio_play_note" x="30" y="30">
    <field name="CUBE">ALL</field><field name="NOTE">60</field>
    <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
    <next><block type="toio_play_note">
      <field name="CUBE">ALL</field><field name="NOTE">62</field>
      <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
      <next><block type="toio_play_note">
        <field name="CUBE">ALL</field><field name="NOTE">64</field>
        <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
        <next><block type="toio_play_note">
          <field name="CUBE">ALL</field><field name="NOTE">65</field>
          <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
          <next><block type="toio_play_note">
            <field name="CUBE">ALL</field><field name="NOTE">67</field>
            <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
            <next><block type="toio_play_note">
              <field name="CUBE">ALL</field><field name="NOTE">69</field>
              <value name="DURATION"><block type="math_number"><field name="NUM">0.4</field></block></value>
              <next><block type="toio_play_note">
                <field name="CUBE">ALL</field><field name="NOTE">71</field>
                <value name="DURATION"><block type="math_number"><field name="NUM">0.8</field></block></value>
              </block></next>
            </block></next>
          </block></next>
        </block></next>
      </block></next>
    </block></next>
  </block>
</xml>`,
  '5': `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="toio_wait_button" x="30" y="30">
    <field name="CUBE">0</field>
    <next><block type="toio_move">
      <field name="CUBE">ALL</field><field name="DIRECTION">FORWARD</field>
      <value name="SPEED"><block type="math_number"><field name="NUM">70</field></block></value>
      <value name="DURATION"><block type="math_number"><field name="NUM">1</field></block></value>
      <next><block type="toio_led_color">
        <field name="CUBE">ALL</field><field name="COLOR">GREEN</field>
        <value name="DURATION"><block type="math_number"><field name="NUM">0.3</field></block></value>
        <next><block type="toio_sound_effect">
          <field name="CUBE">ALL</field><field name="EFFECT">1</field>
          <next><block type="toio_stop"><field name="CUBE">ALL</field></block></next>
        </block></next>
      </block></next>
    </block></next>
  </block>
</xml>`,
  '6': `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="toio_move_to_xy" x="30" y="30">
    <field name="CUBE">ALL</field>
    <value name="X"><block type="math_number"><field name="NUM">180</field></block></value>
    <value name="Y"><block type="math_number"><field name="NUM">200</field></block></value>
    <value name="SPEED"><block type="math_number"><field name="NUM">80</field></block></value>
    <next><block type="toio_led_color">
      <field name="CUBE">ALL</field><field name="COLOR">GREEN</field>
      <value name="DURATION"><block type="math_number"><field name="NUM">0.3</field></block></value>
      <next><block type="toio_move_to_xy">
        <field name="CUBE">ALL</field>
        <value name="X"><block type="math_number"><field name="NUM">380</field></block></value>
        <value name="Y"><block type="math_number"><field name="NUM">200</field></block></value>
        <value name="SPEED"><block type="math_number"><field name="NUM">80</field></block></value>
        <next><block type="toio_led_color">
          <field name="CUBE">ALL</field><field name="COLOR">BLUE</field>
          <value name="DURATION"><block type="math_number"><field name="NUM">0.3</field></block></value>
          <next><block type="toio_move_to_xy">
            <field name="CUBE">ALL</field>
            <value name="X"><block type="math_number"><field name="NUM">250</field></block></value>
            <value name="Y"><block type="math_number"><field name="NUM">280</field></block></value>
            <value name="SPEED"><block type="math_number"><field name="NUM">80</field></block></value>
            <next><block type="toio_led_color">
              <field name="CUBE">ALL</field><field name="COLOR">PINK</field>
              <value name="DURATION"><block type="math_number"><field name="NUM">0.3</field></block></value>
            </block></next>
          </block></next>
        </block></next>
      </block></next>
    </block></next>
  </block>
</xml>`,
};

function initSamples() {
  const sel = document.getElementById('sample-select');
  if (!sel) return;

  // Build the dropdown
  sel.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = t('ui.samples');
  sel.appendChild(placeholder);

  for (let i = 1; i <= 6; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i}. ${t('ui.sample.' + i)}`;
    sel.appendChild(opt);
  }

  sel.addEventListener('change', e => {
    const key = e.target.value;
    if (!key || !SAMPLE_PROGRAMS[key]) return;
    try {
      workspace.clear();
      Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(SAMPLE_PROGRAMS[key]), workspace);
      log(`${t('ui.samples')}: ${t('ui.sample.' + key)}`, 'info');
    } catch (err) {
      log('Sample load error: ' + err.message, 'error');
    }
    // Reset to placeholder so it can be re-selected
    sel.value = '';
  });
}

// ─── Default program ─────────────────────────────────────────────────────────

function loadDefaultProgram() {
  // ── Restore workspace snapshotted before a language-switch reload ──────────
  const sessionXml = sessionStorage.getItem('_ws_lang_reload');
  if (sessionXml) {
    sessionStorage.removeItem('_ws_lang_reload');
    try {
      workspace.clear();
      Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(sessionXml), workspace);
      // Restore any active code override
      const savedOverride = sessionStorage.getItem('_code_override_reload');
      if (savedOverride) {
        sessionStorage.removeItem('_code_override_reload');
        _codeOverride = savedOverride;
        const pre = document.getElementById('ws-code-output');
        if (pre) { pre.textContent = savedOverride; pre.classList.add('code-override'); }
        // Restore block-panel notice
        setTimeout(updateBlocksOverrideNotice, 0);
      }
      return;  // Skip default program
    } catch(e) { console.warn('Session restore failed:', e); }
  }

  // ── Default starter program ────────────────────────────────────────────────
  const xml = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="toio_move" x="30" y="30">
    <field name="CUBE">ALL</field>
    <field name="DIRECTION">FORWARD</field>
    <value name="SPEED"><block type="math_number"><field name="NUM">60</field></block></value>
    <value name="DURATION"><block type="math_number"><field name="NUM">1</field></block></value>
    <next>
      <block type="toio_led_color">
        <field name="CUBE">ALL</field>
        <field name="COLOR">GREEN</field>
        <value name="DURATION"><block type="math_number"><field name="NUM">0.5</field></block></value>
        <next>
          <block type="toio_sound_effect">
            <field name="CUBE">ALL</field>
            <field name="EFFECT">1</field>
            <next>
              <block type="toio_turn">
                <field name="CUBE">ALL</field>
                <field name="DIRECTION">RIGHT</field>
                <value name="SPEED"><block type="math_number"><field name="NUM">50</field></block></value>
                <value name="DURATION"><block type="math_number"><field name="NUM">0.5</field></block></value>
                <next><block type="toio_stop"><field name="CUBE">ALL</field></block></next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>`;
  try {
    workspace.clear();
    Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(xml), workspace);
  } catch (e) { console.warn('Default program load failed:', e); }
}

// ─── Variable monitor ─────────────────────────────────────────────────────────

let _varMonitorInterval = null;

function initVarMonitor() {
  // Show/hide based on whether vars exist
  if (!workspace) return;
  workspace.addChangeListener(() => updateVarMonitorDisplay());
}

function updateVarMonitorDisplay() {
  if (!workspace) return;
  const vars = workspace.getAllVariables();
  const monitor = document.getElementById('var-monitor');
  if (!monitor) return;
  if (vars.length === 0) { monitor.style.display = 'none'; return; }
  monitor.style.display = '';
  const items = document.getElementById('var-monitor-items');
  if (!items) return;

  // Re-render items (preserve slider state if possible)
  const existing = {};
  items.querySelectorAll('.vm-item').forEach(el => {
    existing[el.dataset.varId] = { sliderMode: el.querySelector('.vm-slider') !== null };
  });

  items.innerHTML = '';
  vars.forEach(v => {
    const id   = v.getId();
    const name = v.name;
    const val  = window._toioVars ? (window._toioVars[name] ?? '—') : '—';
    const isSlider = existing[id]?.sliderMode && typeof val === 'number';

    const row = document.createElement('div');
    row.className = 'vm-item';
    row.dataset.varId = id;

    if (isSlider && typeof val === 'number') {
      // Slider mode
      const numVal = typeof val === 'number' ? val : 0;
      row.innerHTML =
        `<span class="vm-name">${escapeHtml(name)}</span>` +
        `<input class="vm-slider" type="range" min="-100" max="100" step="1" value="${numVal}" title="${numVal}">` +
        `<span class="vm-val">${numVal}</span>` +
        `<button class="vm-toggle" title="数値表示">≡</button>`;
      const slider = row.querySelector('.vm-slider');
      const valLbl = row.querySelector('.vm-val');
      slider.addEventListener('input', () => {
        const nv = parseInt(slider.value);
        valLbl.textContent = nv;
        slider.title = nv;
        if (!window._toioVars) window._toioVars = {};
        window._toioVars[name] = nv;
      });
      row.querySelector('.vm-toggle').addEventListener('click', () => {
        // Switch back to text mode
        const clone = document.createElement('div');
        clone.className = 'vm-item';
        clone.dataset.varId = id;
        clone.innerHTML =
          `<span class="vm-name">${escapeHtml(name)}</span>` +
          `<span class="vm-val">${val}</span>` +
          `<button class="vm-slider-btn" title="スライダー">≈</button>`;
        clone.querySelector('.vm-slider-btn').addEventListener('click', () => switchToSlider(clone, name, id));
        row.replaceWith(clone);
      });
    } else {
      row.innerHTML =
        `<span class="vm-name">${escapeHtml(name)}</span>` +
        `<span class="vm-val">${typeof val === 'number' ? val : (typeof val === 'string' ? escapeHtml(String(val)) : '—')}</span>` +
        `<button class="vm-slider-btn" title="スライダー表示">≈</button>`;
      row.querySelector('.vm-slider-btn').addEventListener('click', () => switchToSlider(row, name, id));
    }
    items.appendChild(row);
  });
}

function switchToSlider(row, name, id) {
  const curVal = (window._toioVars && typeof window._toioVars[name] === 'number')
    ? window._toioVars[name] : 0;
  const clone = document.createElement('div');
  clone.className = 'vm-item';
  clone.dataset.varId = id;
  clone.innerHTML =
    `<span class="vm-name">${escapeHtml(name)}</span>` +
    `<input class="vm-slider" type="range" min="-100" max="100" step="1" value="${curVal}" title="${curVal}">` +
    `<span class="vm-val">${curVal}</span>` +
    `<button class="vm-toggle" title="数値表示">≡</button>`;
  const slider = clone.querySelector('.vm-slider');
  const valLbl = clone.querySelector('.vm-val');
  slider.addEventListener('input', () => {
    const nv = parseInt(slider.value);
    valLbl.textContent = nv;
    slider.title = nv;
    if (!window._toioVars) window._toioVars = {};
    window._toioVars[name] = nv;
  });
  clone.querySelector('.vm-toggle').addEventListener('click', () => {
    // Switch back to text mode by forcing re-render
    clone.dataset.forceText = '1';
    updateVarMonitorDisplay();
  });
  row.replaceWith(clone);
}

function startVarMonitor() {
  if (_varMonitorInterval) clearInterval(_varMonitorInterval);
  _varMonitorInterval = setInterval(() => {
    if (!window._toioVars) return;
    const items = document.getElementById('var-monitor-items');
    if (!items) return;
    items.querySelectorAll('.vm-item').forEach(row => {
      const id = row.dataset.varId;
      if (!id || !workspace) return;
      const v = workspace.getVariableById(id);
      if (!v) return;
      const val = window._toioVars[v.name];
      if (val === undefined) return;
      const valEl = row.querySelector('.vm-val');
      if (valEl) valEl.textContent = typeof val === 'number' ? val : escapeHtml(String(val));
      const slider = row.querySelector('.vm-slider');
      if (slider && typeof val === 'number') {
        slider.value = val;
        slider.title = val;
      }
    });
  }, 150);
}

function stopVarMonitor() {
  if (_varMonitorInterval) { clearInterval(_varMonitorInterval); _varMonitorInterval = null; }
  // Do one final poll to show last values
  if (window._toioVars) {
    const items = document.getElementById('var-monitor-items');
    if (items) {
      items.querySelectorAll('.vm-item').forEach(row => {
        const id = row.dataset.varId;
        if (!id || !workspace) return;
        const v = workspace.getVariableById(id);
        if (!v) return;
        const val = window._toioVars[v.name];
        if (val === undefined) return;
        const valEl = row.querySelector('.vm-val');
        if (valEl) valEl.textContent = typeof val === 'number' ? val : escapeHtml(String(val));
        const slider = row.querySelector('.vm-slider');
        if (slider && typeof val === 'number') { slider.value = val; slider.title = val; }
      });
    }
  }
}

// ─── Custom Blockly dialog (variable creation / renaming) ─────────────────────

function initBlocklyDialog() {
  if (typeof Blockly === 'undefined' || !Blockly.dialog) return;
  Blockly.dialog.setPrompt((message, defaultValue, callback) => {
    const overlay = document.createElement('div');
    overlay.className = 'mat-dialog-overlay';
    overlay.style.zIndex = '2000';
    const dlg = document.createElement('div');
    dlg.className = 'mat-dialog';
    dlg.innerHTML = `
      <div style="margin-bottom:12px;font-size:.9rem;color:var(--text)">${escapeHtml(message)}</div>
      <input type="text" id="_bd-input" value="${escapeHtml(defaultValue || '')}"
        style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem;outline:none;color:var(--text);background:var(--surface)">
      <div class="mat-dialog-actions" style="margin-top:14px">
        <button class="btn btn-ghost btn-sm" id="_bd-cancel">${t('ui.matCancel')}</button>
        <button class="btn btn-primary btn-sm" id="_bd-ok">OK</button>
      </div>
    `;
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);
    const inp = dlg.querySelector('#_bd-input');
    inp.focus(); inp.select();
    const submit = () => { overlay.remove(); callback(inp.value.trim() || null); };
    const cancel = () => { overlay.remove(); callback(null); };
    dlg.querySelector('#_bd-ok').addEventListener('click', submit);
    dlg.querySelector('#_bd-cancel').addEventListener('click', cancel);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cancel(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
  });
}

// ─── Blockly theme ────────────────────────────────────────────────────────────

let _themeSeq = 0;  // Unique suffix so defineTheme never returns a stale cached object

const BLOCK_STYLES_SHARED = {
  // ── Custom toio block styles ──────────────────────────────────────────────
  motion_blocks:  { colourPrimary: '#4C97FF', colourSecondary: '#3B87EF', colourTertiary: '#2A77DF' },
  led_blocks:     { colourPrimary: '#9966FF', colourSecondary: '#8856EF', colourTertiary: '#7746DF' },
  sound_blocks:   { colourPrimary: '#59C059', colourSecondary: '#48B048', colourTertiary: '#37A037' },
  control_blocks: { colourPrimary: '#FFAB19', colourSecondary: '#EF9B09', colourTertiary: '#DF8B00' },
  sensor_blocks:  { colourPrimary: '#FF6680', colourSecondary: '#EF5670', colourTertiary: '#DF4660' },
  output_blocks:  { colourPrimary: '#5CB1D6', colourSecondary: '#4CA1C6', colourTertiary: '#3C91B6' },
  // ── Built-in Blockly block styles → match toolbox category colours ────────
  loop_blocks:             { colourPrimary: '#FFAB19', colourSecondary: '#EF9B09', colourTertiary: '#DF8B00' },
  logic_blocks:            { colourPrimary: '#5CB1D6', colourSecondary: '#4CA1C6', colourTertiary: '#3C91B6' },
  math_blocks:             { colourPrimary: '#59C059', colourSecondary: '#48B048', colourTertiary: '#37A037' },
  text_blocks:             { colourPrimary: '#5C81A6', colourSecondary: '#4C71A6', colourTertiary: '#3C61A6' },
  variable_blocks:         { colourPrimary: '#FF8C1A', colourSecondary: '#EF7C0A', colourTertiary: '#DF6C00' },
  variable_dynamic_blocks: { colourPrimary: '#FF8C1A', colourSecondary: '#EF7C0A', colourTertiary: '#DF6C00' },
  procedure_blocks:        { colourPrimary: '#9966FF', colourSecondary: '#8856EF', colourTertiary: '#7746DF' },
  hat_blocks:              { colourPrimary: '#9966FF', colourSecondary: '#8856EF', colourTertiary: '#7746DF' },
  colour_blocks:           { colourPrimary: '#A55B5B', colourSecondary: '#954B4B', colourTertiary: '#853B3B' },
};

function buildTheme() {
  return Blockly.Theme.defineTheme('toio-light-' + (++_themeSeq), {
    base: Blockly.Themes.Classic,
    blockStyles: BLOCK_STYLES_SHARED,
    componentStyles: {
      workspaceBackgroundColour: '#F0F2F7',
      toolboxBackgroundColour:   '#1A1C2A',
      toolboxForegroundColour:   '#E8EDF5',
      flyoutBackgroundColour:    '#22253A',
      flyoutForegroundColour:    '#CDD3E0',
      flyoutOpacity:             1,
      scrollbarColour:           '#4C97FF',
      insertionMarkerColour:     '#4C97FF',
      insertionMarkerOpacity:    0.5,
      scrollbarOpacity:          0.5,
      cursorColour:              '#4C97FF',
    },
  });
}

function buildThemeDark() {
  return Blockly.Theme.defineTheme('toio-dark-' + (++_themeSeq), {
    base: Blockly.Themes.Classic,
    blockStyles: BLOCK_STYLES_SHARED,
    componentStyles: {
      workspaceBackgroundColour: '#1A1D2E',
      toolboxBackgroundColour:   '#0D1117',
      toolboxForegroundColour:   '#C9D1D9',
      flyoutBackgroundColour:    '#161B22',
      flyoutForegroundColour:    '#C9D1D9',
      flyoutOpacity:             1,
      scrollbarColour:           '#4C97FF',
      insertionMarkerColour:     '#4C97FF',
      insertionMarkerOpacity:    0.5,
      scrollbarOpacity:          0.6,
      cursorColour:              '#4C97FF',
    },
  });
}

function buildThemeHC() {
  return Blockly.Theme.defineTheme('toio-hc-' + (++_themeSeq), {
    base: Blockly.Themes.Classic,
    blockStyles: BLOCK_STYLES_SHARED,
    componentStyles: {
      workspaceBackgroundColour: '#000000',
      toolboxBackgroundColour:   '#000000',
      toolboxForegroundColour:   '#FFFFFF',
      flyoutBackgroundColour:    '#111111',
      flyoutForegroundColour:    '#FFFFFF',
      flyoutOpacity:             1,
      scrollbarColour:           '#00CCFF',
      insertionMarkerColour:     '#00CCFF',
      insertionMarkerOpacity:    0.8,
      scrollbarOpacity:          0.8,
      cursorColour:              '#00CCFF',
    },
  });
}

// ─── Toolbox ─────────────────────────────────────────────────────────────────

function buildToolbox() {
  const num = n => ({ shadow: { type: 'math_number', fields: { NUM: n } } });

  // Beginner mode: minimal block set for first-time learners
  if (_beginnerMode) {
    return {
      kind: 'categoryToolbox',
      contents: [
        {
          kind: 'category', name: t('cat.motion'), colour: BC.MOTION,
          contents: [
            { kind: 'block', type: 'toio_move',  inputs: { SPEED: num(60), DURATION: num(1) } },
            { kind: 'block', type: 'toio_turn',  inputs: { SPEED: num(50), DURATION: num(0.5) } },
            { kind: 'block', type: 'toio_stop' },
          ],
        },
        {
          kind: 'category', name: t('cat.led'), colour: BC.LED,
          contents: [
            { kind: 'block', type: 'toio_led_color', inputs: { DURATION: num(1) } },
            { kind: 'block', type: 'toio_led_off' },
          ],
        },
        {
          kind: 'category', name: t('cat.sound'), colour: BC.SOUND,
          contents: [
            { kind: 'block', type: 'toio_sound_effect' },
          ],
        },
        {
          kind: 'category', name: t('cat.control'), colour: BC.CTRL,
          contents: [
            { kind: 'block', type: 'toio_on_start' },
            { kind: 'block', type: 'toio_wait',          inputs: { SECONDS: num(1) } },
            { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: num(10) } },
          ],
        },
        { kind: 'sep' },
        {
          kind: 'category', name: t('cat.values'), colour: '#59C059',
          contents: [
            { kind: 'block', type: 'math_number' },
          ],
        },
      ],
    };
  }

  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category', name: t('cat.motion'), colour: BC.MOTION,
        contents: [
          { kind: 'block', type: 'toio_move',    inputs: { SPEED: num(60), DURATION: num(1) } },
          { kind: 'block', type: 'toio_turn',    inputs: { SPEED: num(50), DURATION: num(0.5) } },
          { kind: 'block', type: 'toio_move_raw',inputs: { LEFT: num(50), RIGHT: num(50), DURATION: num(1) } },
          { kind: 'block', type: 'toio_move_rel',    inputs: { DIST: num(50), SPEED: num(60) } },
          { kind: 'block', type: 'toio_rotate_rel',  inputs: { ANGLE: num(90), SPEED: num(60) } },
          { kind: 'block', type: 'toio_move_to', inputs: { X: num(250), Y: num(250), ANGLE: num(0), SPEED: num(80) } },
          { kind: 'block', type: 'toio_move_to_xy', inputs: { X: num(250), Y: num(250), SPEED: num(80) } },
          { kind: 'block', type: 'toio_rotate_to', inputs: { ANGLE: num(0) } },
          { kind: 'block', type: 'toio_stop' },
        ],
      },
      {
        kind: 'category', name: t('cat.led'), colour: BC.LED,
        contents: [
          { kind: 'block', type: 'toio_led',       inputs: { R: num(255), G: num(0), B: num(0), DURATION: num(1) } },
          { kind: 'block', type: 'toio_led_color', inputs: { DURATION: num(1) } },
          { kind: 'block', type: 'toio_led_off' },
        ],
      },
      {
        kind: 'category', name: t('cat.sound'), colour: BC.SOUND,
        contents: [
          { kind: 'block', type: 'toio_sound_effect' },
          { kind: 'block', type: 'toio_play_note', inputs: { DURATION: num(0.5) } },
          { kind: 'block', type: 'toio_stop_sound' },
        ],
      },
      {
        kind: 'category', name: t('cat.control'), colour: BC.CTRL,
        contents: [
          { kind: 'block', type: 'toio_on_start' },
          { kind: 'block', type: 'toio_wait',        inputs: { SECONDS: num(1) } },
          { kind: 'block', type: 'toio_wait_button' },
          { kind: 'block', type: 'toio_run_action' },
          { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: num(10) } },
          { kind: 'block', type: 'controls_whileUntil' },
        ],
      },
      {
        kind: 'category', name: t('cat.sensor'), colour: BC.SENSOR,
        contents: [
          { kind: 'block', type: 'toio_on_button' },
          { kind: 'block', type: 'toio_is_button' },
          { kind: 'block', type: 'toio_is_horizontal' },
          { kind: 'block', type: 'toio_battery' },
          { kind: 'block', type: 'toio_position_x' },
          { kind: 'block', type: 'toio_position_y' },
          { kind: 'block', type: 'toio_position_angle' },
        ],
      },
      {
        kind: 'category', name: t('cat.output'), colour: BC.OUT,
        contents: [
          { kind: 'block', type: 'toio_print',
            inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hello' } } } } },
        ],
      },
      { kind: 'sep' },
      {
        kind: 'category', name: t('cat.values'), colour: '#59C059',
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'math_arithmetic' },
          { kind: 'block', type: 'math_random_int', inputs: { FROM: num(1), TO: num(100) } },
        ],
      },
      {
        kind: 'category', name: t('cat.text'), colour: '#5C81A6',
        contents: [
          { kind: 'block', type: 'text' },
          { kind: 'block', type: 'text_join' },
        ],
      },
      {
        kind: 'category', name: t('cat.vars'), colour: '#FF8C1A',
        custom: 'VARIABLE',
      },
      {
        kind: 'category', name: t('cat.logic'), colour: '#5CB1D6',
        contents: [
          { kind: 'block', type: 'controls_if' },
          { kind: 'block', type: 'logic_compare' },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_boolean' },
          { kind: 'block', type: 'logic_negate' },
        ],
      },
      {
        kind: 'category', name: t('cat.functions'), colour: '#9966FF',
        custom: 'PROCEDURE',
      },
    ],
  };
}
