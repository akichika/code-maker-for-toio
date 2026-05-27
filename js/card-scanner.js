/* card-scanner.js — toio Playground Command card image recognition
   Feature-based local processing using Canvas 2D API only.
   No LLM, no server calls — runs entirely in the browser.
   ----------------------------------------------------------------
   Recognition pipeline:
     1. User photos / uploads cards laid in a horizontal row
     2. Image scaled → multi-row HSL sampling (7 Y levels per strip)
     3. Majority-vote across Y levels → robust color per strip
     4. Adjacent same-color strips merged → card regions
     5. Each region classified to a color group by HSL distance
     6. User sees vertical draggable list and can reorder / cycle / delete
     7. Confirmed sequence → Blockly XML → loaded into workspace
*/

'use strict';

/* ─── Card Database ─────────────────────────────────────────────────────────
   Each entry:
     id        – unique key
     name      – Japanese label shown in UI
     icon      – short label for chip
     colorKey  – which color group this card belongs to
     block     – Blockly block descriptor  (null = structural / no block emitted)

   Block descriptor:
     type   – Blockly block type string
     fields – { FIELDNAME: value }    (CUBE field auto-added as '0')
     values – { INPUTNAME: number }   → <value><block type="math_number">
     extra  – optional tag for special-case handling
*/
const CARD_DEFS = [
  // ── Sequence markers ────────────────────────────────────────────────────
  { id:'reg_start', name:'コマンドをとうろく', icon:'▶',  colorKey:'green',  block:null },
  { id:'reg_end',   name:'とうろくおわり',     icon:'⏹', colorKey:'gray',   block:null },

  // ── Movement (yellow card, forward face / purple card, back face) ────────
  // toio_move: fields CUBE(dropdown), DIRECTION(FORWARD|BACKWARD); values SPEED, DURATION
  { id:'move_fwd',   name:'いっぽすすむ',  icon:'↑', colorKey:'yellow',
    block:{ type:'toio_move', fields:{ DIRECTION:'FORWARD' }, values:{ SPEED:50, DURATION:0.5 } } },
  { id:'turn_back',  name:'うしろをむく',  icon:'↓', colorKey:'purple',
    // Approximate 180° by a long right turn
    block:{ type:'toio_turn', fields:{ DIRECTION:'RIGHT'  }, values:{ SPEED:50, DURATION:1.0 } } },

  // ── Direction (blue card left / coral card right) ────────────────────────
  // toio_turn: fields CUBE, DIRECTION(LEFT|RIGHT); values SPEED, DURATION
  { id:'turn_left',  name:'ひだりをむく',  icon:'↰', colorKey:'blue',
    block:{ type:'toio_turn', fields:{ DIRECTION:'LEFT'  }, values:{ SPEED:50, DURATION:0.4 } } },
  { id:'turn_right', name:'みぎをむく',    icon:'↱', colorKey:'coral',
    block:{ type:'toio_turn', fields:{ DIRECTION:'RIGHT' }, values:{ SPEED:50, DURATION:0.4 } } },

  // ── Loops (pink = ×2/×3, orange = ×4/×5) ────────────────────────────────
  { id:'repeat_2',   name:'2×くりかえす',    icon:'2×', colorKey:'pink',
    block:{ type:'controls_repeat_ext', values:{ TIMES:2 } } },
  { id:'repeat_3',   name:'3×くりかえす',    icon:'3×', colorKey:'pink',
    block:{ type:'controls_repeat_ext', values:{ TIMES:3 } } },
  { id:'repeat_4',   name:'4×くりかえす',    icon:'4×', colorKey:'orange',
    block:{ type:'controls_repeat_ext', values:{ TIMES:4 } } },
  { id:'repeat_5',   name:'5×くりかえす',    icon:'5×', colorKey:'orange',
    block:{ type:'controls_repeat_ext', values:{ TIMES:5 } } },

  // ── Wait / pause (orange card with clock/hourglass icon) ─────────────────
  // toio_wait: value input SECONDS — duration is waitDuration × card number
  { id:'wait_1', name:'1かいまつ', icon:'⏱1', colorKey:'orange',
    block:{ type:'toio_wait', values:{ SECONDS: 1.0 } } },
  { id:'wait_2', name:'2かいまつ', icon:'⏱2', colorKey:'orange',
    block:{ type:'toio_wait', values:{ SECONDS: 2.0 } } },
  { id:'wait_3', name:'3かいまつ', icon:'⏱3', colorKey:'orange',
    block:{ type:'toio_wait', values:{ SECONDS: 3.0 } } },
  // Infinite loop / end-loop (dark teal card)
  { id:'repeat_inf', name:'∞くりかえす',     icon:'∞', colorKey:'dteal',
    block:{ type:'controls_whileUntil', fields:{ MODE:'WHILE' } } },
  { id:'repeat_end', name:'くりかえしおわり', icon:'⊣', colorKey:'dteal', block:null },

  // ── 50% branch (light cyan card) ─────────────────────────────────────────
  { id:'half_chance',    name:'1/2かいまつ',          icon:'½',  colorKey:'lcyan',
    block:{ type:'controls_if', extra:'half' } },

  // ── Floor conditionals (light cyan cards with colored icons) ─────────────
  // "はてなのゆか" / "びっくりのゆか" are Boolean variables set by the runtime.
  // The block is a controls_if that checks the variable as a truthy value.
  { id:'hatena_floor',  name:'はてなのゆかにいたら',  icon:'?', colorKey:'lcyan',
    block:{ type:'controls_if', extra:'hatena' } },
  { id:'bikkuri_floor', name:'びっくりのゆかにいたら', icon:'!', colorKey:'lcyan',
    block:{ type:'controls_if', extra:'bikkuri' } },

  // ── Conditionals (gray cards) ─────────────────────────────────────────────
  { id:'if_start', name:'もし〜なら',     icon:'if', colorKey:'gray',
    block:{ type:'controls_if' } },
  { id:'if_else',  name:'そうでなければ', icon:'el', colorKey:'gray', block:null },
  { id:'if_end',   name:'もしおわり',     icon:'⊣', colorKey:'gray', block:null },

  // ── Logic operators (red cards) ───────────────────────────────────────────
  { id:'op_and', name:'AND', icon:'∧', colorKey:'red',
    block:{ type:'logic_operation', fields:{ OP:'AND' } } },
  { id:'op_or',  name:'OR',  icon:'∨', colorKey:'red',
    block:{ type:'logic_operation', fields:{ OP:'OR'  } } },

  // ── Action / register (dark teal / purple) ────────────────────────────────
  // action_1/2 call the user-defined procedure whose name is t('action.name1')/'action.name2'
  // (procedures_callnoreturn + mutation is the correct Blockly way to call a named function)
  { id:'action_1', name: t('action.name1'), icon:'A1', colorKey:'dteal',
    block:{ type:'procedures_callnoreturn', mutation:{ name: t('action.name1') } } },
  { id:'action_2', name: t('action.name2'), icon:'A2', colorKey:'dteal',
    block:{ type:'procedures_callnoreturn', mutation:{ name: t('action.name2') } } },
  { id:'reg_to',   name:'〜にとうろく', icon:'📌', colorKey:'purple', block:null },
];

/* Fast ID → def lookup */
const CARD_BY_ID = Object.fromEntries(CARD_DEFS.map(d => [d.id, d]));

/* ─── LLM Recognition ───────────────────────────────────────────────────────
   Cloud-based card recognition using vision LLM APIs (Gemini/OpenAI/Claude).
   API keys are stored in localStorage. Off by default — user must enable.   */

const _SC_LS_KEY = 'cardScannerApiSettings';

/* ─── Motion Parameters ─────────────────────────────────────────────────────*/
const _SC_PARAMS_KEY = 'cardScannerParams';
const _SC_DEFAULT_PARAMS = {
  mode: 'time',        // 'time' | 'position'
  moveSpeed: 50,       // time mode: motor speed
  moveDuration: 0.5,   // time mode: seconds per forward step
  turnSpeed: 50,       // time mode: turn motor speed
  turnDuration: 0.4,   // time mode: seconds per 90° turn
  turnBackDuration: 1.0,
  waitDuration: 1.0,   // seconds per wait unit (×1 for wait_1, ×2 for wait_2, ×3 for wait_3)
  startX: 250,         // position mode: initial X
  startY: 250,         // position mode: initial Y
  startAngle: 0,       // position mode: initial angle (degrees, 0=up)
  stepSize: 50,        // position mode: distance per step (toio units)
  turnAngle: 90,       // position mode: degrees per turn
  posSpeed: 60,        // position mode: speed for moveTo
};
function _scGetParams() {
  try { return { ..._SC_DEFAULT_PARAMS, ...JSON.parse(localStorage.getItem(_SC_PARAMS_KEY) || '{}') }; }
  catch { return { ..._SC_DEFAULT_PARAMS }; }
}
function _scSaveParams(p) { localStorage.setItem(_SC_PARAMS_KEY, JSON.stringify(p)); }

/* Position-tracking state — null in time mode, {x,y,a,params} in position mode */
let _cardPosState = null;

function _scGetApiSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(_SC_LS_KEY) || '{}'); } catch { return {}; }
  // Silently clear deprecated Gemini preview-model names
  const _DEP = ['gemini-2.5-flash-preview-05-20','gemini-2.5-flash-preview-04-17',
                'gemini-2.5-flash-preview','gemini-2.5-pro-preview','gemini-2.5-flash'];
  if (_DEP.includes(s.geminiModel)) {
    s.geminiModel = '';
    localStorage.setItem(_SC_LS_KEY, JSON.stringify(s));
  }
  return s;
}
function _scSaveApiSettings(obj) {
  localStorage.setItem(_SC_LS_KEY, JSON.stringify(obj));
}

const _SC_CARD_PROMPT = `You are analyzing a photo of toio Playground Command cards.
The cards are arranged in one or more horizontal rows — each row is usually surrounded by a green border frame.
Rows can have two kinds of labels:
  • CUBE labels  : "キューブA", "キューブB", "Cube A", "Cube B", "A", "B", "キューブ" — a robot movement sequence
  • BEHAVIOR labels: "こうどう1", "こうどう2", "Action 1", "Action 2" — a FUNCTION DEFINITION (not a cube sequence)

IMPORTANT RULES:
1. Always return a JSON array of row objects so each row keeps its label:
   [{"label":"<label or null>","cards":[...]}, ...]
   Use null for unlabeled rows. Use the exact label text you see (e.g. "こうどう1", "キューブA").
2. If there is only one unlabeled row, you may return a flat array: ["card_id","card_id",...]
   but the row-object format is always preferred.
3. Read each row left-to-right. Read rows top-to-bottom.
4. Return ONLY the JSON — no explanation, no extra text.
5. CRITICAL: "こうどう1"/"こうどう2" row labels are FUNCTION DEFINITION labels, NOT cube labels.
   Never remap them to cube numbers. Return their label exactly as "こうどう1" or "こうどう2".

CRITICAL — light-cyan cards: there are THREE distinct light-cyan cards. DO NOT confuse them:
- half_chance   light-cyan  shows "1/2" white fraction text — means "50% chance branch"
- hatena_floor  light-cyan  shows a RED square with "?" icon and text "はてなのゆかにいたら" — means "if on ? floor"
- bikkuri_floor light-cyan  shows a DARK BLUE square with "!" icon and text "びっくりのゆかにいたら" — means "if on ! floor"
The icon color (red vs blue vs no color) is the key difference.

CRITICAL — orange cards: there are FIVE distinct orange cards. DO NOT confuse them:
- repeat_4   orange  shows "4×" with LOOPING/REPEAT arrows icon → means "repeat 4 times"
- repeat_5   orange  shows "5×" with LOOPING/REPEAT arrows icon → means "repeat 5 times"
- wait_1     orange  shows "1かいまつ" with CLOCK/HOURGLASS icon → means "wait 1 time" (NOT a repeat)
- wait_2     orange  shows "2かいまつ" with CLOCK/HOURGLASS icon → means "wait 2 times" (NOT a repeat)
- wait_3     orange  shows "3かいまつ" with CLOCK/HOURGLASS icon → means "wait 3 times" (NOT a repeat)
The key difference: repeat cards show circular looping arrows, wait cards show a clock or hourglass. "かいまつ" (回待つ) means "wait × times" — never return these as "repeat_N".

CRITICAL — dark-teal cards: there are FOUR distinct dark-teal cards. DO NOT confuse them:
- repeat_inf  dark-teal  shows only "∞" (infinity symbol, loop forever)
- repeat_end  dark-teal  shows "くりかえしおわり" (end of repeat loop)
- action_1    dark-teal  shows "こうどう1" (call behavior/function 1) — this is NOT a cube card
- action_2    dark-teal  shows "こうどう2" (call behavior/function 2) — this is NOT a cube card
The cube labels ("キューブA", "キューブB") on the border of a row are NOT card IDs — they describe which cube the sequence belongs to. "こうどう1"/"こうどう2" cards call pre-registered behaviors and must be returned as "action_1"/"action_2", never as a cube identifier.

Valid card IDs:
- reg_start   green  "コマンドをとうろく"
- reg_end     gray with green checkmark  "とうろくおわり"
- move_fwd    yellow  forward arrow
- turn_back   purple  U-turn / backward
- turn_left   blue    left-turn arrow
- turn_right  coral   right-turn arrow
- repeat_2    pink    "2×"
- repeat_3    pink    "3×"
- repeat_4    orange  "4×" (REPEAT icon — looping arrows)
- repeat_5    orange  "5×" (REPEAT icon — looping arrows)
- wait_1      orange  "1かいまつ" (WAIT/TIMER icon — clock or hourglass, NOT repeat arrows)
- wait_2      orange  "2かいまつ" (WAIT/TIMER icon — clock or hourglass, NOT repeat arrows)
- wait_3      orange  "3かいまつ" (WAIT/TIMER icon — clock or hourglass, NOT repeat arrows)
- repeat_inf  dark-teal  "∞" (infinity loop only)
- repeat_end  dark-teal  "くりかえしおわり" (end repeat)
- half_chance   light-cyan  "1/2" (fraction symbol, white text, no colored icon)
- hatena_floor  light-cyan  "はてなのゆかにいたら" — has a RED square with "?" in the center
- bikkuri_floor light-cyan  "びっくりのゆかにいたら" — has a DARK BLUE square with "!" in the center
- if_start    gray   "もし〜なら"
- if_else     gray   "そうでなければ"
- if_end      gray   "もしおわり"
- op_and      red    "AND"
- op_or       red    "OR"
- action_1    dark-teal "こうどう1" (behavior call 1 — NOT a cube reference)
- action_2    dark-teal "こうどう2" (behavior call 2 — NOT a cube reference)
- reg_to      purple "〜にとうろく"

Example (single row): ["reg_start","move_fwd","turn_right","reg_end"]
Example (two cubes): [{"label":"キューブA","cards":["reg_start","move_fwd","reg_end"]},{"label":"キューブB","cards":["reg_start","turn_right","move_fwd","reg_end"]}]
Example (with behavior and wait): [{"label":"キューブA","cards":["reg_start","move_fwd","wait_2","turn_right","reg_end"]},{"label":"こうどう1","cards":["move_fwd","move_fwd","wait_1"]}]`;

/* Default model names per provider (user can override in settings dialog) */
const _SC_DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  claude: 'claude-3-5-haiku-20241022',
};

/**
 * Extract the first well-balanced JSON array from an LLM response string.
 * Strips markdown code fences and finds the first `[…]` with proper bracket
 * depth tracking so trailing text like "Note: [foo]" is not included.
 */
function _extractJsonArray(text) {
  // Strip markdown code fences (```json … ``` or ``` … ```)
  let s = text.replace(/```(?:json|javascript)?\s*\n?/gi, '').replace(/```\s*/g, '');

  const start = s.indexOf('[');
  if (start === -1) return null;

  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc)                { esc = false; continue; }
    if (c === '\\' && inStr){ esc = true;  continue; }
    if (c === '"')          { inStr = !inStr; continue; }
    if (inStr)              continue;
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { if (--depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

/** Call LLM vision API; returns array of valid card IDs (throws on failure). */
async function _scRecognizeWithLLM(imageBase64, provider, apiKey, modelOverride) {
  const isDataUrl = imageBase64.startsWith('data:');
  const mimeType  = imageBase64.includes('data:image/png') ? 'image/png' : 'image/jpeg';
  const b64       = isDataUrl ? imageBase64.split(',')[1] : imageBase64;
  const model     = (modelOverride || '').trim() || _SC_DEFAULT_MODELS[provider] || '';

  let text = '';

  if (provider === 'gemini') {
    const url  = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [{ parts: [
        { text: _SC_CARD_PROMPT },
        { inline_data: { mime_type: mimeType, data: b64 } },
      ]}],
      generationConfig: { temperature: 0, maxOutputTokens: 800 },
    };
    const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) {
      let msg = json.error?.message || res.statusText;
      if (res.status === 404 || msg.includes('not found') || msg.includes('deprecated')) {
        msg += t('sc.aiModelDeprecated');
      }
      throw new Error(msg);
    }
    text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

  } else if (provider === 'openai') {
    const res  = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: [
          { type: 'text', text: _SC_CARD_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${b64}` } },
        ]}],
        temperature: 0, max_tokens: 800,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || res.statusText);
    text = json.choices?.[0]?.message?.content || '';

  } else if (provider === 'claude') {
    const res  = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } },
          { type: 'text', text: _SC_CARD_PROMPT },
        ]}],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || res.statusText);
    text = json.content?.[0]?.text || '';

  } else {
    throw new Error(t('sc.aiUnknownProvider') + provider);
  }

  // Extract first balanced [...] from response (handles trailing text like "Note: [foo]")
  const raw = _extractJsonArray(text);
  if (!raw) throw new Error(t('sc.aiNoJson') + text.slice(0, 120));

  // Robust JSON parse with automatic repair for common LLM quirks
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch (_e) {
    // Attempt to repair common JSON issues produced by LLMs:
    //  1. Trailing commas before ] or }
    //  2. Unquoted property keys
    //  3. Single-quoted strings
    //  4. JavaScript comments
    let fixed = raw
      .replace(/\/\/[^\n]*/g, '')                  // remove // comments
      .replace(/\/\*[\s\S]*?\*\//g, '')             // remove /* */ comments
      .replace(/,(\s*[}\]])/g, '$1')               // trailing commas
      .replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g,   // unquoted keys → "key":
               (_, pre, key, suf) => `${pre}"${key}"${suf}`)
      .replace(/'/g, '"');                          // single → double quotes
    try {
      arr = JSON.parse(fixed);
    } catch (e2) {
      throw new Error(t('sc.aiJsonParseError') + raw.slice(0, 160));
    }
  }
  if (!Array.isArray(arr)) throw new Error(t('sc.aiNotArray'));

  // Check if this is a structured multi-cube response: [{label, cards}, ...]
  if (arr.length > 0 && arr[0] !== null && typeof arr[0] === 'object' && !Array.isArray(arr[0]) && 'cards' in arr[0]) {
    // Structured format — return as rows
    return arr
      .filter(row => row && Array.isArray(row.cards))
      .map(row => ({
        label: row.label || null,
        cards: row.cards.filter(id => CARD_BY_ID[id]),
      }))
      .filter(row => row.cards.length > 0);
  }

  // Flat format — wrap in a single row
  const flatIds = arr.filter(id => CARD_BY_ID[id]);
  return [{ label: null, cards: flatIds }];
}

/* ─── Color Groups ──────────────────────────────────────────────────────────
   hc/sc/lc = HSL centre values used for distance-based matching.
   Cards that share a colorKey need user disambiguation (same physical card
   but different face showing).                                              */
const COLOR_GROUPS = {
  yellow: { hc: 52, sc:88, lc:58, label:'黄色',           hex:'#FFD700' },
  green:  { hc:130, sc:62, lc:52, label:'緑',             hex:'#4CAF50' },
  blue:   { hc:214, sc:70, lc:55, label:'青',             hex:'#2196F3' },
  coral:  { hc: 10, sc:76, lc:62, label:'サーモン',       hex:'#FF7058' },
  pink:   { hc:334, sc:72, lc:60, label:'ピンク',         hex:'#E91E92' },
  orange: { hc: 33, sc:90, lc:57, label:'オレンジ',       hex:'#FF9800' },
  dteal:  { hc:176, sc:62, lc:40, label:'ダークティール', hex:'#00897B' },
  lcyan:  { hc:195, sc:60, lc:65, label:'シアン',         hex:'#00BCD4' },
  gray:   { hc:  0, sc: 5, lc:80, label:'グレー',         hex:'#BDBDBD' },
  red:    { hc:  4, sc:87, lc:52, label:'赤',             hex:'#F44336' },
  purple: { hc:284, sc:64, lc:50, label:'紫',             hex:'#9C27B0' },
};

/* Saturation threshold: pixels below this are treated as achromatic */
const GRAY_SAT_MAX = 22;

/* ─── Color Math ─────────────────────────────────────────────────────────── */

/** Convert 8-bit RGB → HSL (h: 0–360, s: 0–100, l: 0–100). */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if      (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

/**
 * Compute dominant HSL from a flat RGBA pixel array.
 * Uses saturation-weighted circular mean for hue, so:
 *   • White icons / black text barely influence the result
 *   • The card's vivid background colour dominates
 */
function dominantHSL(pixels) {
  // Circular accumulation for hue (avoids 0°/360° wrap-around bias)
  let hx = 0, hy = 0, sSum = 0, lSum = 0, wSum = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const bright = (r + g + b) / 3;
    if (bright < 28 || bright > 238) continue; // skip deep shadows & specular glare

    const hsl = rgbToHsl(r, g, b);
    // Saturation^1.5 weight: desaturated (white/gray/black) pixels have near-zero weight;
    // the card's vivid background gets full weight.
    const w = 0.05 + Math.pow(hsl.s / 100, 1.5) * 0.95;

    const rad = hsl.h * Math.PI / 180;
    hx += Math.cos(rad) * w;
    hy += Math.sin(rad) * w;
    sSum += hsl.s * w;
    lSum += hsl.l * w;
    wSum += w;
  }

  if (wSum < 0.5) return { h: 0, s: 0, l: 95 }; // treat as white/background

  const h = ((Math.atan2(hy / wSum, hx / wSum) * 180 / Math.PI) + 360) % 360;
  return { h, s: sSum / wSum, l: lSum / wSum };
}

/**
 * Weighted HSL distance from measured (h, s, l) to a colour-group centre.
 * Hue is the primary discriminator; lightness is downweighted because
 * camera exposure varies dramatically with real-world lighting.
 */
function groupDistance(h, s, l, grpKey) {
  if (grpKey === 'gray') return s < GRAY_SAT_MAX ? 0 : 999;
  const g  = COLOR_GROUPS[grpKey];
  const dh = Math.min(Math.abs(h - g.hc), 360 - Math.abs(h - g.hc));
  const ds = Math.abs(s - g.sc);
  const dl = Math.abs(l - g.lc);
  return Math.sqrt(dh * dh * 0.65 + ds * ds * 0.25 + dl * dl * 0.10);
}

/** Return the best matching colour group key, or null if no good match. */
function bestGroup(h, s, l) {
  if (s < GRAY_SAT_MAX) return 'gray';
  let best = null, bestD = Infinity;
  for (const key of Object.keys(COLOR_GROUPS)) {
    if (key === 'gray') continue;
    const d = groupDistance(h, s, l, key);
    if (d < bestD) { bestD = d; best = key; }
  }
  return bestD < 58 ? best : null; // relaxed from 42 → better real-world tolerance
}

/* ─── Card Region Detection ─────────────────────────────────────────────────
   2D grid-based approach (supports multiple rows of cards):

   Phase A – Row detection
     1. Compute non-white pixel density for each horizontal row of pixels.
     2. Smooth and threshold: runs of high density = card row bands.

   Phase B – Per-row column detection  (same hue-histogram logic as before)
     3. Within each row band, scan narrow vertical strips (~85 across image).
     4. 10% Y-margin inside each row band excludes green border bleed.
     5. Modal-hue → bestGroup per strip; 7-column majority-vote smoothing.
     6. Merge consecutive same-colour strips; close gaps ≤3% width.
     7. Filter: keep regions ≥2.5% of image width.

   Returns [{grp, startX, endX, startY, endY}] in reading order.
*/

/**
 * Detect horizontal bands (rows) of card content in the image.
 * Separates by white/near-white background regions between rows.
 * @returns {Array<{startY,endY}>}
 */
function detectCardRows(ctx, W, H) {
  const STEP = Math.max(2, Math.round(H / 150));

  // Per-row non-white density
  const density = new Float32Array(H);
  for (let y = 0; y < H; y += STEP) {
    const sh   = Math.min(STEP, H - y);
    const data = ctx.getImageData(0, y, W, sh).data;
    let content = 0, total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] + data[i+1] + data[i+2]) / 3 < 228) content++;
    }
    const ratio = content / total;
    for (let dy = 0; dy < STEP && y+dy < H; dy++) density[y+dy] = ratio;
  }

  // Smooth with ~3% of image-height window
  const WIN    = Math.max(4, Math.round(H * 0.03));
  const smooth = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0, c = 0;
    for (let dy = -WIN; dy <= WIN; dy++) {
      if (y+dy >= 0 && y+dy < H) { s += density[y+dy]; c++; }
    }
    smooth[y] = s / c;
  }

  // Extract bands
  const THRESH = 0.10;        // ≥10% non-white → card content
  const MIN_H  = H * 0.06;   // row must be ≥6% of image height
  const bands  = [];
  let inBand = false, bandStart = 0;
  for (let y = 0; y <= H; y++) {
    if (!inBand && y < H && smooth[y] > THRESH) {
      inBand = true; bandStart = y;
    } else if (inBand && (y >= H || smooth[y] <= THRESH)) {
      inBand = false;
      if (y - bandStart >= MIN_H) bands.push({ startY: bandStart, endY: y });
    }
  }
  return bands;
}

/**
 * Detect card regions within a horizontal Y band [yStart, yEnd].
 * Green borders at top/bottom of the band are excluded via a 10% inner margin.
 * @returns {Array<{grp, startX, endX}>}
 */
function detectCardRegionsInBand(ctx, W, yStart, yEnd) {
  const STRIP = Math.max(2, Math.round(W / 85));
  const BINS  = 36;

  // 10% inner Y-margin excludes green-border bleed from adjacent rows
  const margin  = Math.round((yEnd - yStart) * 0.10);
  const ySamp1  = yStart + margin;
  const ySamp2  = yEnd   - margin;
  if (ySamp2 - ySamp1 < 4) return [];

  // ── Per-strip hue histogram ────────────────────────────────────────────
  const rawGroups = [];
  for (let sx = 0; sx < W; sx += STRIP) {
    const sw   = Math.min(STRIP, W - sx);
    const data = ctx.getImageData(sx, ySamp1, sw, ySamp2 - ySamp1).data;

    const hueBins  = new Float32Array(BINS);
    let achroCount = 0, sSum = 0, lSum = 0, chromCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      const bright = (r+g+b) / 3;
      if (bright < 28 || bright > 240) continue;
      const hsl = rgbToHsl(r, g, b);
      if (hsl.s < 20) {
        if (hsl.l > 28 && hsl.l < 88) achroCount++;
      } else {
        const w = (hsl.s / 100) ** 2;
        hueBins[Math.floor(hsl.h / 10) % BINS] += w;
        sSum += hsl.s; lSum += hsl.l; chromCount++;
      }
    }

    let maxBin = 0, maxVal = 0, chromTot = 0;
    for (let b = 0; b < BINS; b++) {
      chromTot += hueBins[b];
      if (hueBins[b] > maxVal) { maxVal = hueBins[b]; maxBin = b; }
    }

    let group = null;
    if (achroCount > chromTot * 0.9 && achroCount > 6) {
      group = 'gray';
    } else if (chromTot > 1.5 && maxVal / chromTot >= 0.16 && chromCount > 0) {
      group = bestGroup(maxBin * 10 + 5, sSum / chromCount, lSum / chromCount);
    }
    rawGroups.push(group);
  }

  // ── Spatial smoothing — 5-column majority-vote ─────────────────────────
  // WIN=2 (5 strips) is narrower than WIN=3 (7 strips) so thin green
  // separator lines between adjacent same-colour cards are NOT smoothed out.
  const WIN      = 2;
  const smoothed = rawGroups.map((_, ci) => {
    const votes = {};
    let total = 0;
    for (let di = -WIN; di <= WIN; di++) {
      const g = rawGroups[ci + di];
      if (g) { votes[g] = (votes[g] || 0) + 1; total++; }
    }
    if (total === 0) return null;
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    return (best && best[1] / (2 * WIN + 1) > 0.28) ? best[0] : null;
  });

  // ── Merge consecutive same-colour strips ────────────────────────────────
  const raw = [];
  let cur   = null;
  for (let i = 0; i < smoothed.length; i++) {
    const grp = smoothed[i];
    const x   = i * STRIP;
    if (grp) {
      if (cur && cur.grp === grp) cur.endX = x + STRIP;
      else { if (cur) raw.push(cur); cur = { grp, startX: x, endX: x + STRIP }; }
    } else {
      if (cur) { raw.push(cur); cur = null; }
    }
  }
  if (cur) raw.push(cur);

  // ── Close small gaps (tightened so same-colour separators are preserved) ──
  const GAP_MAX = Math.round(W * 0.012);
  const merged  = [];
  for (const region of raw) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.grp === region.grp && (region.startX - prev.endX) <= GAP_MAX) {
        prev.endX = region.endX; continue;
      }
    }
    merged.push({ ...region });
  }

  // ── Post-split: wide same-colour regions likely contain 2 adjacent cards ─
  // If a region is wider than WIDE_RATIO × average region width, look for a
  // green separator strip inside it and split there.
  const avgW    = merged.reduce((s, r) => s + (r.endX - r.startX), 0) / (merged.length || 1);
  const WIDE_RATIO = 1.7;
  const minCard = W * 0.07;   // a single card must be at least 7% of width

  const _findSepX = (x1, x2) => {
    // Scan every STRIP-width column within [x1, x2] for green-ness.
    // Green here means: hue 80–160°, saturation ≥ 30, lightness 20–80.
    let bestX  = -1, bestScore = 0.06; // need ≥6% green pixels to count
    for (let sx = x1; sx < x2 - STRIP; sx += STRIP) {
      const sw = Math.min(STRIP * 2, x2 - sx);
      const sh = ySamp2 - ySamp1;
      if (sw < 1 || sh < 1) continue;
      const data = ctx.getImageData(sx, ySamp1, sw, sh).data;
      let greenPx = 0;
      for (let i = 0; i < data.length; i += 4) {
        const hsl = rgbToHsl(data[i], data[i+1], data[i+2]);
        if (hsl.h >= 80 && hsl.h <= 160 && hsl.s >= 28 && hsl.l >= 20 && hsl.l <= 80) greenPx++;
      }
      const score = greenPx / (sw * sh);
      if (score > bestScore) { bestScore = score; bestX = sx + Math.floor(sw / 2); }
    }
    return bestX;
  };

  const split = [];
  for (const region of merged) {
    const rw = region.endX - region.startX;
    if (rw >= avgW * WIDE_RATIO && rw >= minCard * 2) {
      const sepX = _findSepX(region.startX, region.endX);
      if (sepX > region.startX + minCard && sepX < region.endX - minCard) {
        split.push({ grp: region.grp, startX: region.startX, endX: sepX });
        split.push({ grp: region.grp, startX: sepX,          endX: region.endX });
        continue;
      }
    }
    split.push(region);
  }

  const minW = W * 0.025;
  return split.filter(r => r.endX - r.startX >= minW);
}

/**
 * 2D card grid detection.
 * Detects multiple rows of cards and cards within each row.
 * Green borders between rows are used only as separators (excluded from
 * card-colour classification via inner-margin sampling in detectCardRegionsInBand).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W  canvas width
 * @param {number} H  canvas height
 * @returns {Array<{grp, startX, endX, startY, endY}>}  reading order: top→bottom, left→right
 */
function detectCardGrid(ctx, W, H) {
  const rows = detectCardRows(ctx, W, H);

  // Single-row fallback: if no clear row bands found, use middle 80% of height
  if (rows.length === 0) {
    const yS = Math.floor(H * 0.10);
    const yE = Math.ceil(H  * 0.90);
    return detectCardRegionsInBand(ctx, W, yS, yE)
      .map(r => ({ ...r, startY: yS, endY: yE }));
  }

  // Detect cards within each row band and merge into one flat list.
  // Each row is validated: must contain ≥2 distinct colour groups so that
  // decorative title bars (uniform single colour) are silently ignored.
  const cells = [];
  for (const row of rows) {
    const regions = detectCardRegionsInBand(ctx, W, row.startY, row.endY);
    if (regions.length === 0) continue;

    // ── Row validation: skip uniform-colour rows (e.g. title bars) ──────
    const uniqueColors = new Set(regions.map(r => r.grp));
    if (uniqueColors.size < 2) continue;

    // ── Edge filter: ignore very thin strips at the left/right image edges.
    // The toio mat has a green border strip that runs outside the actual
    // card area; these appear as a single narrow green region at x≈0 or x≈W.
    const MIN_CARD_W = W * 0.04;   // a real card must be ≥4% of image width
    const EDGE_MARGIN = W * 0.03;  // ignore regions whose right edge is within 3% of W
    for (const r of regions) {
      const rw = r.endX - r.startX;
      if (rw < MIN_CARD_W) continue;         // too narrow → border strip
      if (r.endX <= EDGE_MARGIN) continue;   // entirely in left margin
      if (r.startX >= W - EDGE_MARGIN) continue; // entirely in right margin
      cells.push({ ...r, startY: row.startY, endY: row.endY });
    }
  }
  return cells;
}

/* ─── Blockly XML Builder ────────────────────────────────────────────────────
   Converts an ordered list of card IDs into Blockly workspace XML.
   Handles nesting: repeat / if cards push a "body" context; *_end cards pop it.
*/

/** XML-escape a value. */
function escXml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Serialise a sequence of tree nodes into chained Blockly XML.
 * Each node: { cardId, children[], hasElse, elseChildren[] }
 */
function serializeSequence(nodes) {
  const parts = nodes.map(n => serializeNode(n)).filter(Boolean);
  if (parts.length === 0) return '';
  // Chain right-to-left via <next> injection
  let xml = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0; i--) {
    xml = parts[i].replace(/<\/block>$/, `<next>${xml}</next></block>`);
  }
  return xml;
}

// Module-level cube index used during XML serialization (set by cardsToWorkspaceXML)
let _currentCubeIdx = 0;

function serializeNode(node) {
  const def = CARD_BY_ID[node.cardId];
  if (!def || !def.block) return ''; // structural / no-block card

  const b = def.block;
  const cubeField = String(_currentCubeIdx); // use module-level cube index

  // ── Position-mode: emit relative-move blocks for move/turn cards ─────────
  // toio_move_rel (heading-relative forward) and toio_rotate_rel (angle delta)
  // are self-contained — no position tracking needed at generation time.
  if (_cardPosState && b) {
    const p   = _cardPosState.params;
    const spd = p.posSpeed;

    if (node.cardId === 'move_fwd') {
      return `<block type="toio_move_rel">` +
        `<field name="CUBE">${cubeField}</field>` +
        `<field name="DIRECTION">FORWARD</field>` +
        `<value name="DIST"><block type="math_number"><field name="NUM">${p.stepSize}</field></block></value>` +
        `<value name="SPEED"><block type="math_number"><field name="NUM">${spd}</field></block></value>` +
        `</block>`;
    } else if (node.cardId === 'turn_right') {
      return `<block type="toio_rotate_rel">` +
        `<field name="CUBE">${cubeField}</field>` +
        `<field name="DIRECTION">RIGHT</field>` +
        `<value name="ANGLE"><block type="math_number"><field name="NUM">${p.turnAngle}</field></block></value>` +
        `<value name="SPEED"><block type="math_number"><field name="NUM">${spd}</field></block></value>` +
        `</block>`;
    } else if (node.cardId === 'turn_left') {
      return `<block type="toio_rotate_rel">` +
        `<field name="CUBE">${cubeField}</field>` +
        `<field name="DIRECTION">LEFT</field>` +
        `<value name="ANGLE"><block type="math_number"><field name="NUM">${p.turnAngle}</field></block></value>` +
        `<value name="SPEED"><block type="math_number"><field name="NUM">${spd}</field></block></value>` +
        `</block>`;
    } else if (node.cardId === 'turn_back') {
      return `<block type="toio_rotate_rel">` +
        `<field name="CUBE">${cubeField}</field>` +
        `<field name="DIRECTION">RIGHT</field>` +
        `<value name="ANGLE"><block type="math_number"><field name="NUM">180</field></block></value>` +
        `<value name="SPEED"><block type="math_number"><field name="NUM">${spd}</field></block></value>` +
        `</block>`;
    }
    // Other card types fall through to normal block handling
  }

  let xml = `<block type="${escXml(b.type)}">`;

  // ── Mutation (must come first in Blockly XML) ─────────────────────────
  // Used by procedures_callnoreturn: <mutation name="こうどう1"></mutation>
  if (b.mutation) {
    const attrs = Object.entries(b.mutation)
      .map(([k, v]) => `${k}="${escXml(String(v))}"`)
      .join(' ');
    xml += `<mutation ${attrs}></mutation>`;
  }

  // ── CUBE field — use _currentCubeIdx set by caller ────────────────────
  // Note: procedures_callnoreturn has no CUBE field — excluded intentionally
  // Note: toio_wait has NO CUBE field (only SECONDS input).
  //       toio_wait_button DOES have CUBE — match with 'toio_wait_' (underscore) to avoid false match.
  const hasCubeField = b.type.startsWith('toio_move') || b.type.startsWith('toio_turn') ||
                       b.type.startsWith('toio_stop') || b.type.startsWith('toio_led')  ||
                       b.type.startsWith('toio_play') || b.type.startsWith('toio_stop_sound') ||
                       b.type.startsWith('toio_wait_') || b.type.startsWith('toio_print') ||
                       b.type === 'toio_run_action';  // kept for legacy workspaces
  if (hasCubeField) {
    xml += `<field name="CUBE">${cubeField}</field>`;
  }

  // ── Explicit fields ───────────────────────────────────────────────────
  if (b.fields) {
    for (const [fname, fval] of Object.entries(b.fields)) {
      xml += `<field name="${escXml(fname)}">${escXml(fval)}</field>`;
    }
  }

  // ── Apply user-configured time-mode params ────────────────────────────
  let effectiveValues = b.values ? { ...b.values } : null;
  if (effectiveValues && !_cardPosState) {
    const tp = _scGetParams();
    if (node.cardId === 'move_fwd') {
      effectiveValues.SPEED    = tp.moveSpeed;
      effectiveValues.DURATION = tp.moveDuration;
    } else if (node.cardId === 'turn_back') {
      effectiveValues.SPEED    = tp.moveSpeed;
      effectiveValues.DURATION = tp.turnBackDuration;
    } else if (node.cardId === 'turn_right' || node.cardId === 'turn_left') {
      effectiveValues.SPEED    = tp.turnSpeed;
      effectiveValues.DURATION = tp.turnDuration;
    } else if (node.cardId === 'wait_1') {
      effectiveValues.SECONDS  = Math.round((tp.waitDuration ?? 1.0) * 10) / 10;
    } else if (node.cardId === 'wait_2') {
      effectiveValues.SECONDS  = Math.round((tp.waitDuration ?? 1.0) * 2 * 10) / 10;
    } else if (node.cardId === 'wait_3') {
      effectiveValues.SECONDS  = Math.round((tp.waitDuration ?? 1.0) * 3 * 10) / 10;
    }
  }

  // ── Value (number) inputs ─────────────────────────────────────────────
  if (effectiveValues) {
    for (const [vname, vval] of Object.entries(effectiveValues)) {
      xml += `<value name="${escXml(vname)}"><block type="math_number"><field name="NUM">${vval}</field></block></value>`;
    }
  }

  // ── Boolean condition inputs for control blocks ───────────────────────
  const boolTrue = `<block type="logic_boolean"><field name="BOOL">TRUE</field></block>`;
  if (b.type === 'controls_whileUntil') {
    xml += `<value name="BOOL">${boolTrue}</value>`;
  }
  if (b.type === 'controls_if') {
    if (b.extra === 'half') {
      // 1/2かいまつ: 50% chance branch.
      const cond = `<block type="logic_compare"><field name="OP">EQ</field>` +
        `<value name="A"><block type="math_random_int"><value name="FROM"><block type="math_number"><field name="NUM">0</field></block></value><value name="TO"><block type="math_number"><field name="NUM">1</field></block></value></block></value>` +
        `<value name="B"><block type="math_number"><field name="NUM">0</field></block></value></block>`;
      xml += `<value name="IF0">${cond}</value>`;
    } else if (b.extra === 'hatena') {
      // はてなのゆかにいたら: checks Boolean variable "はてなのゆか"
      xml += `<value name="IF0"><block type="variables_get"><field name="VAR" id="var_hatena_yuka">はてなのゆか</field></block></value>`;
    } else if (b.extra === 'bikkuri') {
      // びっくりのゆかにいたら: checks Boolean variable "びっくりのゆか"
      xml += `<value name="IF0"><block type="variables_get"><field name="VAR" id="var_bikkuri_yuka">びっくりのゆか</field></block></value>`;
    } else {
      xml += `<value name="IF0">${boolTrue}</value>`;
    }
    if (node.hasElse) {
      xml = xml.replace(
        `<block type="${escXml(b.type)}">`,
        `<block type="${escXml(b.type)}"><mutation else="1"></mutation>`
      );
    }
  }

  // ── Body statement ────────────────────────────────────────────────────
  const doName = (b.type === 'controls_if') ? 'DO0' : 'DO';
  if (node.children && node.children.length > 0) {
    const inner = serializeSequence(node.children);
    if (inner) xml += `<statement name="${doName}">${inner}</statement>`;
  }

  // ── Else branch ───────────────────────────────────────────────────────
  if (node.hasElse && node.elseChildren && node.elseChildren.length > 0) {
    const elseInner = serializeSequence(node.elseChildren);
    if (elseInner) xml += `<statement name="ELSE">${elseInner}</statement>`;
  }

  xml += `</block>`;
  return xml;
}

/**
 * Build a Blockly block tree (root node) from a sequence of card IDs.
 * @param {string[]} seq  Card IDs (already stripped of reg_start/reg_end)
 */
function _buildCardTree(seq) {
  const OPENERS = new Set([
    'repeat_2','repeat_3','repeat_4','repeat_5',
    'repeat_inf','if_start','half_chance',
    'hatena_floor','bikkuri_floor',
  ]);
  const CLOSERS = new Set(['repeat_end','if_end']);

  // Value-only blocks (no previousStatement) cannot appear in statement chains.
  // op_and / op_or use logic_operation which is a boolean VALUE block.
  // Skip them here — they can be wired manually in the workspace if needed.
  const VALUE_ONLY = new Set(['op_and', 'op_or']);

  const root  = { cardId: null, children: [], hasElse: false, elseChildren: [] };
  const stack = [root];

  for (const id of seq) {
    if (VALUE_ONLY.has(id)) continue;  // skip boolean value blocks

    const top = stack[stack.length - 1];
    if (CLOSERS.has(id)) {
      if (stack.length > 1) stack.pop();
    } else if (id === 'if_else') {
      if (stack.length > 1) stack[stack.length - 1].hasElse = true;
    } else if (OPENERS.has(id)) {
      const node = { cardId: id, children: [], hasElse: false, elseChildren: [] };
      if (top.hasElse) top.elseChildren.push(node);
      else             top.children.push(node);
      stack.push(node);
    } else {
      const node = { cardId: id, children: [] };
      if (top.hasElse) top.elseChildren.push(node);
      else             top.children.push(node);
    }
  }
  return root;
}

/**
 * Convert an ordered array of card IDs (+ optional cube assignments) into
 * Blockly workspace XML.
 *
 * When cubeAssignments contains multiple distinct cube indices, each cube's
 * cards are wrapped in a separate `toio_on_start` hat block so they run in
 * parallel when the Run button is pressed.
 *
 * @param {string[]}  cardIds           Card ID array (cube movement cards only)
 * @param {number[]}  [cubeAssignments] Parallel array of cube indices (default all 0)
 * @param {Array}     [actionDefRows]   [{name, cards}] — function definition rows
 *                                      that become procedures_defnoreturn blocks
 */
function cardsToWorkspaceXML(cardIds, cubeAssignments, actionDefRows = []) {
  // Set position-mode flag before serialization.
  const _params = _scGetParams();
  if (_params.mode === 'position') {
    _cardPosState = { params: _params };
  } else {
    _cardPosState = null;
  }

  // Structural card IDs that are never emitted as Blockly blocks
  const STRUCT = new Set(['reg_start', 'reg_end', 'reg_to']);

  const assigns = (cubeAssignments && cubeAssignments.length === cardIds.length)
    ? cubeAssignments
    : new Array(cardIds.length).fill(0);

  // Determine if multi-cube (more than one distinct cube index)
  const distinctCubes = [...new Set(assigns)].sort();
  const multiCube = distinctCubes.length > 1;

  const allBlocks = [];  // collects all top-level block XML strings

  if (!multiCube) {
    // ── Single cube / no cube cards: flat sequence ─────────────────────
    _currentCubeIdx = distinctCubes[0] ?? 0;
    const seq = cardIds.filter(id => !STRUCT.has(id));
    const root = _buildCardTree(seq);
    const bodyXml = serializeSequence(root.children);
    if (bodyXml) {
      allBlocks.push(bodyXml.replace(/^<block /, '<block x="40" y="40" '));
    }
  } else {
    // ── Multi-cube: one toio_on_start stack per cube, side by side ─────
    for (const ci of distinctCubes) {
      const cubeCards = cardIds.filter((id, i) => assigns[i] === ci);
      const seq = cubeCards.filter(id => !STRUCT.has(id));
      if (seq.length === 0) continue;

      _currentCubeIdx = ci;
      const root = _buildCardTree(seq);
      const bodyXml = serializeSequence(root.children);
      if (!bodyXml) continue;

      const xOffset = 40 + ci * 260;
      allBlocks.push(
        `<block type="toio_on_start" x="${xOffset}" y="40">` +
          `<statement name="DO">${bodyXml}</statement>` +
        `</block>`
      );
    }
  }

  // ── Procedure definition blocks (こうどう1 / こうどう2 rows) ──────────
  // Positioned below the cube stacks, spread horizontally.
  const defCubeIdx = distinctCubes[0] ?? 0; // action defs move the first (or only) cube
  for (let i = 0; i < (actionDefRows || []).length; i++) {
    const { name, cards } = actionDefRows[i];
    // Strip structural marker cards — only movement/logic cards go into the body
    const seq = cards.filter(id => !STRUCT.has(id));

    const xOff = 40 + i * 300;
    const yOff = 360;   // below the cube stacks

    let defXml = `<block type="procedures_defnoreturn" x="${xOff}" y="${yOff}">`;
    defXml += `<mutation></mutation>`;
    defXml += `<field name="NAME">${escXml(name)}</field>`;

    if (seq.length > 0) {
      _currentCubeIdx = defCubeIdx;
      const root    = _buildCardTree(seq);
      const bodyXml = serializeSequence(root.children);
      if (bodyXml) {
        defXml += `<statement name="STACK">${bodyXml}</statement>`;
      }
    }

    defXml += `</block>`;
    allBlocks.push(defXml);
  }

  // ── Standalone AND / OR value blocks ────────────────────────────────────
  // logic_operation is an output (boolean) block — it cannot be in a statement
  // chain.  Emit each occurrence as a top-level floating block with shadow inputs
  // so the user can drag it into any IF / while condition socket.
  // Shadow blocks (TRUE/TRUE) serve as default placeholder inputs.
  const boolShadow = `<shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow>`;
  const VALUE_BLOCK_IDS = new Set(['op_and', 'op_or']);
  const standaloneCards = cardIds.filter(id => VALUE_BLOCK_IDS.has(id));
  let sbX = 340, sbY = 40;   // right-hand column, beside the main stacks
  for (const id of standaloneCards) {
    const def = CARD_BY_ID[id];
    if (!def?.block) continue;
    const b = def.block;
    const op = (b.fields && b.fields.OP) || 'AND';
    const vxml =
      `<block type="logic_operation" x="${sbX}" y="${sbY}">` +
        `<field name="OP">${escXml(op)}</field>` +
        `<value name="A">${boolShadow}</value>` +
        `<value name="B">${boolShadow}</value>` +
      `</block>`;
    allBlocks.push(vxml);
    sbX += 220;
  }

  // ── Auto-generate procedure definition blocks for こうどう1 / こうどう2 ──
  // When action_1 / action_2 CALL cards appear in the main sequence but there
  // is no corresponding definition row (actionDefRows), create an empty
  // procedures_defnoreturn block so the user can fill it in.
  const actionDefNames = new Set((actionDefRows || []).map(d => d.name));
  let procX = 40, procY = 480;
  const ACTION_IDS = [
    { id: 'action_1', name: t('action.name1') },
    { id: 'action_2', name: t('action.name2') },
  ];
  for (const { id, name } of ACTION_IDS) {
    if (cardIds.includes(id) && !actionDefNames.has(name)) {
      allBlocks.push(
        `<block type="procedures_defnoreturn" x="${procX}" y="${procY}">` +
          `<mutation></mutation>` +
          `<field name="NAME">${escXml(name)}</field>` +
        `</block>`
      );
      procX += 320;
    }
  }

  if (allBlocks.length === 0) {
    return '<xml xmlns="https://developers.google.com/blockly/xml"></xml>';
  }

  // Declare floor-condition variables if any floor cards are used.
  // This ensures the variables appear in the Blockly variable list immediately.
  const allCardIds = [...cardIds, ...(actionDefRows || []).flatMap(r => r.cards)];
  const varDecls = [];
  if (allCardIds.some(id => id === 'hatena_floor')) {
    varDecls.push(`<variable id="var_hatena_yuka">はてなのゆか</variable>`);
  }
  if (allCardIds.some(id => id === 'bikkuri_floor')) {
    varDecls.push(`<variable id="var_bikkuri_yuka">びっくりのゆか</variable>`);
  }
  const varSection = varDecls.length
    ? `\n  <variables>${varDecls.join('')}</variables>` : '';

  return `<xml xmlns="https://developers.google.com/blockly/xml">${varSection}\n  ${allBlocks.join('\n  ')}\n</xml>`;
}

/* ─── CardScanner UI Class ──────────────────────────────────────────────────*/

class CardScanner {
  constructor() {
    this._modal    = null;
    this._stream   = null;   // active getUserMedia stream
    this._imgEl    = null;   // HTMLImageElement with loaded photo
    this._imgB64   = null;   // base64 data URL of loaded image (for LLM)
    this._regions         = [];     // detected regions: [{grp, startX, endX}]
    this._cards           = [];     // confirmed card IDs in sequence order (cube movements)
    this._cubeAssignments = [];     // parallel array: cube index (0-based) for each card
    this._cubeRowLabels   = [];     // label string per cube row (for display)
    this._actionDefRows   = [];     // function definition rows: [{name, cards:[]}]
    this._W            = 0;      // scaled analysis width
    this._H            = 0;      // scaled analysis height
    this._analysisCtx  = null;   // canvas context of scaled analysis image (for re-use)
    this._dragIdx      = -1;     // drag-and-drop source index
    this._aiMode       = false;  // use LLM recognition when true
    this._selMode      = false;  // rectangle-selection tool active
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  open() {
    if (!this._modal) this._buildModal();
    this._modal.style.display = 'flex';
    document.body.appendChild(this._modal);
  }

  close() {
    this._stopCamera();
    if (this._modal) {
      this._modal.style.display = 'none';
      if (this._modal.parentNode) this._modal.parentNode.removeChild(this._modal);
    }
    this._modal = null;
  }

  /* ── Modal construction ─────────────────────────────────────────────*/

  _buildModal() {
    const m = document.createElement('div');
    m.id        = 'card-scanner-modal';
    m.className = 'scanner-modal';

    m.innerHTML = `
<div class="scanner-dialog">
  <!-- Header -->
  <div class="scanner-hdr">
    <span class="scanner-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      ${t('sc.title')}
    </span>
    <button class="scanner-close" id="sc-close-btn" title="${t('sc.close')}">×</button>
  </div>

  <!-- Body -->
  <div class="scanner-body">

    <!-- ── Step 1: Capture ── -->
    <div id="sc-step-capture" class="sc-step" style="display:flex">
      <p class="sc-hint">
        ${t('sc.hint')}<br>
        <small>${t('sc.hintSmall')}</small>
      </p>
      <div class="sc-capture-row" id="sc-capture-row">
        <button class="btn btn-primary sc-big-btn" id="sc-camera-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          ${t('sc.camera')}
        </button>
        <label class="btn btn-ghost sc-big-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          ${t('sc.fileSelect')}
          <input type="file" id="sc-file-input" accept="image/*" style="display:none">
        </label>
      </div>

      <!-- Live video preview -->
      <div id="sc-video-wrap" style="display:none">
        <video id="sc-video" autoplay playsinline muted style="width:100%;max-width:480px;border-radius:6px;border:1.5px solid var(--border)"></video>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:8px">
          <button class="btn btn-success sc-big-btn" id="sc-snap-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
            ${t('sc.snap')}
          </button>
          <button class="btn btn-ghost" id="sc-cam-cancel-btn">${t('sc.cancel')}</button>
        </div>
      </div>

      <!-- Preview after capture -->
      <div id="sc-preview-wrap" style="display:none;flex-direction:column;align-items:center;gap:10px">
        <div style="position:relative;display:inline-block;max-width:100%">
          <img id="sc-preview-img" alt="preview" style="max-width:100%;max-height:200px;display:block;border-radius:6px;border:1.5px solid var(--border)">
          <canvas id="sc-overlay-canvas" style="position:absolute;top:0;left:0;pointer-events:none;border-radius:6px"></canvas>
        </div>
        <div class="sc-analyze-bar">
          <div class="sc-mode-seg">
            <button class="sc-mode-btn active" id="sc-mode-local">${t('sc.local')}</button>
            <button class="sc-mode-btn" id="sc-mode-ai">AI<sup class="ai-beta-badge">β</sup></button>
          </div>
          <button class="btn btn-primary" id="sc-analyze-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            ${t('sc.analyze')}
          </button>
          <button class="btn btn-ghost btn-sm" id="sc-params-btn" title="${t('sc.settings')}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            ${t('sc.settings')}
          </button>
          <button class="btn btn-ghost" id="sc-retake-btn">${t('sc.retake')}</button>
        </div>
      </div>
    </div><!-- /step-capture -->

    <!-- ── Step 2: Review detected cards (2-column) ── -->
    <div id="sc-step-review" class="sc-step sc-review-2col" style="display:none">

      <!-- LEFT: scanned image with numbered overlays -->
      <div class="sc-review-img-col" id="sc-review-img-col">
        <div class="sc-review-img-wrap" id="sc-review-img-wrap" style="position:relative">
          <img id="sc-review-img" alt="scan">
          <canvas id="sc-review-canvas"></canvas>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;justify-content:center">
          <p class="sc-hint sc-hint-sm" style="margin:0">${t('sc.hoverHint')}</p>
          <button class="btn btn-ghost btn-sm" id="sc-sel-tool-btn" title="${t('sc.rangeSelectTitle')}">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="2" width="5" height="5" stroke-dasharray="2 1"/>
              <rect x="9" y="9" width="5" height="5" stroke-dasharray="2 1"/>
            </svg>
            ${t('sc.rangeSelect')}
          </button>
        </div>
      </div>

      <!-- RIGHT: card list -->
      <div class="sc-review-list-col">
        <div class="sc-review-title">${t('sc.detectedCards')}</div>
        <p class="sc-hint sc-hint-sm">
          ${t('sc.listHint')}
        </p>
        <div id="sc-card-list" class="sc-card-list"></div>
        <div class="sc-add-row">
          <span class="sc-add-label">${t('sc.manualAdd')}</span>
          <select id="sc-add-select">
            <option value="">${t('sc.selectCard')}</option>
            ${CARD_DEFS.map(d => `<option value="${d.id}">${d.icon} : ${d.name}</option>`).join('\n            ')}
          </select>
          <button class="btn btn-ghost btn-sm" id="sc-add-card-btn">${t('sc.addBtn')}</button>
        </div>
      </div>

    </div><!-- /step-review -->

  </div><!-- /body -->

  <!-- Footer -->
  <div class="scanner-footer">
    <div id="sc-status" class="sc-status"></div>
    <button class="btn btn-ghost" id="sc-back-btn" style="display:none">${t('sc.back')}</button>
    <button class="btn btn-primary" id="sc-apply-btn" style="display:none">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3A1.5 1.5 0 0 1 15 10.5v3A1.5 1.5 0 0 1 13.5 15h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg>
      ${t('sc.applyBlocks')}
    </button>
    <button class="btn btn-ghost" id="sc-cancel-btn">${t('sc.close')}</button>
  </div>
</div>`;

    this._modal = m;
    this._bindEvents();
  }

  _bindEvents() {
    const q  = id => this._modal.querySelector(id);
    q('#sc-close-btn').addEventListener('click',       () => this.close());
    q('#sc-cancel-btn').addEventListener('click',      () => this.close());
    q('#sc-camera-btn').addEventListener('click',      () => this._startCamera());
    q('#sc-file-input').addEventListener('change',     e  => this._loadFile(e));
    q('#sc-snap-btn').addEventListener('click',        () => this._snapPhoto());
    q('#sc-cam-cancel-btn').addEventListener('click',  () => this._stopCamera());
    q('#sc-analyze-btn').addEventListener('click',     () => this._analyzeImage());
    q('#sc-retake-btn').addEventListener('click',      () => this._retake());
    q('#sc-apply-btn').addEventListener('click',       () => this._applyToWorkspace());
    q('#sc-back-btn').addEventListener('click',        () => this._showCapture());
    q('#sc-add-card-btn').addEventListener('click',    () => this._addFromSelect());
    q('#sc-sel-tool-btn').addEventListener('click',    () => this._toggleSelectionTool());
    // Mode toggle
    q('#sc-mode-local').addEventListener('click', () => this._setAiMode(false));
    q('#sc-mode-ai').addEventListener('click',    () => this._setAiMode(true));
    q('#sc-params-btn').addEventListener('click', () => this._openCombinedSettings());
    this._modal.addEventListener('click', e => { if (e.target === this._modal) this.close(); });
  }

  _setAiMode(enabled) {
    this._aiMode = enabled;
    const q = id => this._modal.querySelector(id);
    q('#sc-mode-local').classList.toggle('active', !enabled);
    q('#sc-mode-ai').classList.toggle('active', enabled);
    // Update analyze button label
    const analyzeBtn = q('#sc-analyze-btn');
    if (analyzeBtn) analyzeBtn.innerHTML = enabled
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 4v4l3 3"/></svg> ${t('sc.aiAnalyze')}`
      : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> ${t('sc.analyze')}`;
  }

  /* ── Camera ──────────────────────────────────────────────────────────*/

  _startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this._status(t('sc.noCamera'), 'warn');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        this._stream = stream;
        const vid = this._modal.querySelector('#sc-video');
        vid.srcObject = stream;
        this._modal.querySelector('#sc-video-wrap').style.display    = 'block';
        this._modal.querySelector('#sc-capture-row').style.display   = 'none';
      })
      .catch(err => this._status(t('sc.cameraFail') + err.message, 'error'));
  }

  _stopCamera() {
    if (this._stream) { this._stream.getTracks().forEach(t => t.stop()); this._stream = null; }
    const vw = this._modal?.querySelector('#sc-video-wrap');
    const cr = this._modal?.querySelector('#sc-capture-row');
    if (vw) vw.style.display = 'none';
    if (cr) cr.style.display = 'flex';
  }

  _snapPhoto() {
    const vid = this._modal.querySelector('#sc-video');
    const off = document.createElement('canvas');
    off.width = vid.videoWidth; off.height = vid.videoHeight;
    off.getContext('2d').drawImage(vid, 0, 0);
    this._stopCamera();
    this._loadDataUrl(off.toDataURL('image/jpeg', 0.92));
  }

  /* ── File / Data URL loading ─────────────────────────────────────────*/

  _loadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => this._loadDataUrl(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  _loadDataUrl(dataUrl) {
    this._imgB64 = dataUrl; // keep for LLM
    const img = new Image();
    img.onload = () => {
      this._imgEl = img;
      const prevImg = this._modal.querySelector('#sc-preview-img');
      prevImg.src   = dataUrl;
      prevImg.onload = () => {
        const ov = this._modal.querySelector('#sc-overlay-canvas');
        ov.width  = prevImg.naturalWidth;
        ov.height = prevImg.naturalHeight;
        ov.style.width  = prevImg.offsetWidth  + 'px';
        ov.style.height = prevImg.offsetHeight + 'px';
      };
      this._modal.querySelector('#sc-preview-wrap').style.display = 'flex';
      this._modal.querySelector('#sc-capture-row').style.display  = 'none';
      this._modal.querySelector('#sc-video-wrap').style.display   = 'none';
      this._status(t('sc.imageLoaded'));
    };
    img.src = dataUrl;
  }

  /* ── Image Analysis ──────────────────────────────────────────────────*/

  _analyzeImage() {
    if (!this._imgEl) { this._status(t('sc.noImage'), 'warn'); return; }
    if (this._aiMode) {
      this._analyzeWithLLM();
    } else {
      this._analyzeLocal();
    }
  }

  /** Local (canvas-based) analysis */
  _analyzeLocal() {
    const TARGET_W = 640;  // Higher resolution for better pixel analysis
    const scale    = Math.min(1, TARGET_W / this._imgEl.naturalWidth);
    const W        = Math.round(this._imgEl.naturalWidth  * scale);
    const H        = Math.round(this._imgEl.naturalHeight * scale);

    const cv  = document.createElement('canvas');
    cv.width  = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // ── Brightness auto-adjustment ───────────────────────────────────────
    // Draw at full resolution first to sample brightness
    ctx.drawImage(this._imgEl, 0, 0, W, H);
    const sampleW = Math.min(W, 160);
    const sampleH = Math.min(H, 120);
    const sample  = ctx.getImageData(0, 0, sampleW, sampleH);
    let totalLum  = 0;
    for (let i = 0; i < sample.data.length; i += 4) {
      // Perceptual luminance
      totalLum += 0.299 * sample.data[i] + 0.587 * sample.data[i + 1] + 0.114 * sample.data[i + 2];
    }
    const meanLum = totalLum / (sample.data.length / 4);
    if (meanLum < 100) {
      // Too dark — re-draw with brightness boost
      const factor  = Math.min(3.5, 145 / Math.max(meanLum, 8)).toFixed(2);
      const contrast = Math.min(1.6, 1.0 + (100 - meanLum) / 200).toFixed(2);
      ctx.clearRect(0, 0, W, H);
      ctx.filter = `brightness(${factor}) contrast(${contrast})`;
      ctx.drawImage(this._imgEl, 0, 0, W, H);
      ctx.filter = 'none';
    }

    this._W = W; this._H = H;
    this._analysisCtx = ctx;   // keep for rectangle-selection re-analysis
    this._regions = detectCardGrid(ctx, W, H);

    if (this._regions.length === 0) {
      this._status(t('sc.localFail'), 'warn');
      return;
    }

    // Improved card selection: secondary pixel analysis for disambiguation
    const total = this._regions.length;
    this._cards = this._regions.map((r, i) => {
      const colorKey   = r.grp;
      const candidates = CARD_DEFS.filter(d => d.colorKey === colorKey);
      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0].id;
      // Try secondary disambiguation
      const refined = this._disambiguateCard(ctx, W, H, r, colorKey, i, total);
      return refined || candidates[0].id;
    }).filter(Boolean);
    // Local detection is always single-cube (cube 0)
    this._cubeAssignments = new Array(this._cards.length).fill(0);
    this._cubeRowLabels   = [];

    this._drawOverlay();
    this._showReview();
    this._renderList();
    this._status(this._regions.length + t('sc.localDone'));
  }

  /**
   * Secondary disambiguation within a same-color group.
   * Uses pixel density analysis and sequence position heuristics.
   */
  _disambiguateCard(ctx, W, H, region, colorKey, idx, total) {
    const { startX, endX, startY = 0, endY = H } = region;
    const cardW = endX - startX;
    const cardH = endY - startY;
    if (cardW < 4 || cardH < 4) return null;

    // ── Gray cards: pixel analysis first, then sequence heuristic ────────
    // reg_end features a green checkmark in its center area.
    if (colorKey === 'gray') {
      const gSx = Math.max(0, Math.floor(startX + cardW * 0.2));
      const gSy = Math.max(0, Math.floor(startY + cardH * 0.2));
      const gSw = Math.min(Math.floor(cardW * 0.6), W - gSx);
      const gSh = Math.min(Math.floor(cardH * 0.6), H - gSy);
      if (gSw >= 3 && gSh >= 3) {
        const gData = ctx.getImageData(gSx, gSy, gSw, gSh);
        let greenPx = 0;
        for (let i = 0; i < gData.data.length; i += 4) {
          const hsl = rgbToHsl(gData.data[i], gData.data[i+1], gData.data[i+2]);
          if (hsl.h >= 85 && hsl.h <= 165 && hsl.s >= 30 && hsl.l >= 20 && hsl.l <= 75) greenPx++;
        }
        if (greenPx / (gSw * gSh) >= 0.07) return 'reg_end';  // green checkmark
      }
      // Fall back to sequence position heuristic
      const grayCount = this._regions.filter(r => r && r.grp === 'gray').length;
      const grayRank  = this._regions.slice(0, idx + 1).filter(r => r && r.grp === 'gray').length - 1;
      if (grayCount === 1) return idx >= total - 2 ? 'reg_end' : 'if_start';
      if (grayRank === 0)              return 'if_start';
      if (grayRank === grayCount - 1) return 'reg_end';
      return grayRank % 2 === 1 ? 'if_else' : 'if_end';
    }

    // ── Numbered loop / wait cards: pixel density in number region ──────────
    // Pink:   repeat_2 vs repeat_3
    // Orange: wait_1 / wait_2 / wait_3 (clock icon, lower density) vs
    //         repeat_4 / repeat_5 (loop arrows, higher density)
    if (colorKey === 'pink' || colorKey === 'orange') {
      // Sample center-top of card (where the digit and icon are printed)
      const sx = Math.max(0, Math.floor(startX + cardW * 0.10));
      const sy = Math.max(0, Math.floor(startY + cardH * 0.10));
      const sw = Math.min(Math.floor(cardW * 0.80), W - sx);
      const sh = Math.min(Math.floor(cardH * 0.65), H - sy);
      if (sw < 2 || sh < 2) return null;

      const imgData = ctx.getImageData(sx, sy, sw, sh);
      let darkPx = 0;
      for (let i = 0; i < imgData.data.length; i += 4) {
        const lum = (imgData.data[i] + imgData.data[i + 1] + imgData.data[i + 2]) / 3;
        if (lum < 75) darkPx++;
      }
      const darkRatio = darkPx / (sw * sh);

      if (colorKey === 'pink') {
        // "3" has slightly more stroke coverage than "2"
        return darkRatio > 0.13 ? 'repeat_3' : 'repeat_2';
      }

      if (colorKey === 'orange') {
        // Wait cards (clock icon + かいまつ text) vs repeat cards (loop arrows + ×)
        // Wait cards tend to have distinct text pattern; repeat cards have loop icon.
        // Thresholds tuned for typical lighting — adjust if needed.
        if (darkRatio < 0.08)  return 'wait_1';
        if (darkRatio < 0.13)  return 'wait_2';
        if (darkRatio < 0.18)  return 'wait_3';
        if (darkRatio < 0.22)  return 'repeat_4';
        return 'repeat_5';
      }
    }

    // ── Dark teal: distinguish repeat_inf / repeat_end / action_1 / action_2 ──
    // repeat_inf  — ∞ symbol only, centre-weighted, roughly symmetric
    // repeat_end  — solid stop-mark (■) on left half, sparse on right
    // action_1/2  — "こうどう" kanji fills most of the card → much higher
    //               overall dark-pixel density than either repeat card
    if (colorKey === 'dteal') {
      const density = (data) => {
        let dark = 0;
        for (let i = 0; i < data.data.length; i += 4) {
          if ((data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3 < 90) dark++;
        }
        return dark / (data.data.length / 4);
      };

      // ── Step 1: left/right halves (unchanged repeat_end heuristic) ────
      const hSx = Math.max(0, Math.floor(startX));
      const hSy = Math.max(0, Math.floor(startY + cardH * 0.15));
      const hSw = Math.min(Math.floor(cardW * 0.5), W - hSx);
      const hSh = Math.min(Math.floor(cardH * 0.60), H - hSy);
      if (hSw < 2 || hSh < 2) return 'repeat_inf';

      const leftD  = density(ctx.getImageData(hSx,        hSy, hSw, hSh));
      const rightD = density(ctx.getImageData(hSx + hSw,  hSy, hSw, hSh));

      // repeat_end: solid stop-mark on left, sparse right
      if (leftD > 0.18 && rightD < 0.06) return 'repeat_end';

      // ── Step 2: overall card density — action cards are text-heavy ────
      const fSw = Math.min(cardW, W - startX);
      const fSh = Math.min(Math.floor(cardH * 0.85), H - startY);
      if (fSw >= 4 && fSh >= 4) {
        const totalD = density(ctx.getImageData(startX, startY, fSw, fSh));

        // Action cards ("こうどう" kanji) have noticeably higher overall density
        // than repeat_inf (just an ∞ symbol)
        if (totalD > 0.11) {
          // ── Step 3: distinguish action_1 vs action_2 ─────────────────
          // The digit is in the upper-right quarter of the card.
          // "2" has a curved top + horizontal base → more strokes (higher density)
          // than "1" (single vertical stroke).
          const nSx = Math.max(0, Math.floor(startX + cardW * 0.60));
          const nSy = Math.max(0, Math.floor(startY + cardH * 0.08));
          const nSw = Math.min(Math.floor(cardW * 0.35), W - nSx);
          const nSh = Math.min(Math.floor(cardH * 0.45), H - nSy);
          if (nSw >= 2 && nSh >= 2) {
            const numD = density(ctx.getImageData(nSx, nSy, nSw, nSh));
            return numD > 0.11 ? 'action_2' : 'action_1';
          }
          return 'action_1';
        }
      }

      return 'repeat_inf';
    }

    // ── Light cyan: half_chance vs hatena_floor vs bikkuri_floor ────────────
    // hatena_floor  — red "?" square icon in the centre
    // bikkuri_floor — dark blue "!" square icon in the centre
    // half_chance   — white "1/2" text, no strong colour in the icon area
    if (colorKey === 'lcyan') {
      const cSx = Math.max(0, Math.floor(startX + cardW * 0.15));
      const cSy = Math.max(0, Math.floor(startY + cardH * 0.15));
      const cSw = Math.min(Math.floor(cardW * 0.70), W - cSx);
      const cSh = Math.min(Math.floor(cardH * 0.65), H - cSy);
      if (cSw < 2 || cSh < 2) return 'half_chance';

      const cd = ctx.getImageData(cSx, cSy, cSw, cSh);
      let redPx = 0, darkBluePx = 0;
      const nPx = cd.data.length / 4;

      for (let i = 0; i < cd.data.length; i += 4) {
        const hsl = rgbToHsl(cd.data[i], cd.data[i + 1], cd.data[i + 2]);
        // Red icon: hue 0-20 or 340-360, high saturation, mid lightness
        if ((hsl.h < 22 || hsl.h > 338) && hsl.s > 55 && hsl.l > 20 && hsl.l < 72) redPx++;
        // Dark blue icon: hue 210-255, high saturation, mid-low lightness
        // (distinct from the light-cyan background which has hue ~185-200 and high lightness)
        if (hsl.h > 208 && hsl.h < 258 && hsl.s > 45 && hsl.l > 18 && hsl.l < 58) darkBluePx++;
      }

      const redRatio      = redPx      / nPx;
      const darkBlueRatio = darkBluePx / nPx;

      if (redRatio > 0.04)      return 'hatena_floor';
      if (darkBlueRatio > 0.04) return 'bikkuri_floor';
      return 'half_chance';
    }

    // ── Red cards: op_and (∧) vs op_or (∨) ──────────────────────────────────
    // ∧ has its vertex pointing UP  → the tip appears in the CENTER-TOP of the card
    // ∨ has its vertex pointing DOWN → the tip appears in the CENTER-BOTTOM of the card
    // Strategy: sample a narrow vertical strip through the card's horizontal center
    // and compare dark-pixel density in the top half vs the bottom half.
    //   ∧ (AND): center-top denser  (vertex at top, legs diverge downward)
    //   ∨ (OR):  center-bottom denser (vertex at bottom, legs diverge upward)
    if (colorKey === 'red') {
      // Narrow center strip — avoids edge noise from card border
      const stripW = Math.max(2, Math.floor(cardW * 0.14));
      const stripX = Math.max(0, Math.floor(startX + (cardW - stripW) / 2));
      const symY   = Math.max(0, Math.floor(startY + cardH * 0.08));
      const symH   = Math.min(Math.floor(cardH * 0.80), H - symY);
      if (symH < 4) return 'op_and';

      const sd = ctx.getImageData(stripX, symY, stripW, symH);
      const half = Math.floor(symH / 2);
      let topDark = 0, botDark = 0;
      for (let row = 0; row < symH; row++) {
        for (let col = 0; col < stripW; col++) {
          const ii = (row * stripW + col) * 4;
          if ((sd.data[ii] + sd.data[ii + 1] + sd.data[ii + 2]) / 3 < 110) {
            if (row < half) topDark++; else botDark++;
          }
        }
      }
      // ∧ (AND): vertex at top → topDark ≥ botDark
      // ∨ (OR):  vertex at bottom → botDark > topDark
      return topDark >= botDark ? 'op_and' : 'op_or';
    }

    return null; // no disambiguation possible
  }

  /** Map a row label string to a 0-based cube index.
   *  "キューブA" / "Cube A" / "A" → 0,  "キューブB" / "Cube B" / "B" → 1, etc. */
  static _labelToCubeIdx(label) {
    if (!label) return 0;
    const s = label.trim();
    // Letter suffixes: A→0, B→1, ...
    const letterMatch = s.match(/([A-Za-z])$/);
    if (letterMatch) {
      const code = letterMatch[1].toUpperCase().charCodeAt(0) - 65; // A=0,B=1,...
      if (code >= 0 && code < 26) return code;
    }
    // Number suffix: 1→0, 2→1, ...
    const numMatch = s.match(/(\d+)$/);
    if (numMatch) return Math.max(0, parseInt(numMatch[1]) - 1);
    return 0;
  }

  /**
   * Returns true if the row label represents a function DEFINITION row
   * ("こうどう1", "こうどう2", "action 1", "action_1", "动作1", etc.)
   * rather than a cube movement row.
   * These rows must NOT be passed through _labelToCubeIdx.
   */
  static _isActionDefLabel(label) {
    if (!label) return false;
    const s = label.trim();
    // こうどう1, こうどう2 (full-width numbers too)
    if (/^こうどう\s*[12１２]$/.test(s)) return true;
    // action1, action 1, action_1, action-1, Action 1, etc.
    if (/^action[\s_-]?[12]$/i.test(s)) return true;
    // 动作1, 动作2 (Chinese)
    if (/^动作\s*[12１２]$/.test(s)) return true;
    return false;
  }

  /** LLM (cloud) analysis */
  async _analyzeWithLLM() {
    const settings = _scGetApiSettings();
    const provider = settings.provider || 'gemini';
    const apiKey   = settings[provider + 'Key'] || '';

    if (!apiKey) {
      this._status(t('sc.noApiKey'), 'warn');
      this._openCombinedSettings();
      // Flash the settings button to draw attention
      const paramsBtn = this._modal.querySelector('#sc-params-btn');
      if (paramsBtn) {
        paramsBtn.classList.remove('api-key-flash');
        void paramsBtn.offsetWidth;
        paramsBtn.classList.add('api-key-flash');
        setTimeout(() => paramsBtn.classList.remove('api-key-flash'), 1400);
      }
      return;
    }

    this._status(t('sc.aiAnalyzing'), 'info');
    const analyzeBtn = this._modal.querySelector('#sc-analyze-btn');
    if (analyzeBtn) analyzeBtn.disabled = true;

    try {
      const modelOverride = settings[provider + 'Model'] || '';
      // Returns [{label, cards:[id,...]}, ...] — structured rows
      const rows = await _scRecognizeWithLLM(this._imgB64, provider, apiKey, modelOverride);

      const totalCards = rows.reduce((s, r) => s + r.cards.length, 0);
      if (totalCards === 0) {
        this._status(t('sc.aiNoCards'), 'warn');
        return;
      }

      // Separate rows into:
      //   • cube movement rows  → _cards / _cubeAssignments
      //   • function def rows   → _actionDefRows  (こうどう1 / こうどう2)
      this._cards           = [];
      this._cubeAssignments = [];
      this._cubeRowLabels   = [];
      this._actionDefRows   = [];
      for (const row of rows) {
        if (CardScanner._isActionDefLabel(row.label)) {
          // Function definition row — will become procedures_defnoreturn block
          // Normalize label to current-language action name (cards are always Japanese)
          this._actionDefRows.push({ name: _normalizeActionLabel(row.label.trim()), cards: [...row.cards] });
        } else {
          // Cube movement row
          const cubeIdx = CardScanner._labelToCubeIdx(row.label);
          if (!this._cubeRowLabels.includes(row.label)) {
            this._cubeRowLabels.push(row.label);
          }
          for (const id of row.cards) {
            this._cards.push(id);
            this._cubeAssignments.push(cubeIdx);
          }
        }
      }

      this._regions = []; // no regional bounding boxes in LLM mode
      this._showReview();
      this._renderList();
      // In AI mode there are no regions, so show image without overlay (reference only)
      this._status(t('sc.aiDone') + totalCards + t('sc.aiDoneCount'));

    } catch (err) {
      console.error('[CardScanner LLM]', err);
      this._status(t('sc.aiError') + err.message, 'error');
    } finally {
      if (analyzeBtn) analyzeBtn.disabled = false;
    }
  }

  /* ── Unified AI Settings Dialog ──────────────────────────────────────
     This dialog edits `cardScannerApiSettings` which is also read by the
     AI code-generation panel — one setting place for all AI features.     */

  _openApiSettings() {
    // Toggle: remove existing dialog if already open
    const old = this._modal.querySelector('.sc-api-dialog');
    if (old) { old.remove(); return; }

    const s   = _scGetApiSettings();
    const def = _SC_DEFAULT_MODELS;

    // Helper: build a model select + fetch-button row
    const modelRow = (prov, savedModel) => {
      const defLabel = def[prov] || '';
      const savedOpt = savedModel && savedModel !== defLabel
        ? `<option value="${savedModel}" selected>${savedModel}</option>` : '';
      return `
        <div class="sc-model-row">
          <select id="sc-api-${prov}-model" class="sc-model-sel">
            <option value=""${!savedModel ? ' selected' : ''}>${defLabel} (デフォルト)</option>
            ${savedOpt}
          </select>
          <button class="btn btn-ghost btn-sm sc-model-fetch-btn" data-prov="${prov}" title="モデル一覧を取得">⟳</button>
        </div>`;
    };

    const dialog = document.createElement('div');
    dialog.className = 'sc-api-dialog';
    dialog.innerHTML = `
      <div class="sc-api-dialog-inner">
        <div class="sc-api-dialog-title">${t('sc.aiSettings')}</div>

        <div class="sc-api-field">
          <label>${t('sc.provider')}</label>
          <select id="sc-api-provider">
            <option value="gemini" ${(s.provider||'gemini')==='gemini' ? 'selected':''}>Gemini (Google)</option>
            <option value="openai" ${s.provider==='openai' ? 'selected':''}>GPT-4o (OpenAI)</option>
            <option value="claude" ${s.provider==='claude' ? 'selected':''}>Claude (Anthropic)</option>
          </select>
        </div>

        <div class="sc-api-section-label">Gemini (Google)</div>
        <div class="sc-api-field">
          <label>${t('sc.apiKey')}</label>
          <input type="password" id="sc-api-gemini" placeholder="AIza..." value="${s.geminiKey||''}">
        </div>
        <div class="sc-api-field">
          <label>${t('sc.model')}</label>
          ${modelRow('gemini', s.geminiModel||'')}
        </div>

        <div class="sc-api-section-label">OpenAI</div>
        <div class="sc-api-field">
          <label>${t('sc.apiKey')}</label>
          <input type="password" id="sc-api-openai" placeholder="sk-..." value="${s.openaiKey||''}">
        </div>
        <div class="sc-api-field">
          <label>${t('sc.model')}</label>
          ${modelRow('openai', s.openaiModel||'')}
        </div>

        <div class="sc-api-section-label">Anthropic (Claude)</div>
        <div class="sc-api-field">
          <label>${t('sc.apiKey')}</label>
          <input type="password" id="sc-api-claude" placeholder="sk-ant-..." value="${s.claudeKey||''}">
        </div>
        <div class="sc-api-field">
          <label>${t('sc.model')}</label>
          ${modelRow('claude', s.claudeModel||'')}
        </div>

        <p class="sc-api-note">${t('sc.apiNote')}</p>
        <div class="sc-api-buttons">
          <button class="btn btn-primary btn-sm" id="sc-api-save">${t('sc.saveClose')}</button>
          <button class="btn btn-ghost btn-sm" id="sc-api-close">${t('sc.close')}</button>
        </div>
      </div>`;

    this._modal.querySelector('.scanner-dialog').appendChild(dialog);

    // ── Wire fetch buttons ─────────────────────────────────────────────
    dialog.querySelectorAll('.sc-model-fetch-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prov  = btn.dataset.prov;
        const keyEl = dialog.querySelector(`#sc-api-${prov}`);
        const sel   = dialog.querySelector(`#sc-api-${prov}-model`);
        const key   = keyEl ? keyEl.value.trim() : '';
        if (!key) { btn.textContent = '🔑'; setTimeout(() => btn.textContent = '⟳', 1500); return; }
        btn.disabled = true; btn.textContent = '⏳';
        try {
          const list = await window.fetchModelList(prov, key);
          const cur  = sel.value;
          sel.innerHTML = `<option value="">${def[prov]||''} (デフォルト)</option>` +
            list.map(m => `<option value="${m.id}"${m.id === cur ? ' selected' : ''}>${m.name||m.id}</option>`).join('');
          if (!sel.value && cur) {
            const o = document.createElement('option');
            o.value = cur; o.textContent = cur; o.selected = true; sel.appendChild(o);
          }
          btn.textContent = '✓';
        } catch (e) {
          btn.textContent = '✗';
          console.error('[AI settings fetch]', e);
        } finally {
          btn.disabled = false;
          setTimeout(() => btn.textContent = '⟳', 2200);
        }
      });
    });

    // ── Save ──────────────────────────────────────────────────────────
    // Live-sync: if the AI coding panel changes settings while this dialog is open,
    // update the relevant input fields so they stay in agreement.
    const _onLLMPanelChange = (e) => {
      const d = e.detail || {};
      if (d._source === 'card-scanner') return;  // our own change, skip
      const s2 = _scGetApiSettings();
      const pSel = dialog.querySelector('#sc-api-provider');
      if (pSel && s2.provider) pSel.value = s2.provider;
      ['gemini','openai','claude'].forEach(p => {
        const ki = dialog.querySelector(`#sc-api-${p}`);
        if (ki) ki.value = s2[`${p}Key`] || '';
        const ms = dialog.querySelector(`#sc-api-${p}-model`);
        if (ms && s2[`${p}Model`]) {
          // add option if not already there
          if (![...ms.options].some(o => o.value === s2[`${p}Model`])) {
            const o = document.createElement('option');
            o.value = s2[`${p}Model`]; o.textContent = s2[`${p}Model`]; ms.prepend(o);
          }
          ms.value = s2[`${p}Model`];
        }
      });
    };
    window.addEventListener('aiSettingsChanged', _onLLMPanelChange);
    dialog.querySelector('#sc-api-close').addEventListener('click', () => {
      window.removeEventListener('aiSettingsChanged', _onLLMPanelChange);
      dialog.remove();
    });

    dialog.querySelector('#sc-api-save').addEventListener('click', () => {
      const newSettings = {
        provider:    dialog.querySelector('#sc-api-provider').value,
        geminiKey:   dialog.querySelector('#sc-api-gemini').value.trim(),
        geminiModel: dialog.querySelector('#sc-api-gemini-model').value.trim(),
        openaiKey:   dialog.querySelector('#sc-api-openai').value.trim(),
        openaiModel: dialog.querySelector('#sc-api-openai-model').value.trim(),
        claudeKey:   dialog.querySelector('#sc-api-claude').value.trim(),
        claudeModel: dialog.querySelector('#sc-api-claude-model').value.trim(),
      };
      _scSaveApiSettings(newSettings);
      // Notify app.js so the AI coding panel also updates
      window.dispatchEvent(new CustomEvent('aiSettingsChanged', {
        detail: { ...newSettings, _source: 'card-scanner' }
      }));
      window.removeEventListener('aiSettingsChanged', _onLLMPanelChange);
      dialog.remove();
      this._status(t('sc.settingsSaved'));
    });
  }

  /* ── Combined Settings Dialog (Motion Params + AI Settings) ─────────────*/

  _openCombinedSettings() {
    // Toggle: remove existing dialog if already open
    const old = this._modal.querySelector('.sc-combined-dialog');
    if (old) { old.remove(); return; }

    const s   = _scGetApiSettings();
    const p   = _scGetParams();
    const def = _SC_DEFAULT_MODELS;

    // Helper: build a model select + fetch-button row (reuse pattern)
    const modelRow = (prov, savedModel) => {
      const defLabel = def[prov] || '';
      const savedOpt = savedModel && savedModel !== defLabel
        ? `<option value="${savedModel}" selected>${savedModel}</option>` : '';
      return `
        <div class="sc-model-row">
          <select id="sc-api-${prov}-model" class="sc-model-sel">
            <option value=""${!savedModel ? ' selected' : ''}>${defLabel} (${t('sc.default')})</option>
            ${savedOpt}
          </select>
          <button class="btn btn-ghost btn-sm sc-model-fetch-btn" data-prov="${prov}" title="${t('sc.fetchModels')}">⟳</button>
        </div>`;
    };

    const dialog = document.createElement('div');
    dialog.className = 'sc-api-dialog sc-combined-dialog';
    dialog.innerHTML = `
      <div class="sc-api-dialog-inner">
        <div class="sc-api-dialog-title">${t('sc.settingsTitle')}</div>
        <button class="sc-api-dialog-close" id="sc-settings-close" title="${t('sc.close')}">×</button>

        <!-- Section 1: Motion Parameters -->
        <div class="sc-settings-section">
          <div class="sc-settings-section-hdr">${t('sc.motionParams')}</div>
          <div class="sc-api-field">
            <label>${t('sc.motionMode')}</label>
            <div class="sc-mode-radio">
              <label><input type="radio" name="sc-param-mode" value="time" ${p.mode !== 'position' ? 'checked' : ''}> ${t('sc.timeBased')}</label>
              <label><input type="radio" name="sc-param-mode" value="position" ${p.mode === 'position' ? 'checked' : ''}> ${t('sc.posBased')}</label>
            </div>
          </div>

          <!-- Time mode params -->
          <div id="sc-time-params" ${p.mode === 'position' ? 'style="display:none"' : ''}>
            <div class="sc-api-field sc-params-row">
              <label>${t('sc.fwdSpeed')}</label><input type="number" id="sc-p-move-speed" min="1" max="115" value="${p.moveSpeed}">
              <label>${t('sc.duration')}</label><input type="number" id="sc-p-move-dur" min="0.1" max="10" step="0.1" value="${p.moveDuration}">
            </div>
            <div class="sc-api-field sc-params-row">
              <label>${t('sc.turnSpeed')}</label><input type="number" id="sc-p-turn-speed" min="1" max="115" value="${p.turnSpeed}">
              <label>${t('sc.duration')}</label><input type="number" id="sc-p-turn-dur" min="0.1" max="10" step="0.1" value="${p.turnDuration}">
            </div>
            <div class="sc-api-field sc-params-row">
              <label>${t('sc.backDur')}</label><input type="number" id="sc-p-back-dur" min="0.1" max="10" step="0.1" value="${p.turnBackDuration}">
            </div>
            <div class="sc-api-field sc-params-row">
              <label>待ち時間(秒/回)</label><input type="number" id="sc-p-wait-dur" min="0.1" max="30" step="0.1" value="${p.waitDuration ?? 1.0}" title="かいまつカード1回あたりの待ち時間（秒）">
            </div>
          </div>

          <!-- Position mode params -->
          <div id="sc-pos-params" ${p.mode !== 'position' ? 'style="display:none"' : ''}>
            <div class="sc-api-field sc-params-row">
              <label>${t('sc.startX')}</label><input type="number" id="sc-p-sx" value="${p.startX}" min="98" max="402">
              <label>Y</label><input type="number" id="sc-p-sy" value="${p.startY}" min="142" max="358">
              <label>${t('sc.turnAngle').replace('旋回','')||'角度°'}</label><input type="number" id="sc-p-sa" value="${p.startAngle}" min="0" max="359">
            </div>
            <div class="sc-api-field sc-params-row">
              <label>${t('sc.stepSize')}</label><input type="number" id="sc-p-step" value="${p.stepSize}" min="10" max="200">
              <label>${t('sc.turnAngle')}</label><input type="number" id="sc-p-turn-angle" value="${p.turnAngle}" min="10" max="180">
              <label>${t('sc.speed')}</label><input type="number" id="sc-p-pos-speed" value="${p.posSpeed}" min="1" max="115">
            </div>
          </div>
        </div>

        <!-- Section 2: AI Settings -->
        <div class="sc-settings-section">
          <div class="sc-settings-section-hdr" id="sc-ai-section-hdr" style="cursor:pointer">
            ${t('sc.aiSettings')} <span id="sc-ai-toggle-icon">▾</span>
          </div>
          <p class="sc-ai-desc-hint">${t('sc.aiDesc')}</p>
          <div id="sc-ai-settings-body">
            <div class="sc-api-field">
              <label>${t('sc.provider')}</label>
              <select id="sc-api-provider">
                <option value="gemini" ${(s.provider||'gemini')==='gemini' ? 'selected':''}>Gemini (Google)</option>
                <option value="openai" ${s.provider==='openai' ? 'selected':''}>GPT-4o (OpenAI)</option>
                <option value="claude" ${s.provider==='claude' ? 'selected':''}>Claude (Anthropic)</option>
              </select>
            </div>

            <div class="sc-api-section-label">Gemini (Google)</div>
            <div class="sc-api-field">
              <label>${t('sc.apiKey')}</label>
              <input type="password" id="sc-api-gemini" placeholder="AIza..." value="${s.geminiKey||''}">
            </div>
            <div class="sc-api-field">
              <label>${t('sc.model')}</label>
              ${modelRow('gemini', s.geminiModel||'')}
            </div>

            <div class="sc-api-section-label">OpenAI</div>
            <div class="sc-api-field">
              <label>${t('sc.apiKey')}</label>
              <input type="password" id="sc-api-openai" placeholder="sk-..." value="${s.openaiKey||''}">
            </div>
            <div class="sc-api-field">
              <label>${t('sc.model')}</label>
              ${modelRow('openai', s.openaiModel||'')}
            </div>

            <div class="sc-api-section-label">Anthropic (Claude)</div>
            <div class="sc-api-field">
              <label>${t('sc.apiKey')}</label>
              <input type="password" id="sc-api-claude" placeholder="sk-ant-..." value="${s.claudeKey||''}">
            </div>
            <div class="sc-api-field">
              <label>${t('sc.model')}</label>
              ${modelRow('claude', s.claudeModel||'')}
            </div>

            <p class="sc-api-note">${t('sc.apiNote')}</p>
          </div>
        </div>

        <div class="sc-api-actions">
          <button class="btn btn-primary" id="sc-combined-save">${t('sc.save')}</button>
          <button class="btn btn-ghost" id="sc-combined-cancel">${t('sc.cancel')}</button>
        </div>
      </div>`;

    this._modal.querySelector('.scanner-dialog').appendChild(dialog);

    // ── Mode radio toggles param sections ─────────────────────────────
    const timeDiv = dialog.querySelector('#sc-time-params');
    const posDiv  = dialog.querySelector('#sc-pos-params');
    dialog.querySelectorAll('input[name="sc-param-mode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const isPos = radio.value === 'position';
        timeDiv.style.display = isPos ? 'none' : '';
        posDiv.style.display  = isPos ? ''     : 'none';
      });
    });

    // ── AI section collapse toggle ─────────────────────────────────────
    const aiHdr  = dialog.querySelector('#sc-ai-section-hdr');
    const aiBody = dialog.querySelector('#sc-ai-settings-body');
    const aiIcon = dialog.querySelector('#sc-ai-toggle-icon');
    aiHdr.addEventListener('click', () => {
      const collapsed = aiBody.style.display === 'none';
      aiBody.style.display = collapsed ? '' : 'none';
      aiIcon.textContent   = collapsed ? '▾' : '▸';
    });

    // ── Model fetch buttons ────────────────────────────────────────────
    dialog.querySelectorAll('.sc-model-fetch-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prov  = btn.dataset.prov;
        const keyEl = dialog.querySelector(`#sc-api-${prov}`);
        const sel   = dialog.querySelector(`#sc-api-${prov}-model`);
        const key   = keyEl ? keyEl.value.trim() : '';
        if (!key) { btn.textContent = '🔑'; setTimeout(() => btn.textContent = '⟳', 1500); return; }
        btn.disabled = true; btn.textContent = '⏳';
        try {
          const list = await window.fetchModelList(prov, key);
          const cur  = sel.value;
          sel.innerHTML = `<option value="">${def[prov]||''} (デフォルト)</option>` +
            list.map(m => `<option value="${m.id}"${m.id === cur ? ' selected' : ''}>${m.name||m.id}</option>`).join('');
          if (!sel.value && cur) {
            const o = document.createElement('option');
            o.value = cur; o.textContent = cur; o.selected = true; sel.appendChild(o);
          }
          btn.textContent = '✓';
        } catch (e) {
          btn.textContent = '✗';
          console.error('[AI settings fetch]', e);
        } finally {
          btn.disabled = false;
          setTimeout(() => btn.textContent = '⟳', 2200);
        }
      });
    });

    // ── Live-sync from AI coding panel ────────────────────────────────
    const _onLLMPanelChange = (e) => {
      const d = e.detail || {};
      if (d._source === 'card-scanner') return;
      const s2 = _scGetApiSettings();
      const pSel = dialog.querySelector('#sc-api-provider');
      if (pSel && s2.provider) pSel.value = s2.provider;
      ['gemini','openai','claude'].forEach(pr => {
        const ki = dialog.querySelector(`#sc-api-${pr}`);
        if (ki) ki.value = s2[`${pr}Key`] || '';
        const ms = dialog.querySelector(`#sc-api-${pr}-model`);
        if (ms && s2[`${pr}Model`]) {
          if (![...ms.options].some(o => o.value === s2[`${pr}Model`])) {
            const o = document.createElement('option');
            o.value = s2[`${pr}Model`]; o.textContent = s2[`${pr}Model`]; ms.prepend(o);
          }
          ms.value = s2[`${pr}Model`];
        }
      });
    };
    window.addEventListener('aiSettingsChanged', _onLLMPanelChange);

    // ── Close ──────────────────────────────────────────────────────────
    const _close = () => {
      window.removeEventListener('aiSettingsChanged', _onLLMPanelChange);
      dialog.remove();
    };
    dialog.querySelector('#sc-settings-close').addEventListener('click', _close);
    dialog.querySelector('#sc-combined-cancel').addEventListener('click', _close);

    // ── Save ──────────────────────────────────────────────────────────
    dialog.querySelector('#sc-combined-save').addEventListener('click', () => {
      // Save motion params
      const modeVal = dialog.querySelector('input[name="sc-param-mode"]:checked')?.value || 'time';
      const newParams = {
        mode:            modeVal,
        moveSpeed:       parseFloat(dialog.querySelector('#sc-p-move-speed')?.value)    || _SC_DEFAULT_PARAMS.moveSpeed,
        moveDuration:    parseFloat(dialog.querySelector('#sc-p-move-dur')?.value)      || _SC_DEFAULT_PARAMS.moveDuration,
        turnSpeed:       parseFloat(dialog.querySelector('#sc-p-turn-speed')?.value)    || _SC_DEFAULT_PARAMS.turnSpeed,
        turnDuration:    parseFloat(dialog.querySelector('#sc-p-turn-dur')?.value)      || _SC_DEFAULT_PARAMS.turnDuration,
        turnBackDuration:parseFloat(dialog.querySelector('#sc-p-back-dur')?.value)      || _SC_DEFAULT_PARAMS.turnBackDuration,
        waitDuration:    parseFloat(dialog.querySelector('#sc-p-wait-dur')?.value)      || _SC_DEFAULT_PARAMS.waitDuration,
        startX:          parseInt(dialog.querySelector('#sc-p-sx')?.value)              || _SC_DEFAULT_PARAMS.startX,
        startY:          parseInt(dialog.querySelector('#sc-p-sy')?.value)              || _SC_DEFAULT_PARAMS.startY,
        startAngle:      parseInt(dialog.querySelector('#sc-p-sa')?.value)              || _SC_DEFAULT_PARAMS.startAngle,
        stepSize:        parseInt(dialog.querySelector('#sc-p-step')?.value)            || _SC_DEFAULT_PARAMS.stepSize,
        turnAngle:       parseInt(dialog.querySelector('#sc-p-turn-angle')?.value)      || _SC_DEFAULT_PARAMS.turnAngle,
        posSpeed:        parseInt(dialog.querySelector('#sc-p-pos-speed')?.value)       || _SC_DEFAULT_PARAMS.posSpeed,
      };
      _scSaveParams(newParams);

      // Save AI settings
      const newSettings = {
        provider:    dialog.querySelector('#sc-api-provider').value,
        geminiKey:   dialog.querySelector('#sc-api-gemini').value.trim(),
        geminiModel: dialog.querySelector('#sc-api-gemini-model').value.trim(),
        openaiKey:   dialog.querySelector('#sc-api-openai').value.trim(),
        openaiModel: dialog.querySelector('#sc-api-openai-model').value.trim(),
        claudeKey:   dialog.querySelector('#sc-api-claude').value.trim(),
        claudeModel: dialog.querySelector('#sc-api-claude-model').value.trim(),
      };
      _scSaveApiSettings(newSettings);
      // Notify app.js AI panel
      window.dispatchEvent(new CustomEvent('aiSettingsChanged', {
        detail: { ...newSettings, _source: 'card-scanner' }
      }));
      window.removeEventListener('aiSettingsChanged', _onLLMPanelChange);
      dialog.remove();
      this._status(t('sc.paramsSaved'));
    });
  }

  /** Draw numbered 2D bounding boxes over the Step-1 preview image */
  _drawOverlay() {
    const prevImg = this._modal.querySelector('#sc-preview-img');
    const ov      = this._modal.querySelector('#sc-overlay-canvas');

    const scaleX = prevImg.naturalWidth  / this._W;
    const scaleY = prevImg.naturalHeight / this._H;

    ov.width  = prevImg.naturalWidth;
    ov.height = prevImg.naturalHeight;
    ov.style.width  = prevImg.offsetWidth  + 'px';
    ov.style.height = prevImg.offsetHeight + 'px';

    const ctx = ov.getContext('2d');
    ctx.clearRect(0, 0, ov.width, ov.height);

    this._regions.forEach((r, i) => {
      if (!r) return;  // manually-added card — no region box
      const grp = COLOR_GROUPS[r.grp];
      const col = grp ? grp.hex : '#888';
      const x   = r.startX * scaleX;
      const w   = (r.endX - r.startX) * scaleX;
      // Use per-card Y range (2D bounding box)
      const y   = (r.startY != null ? r.startY : 0) * scaleY;
      const h   = ((r.endY != null ? r.endY : this._H) - (r.startY != null ? r.startY : 0)) * scaleY;

      ctx.strokeStyle = col;
      ctx.lineWidth   = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

      ctx.fillStyle = col;
      ctx.fillRect(x, y, 22, 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(String(i + 1), x + 4, y + 15);
    });
  }

  /**
   * Draw numbered overlays on the Step-2 review image.
   * @param {number} highlightIdx  Card index to highlight (-1 = none)
   */
  _drawReviewOverlay(highlightIdx = -1) {
    const reviewImg = this._modal?.querySelector('#sc-review-img');
    const cv        = this._modal?.querySelector('#sc-review-canvas');
    if (!reviewImg || !cv || !reviewImg.naturalWidth) return;

    cv.width  = reviewImg.naturalWidth;
    cv.height = reviewImg.naturalHeight;

    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);

    if (this._regions.length === 0) return; // AI mode: no region info

    const scaleX = reviewImg.naturalWidth  / this._W;
    const scaleY = reviewImg.naturalHeight / this._H;

    this._regions.forEach((r, i) => {
      if (!r) return;  // manually-added card — no region to draw
      const cardId = this._cards[i];
      const def    = CARD_BY_ID[cardId];
      const grpKey = def ? def.colorKey : r.grp;
      const grp    = COLOR_GROUPS[grpKey] || COLOR_GROUPS[r.grp];
      const col    = grp ? grp.hex : '#888';
      const x      = r.startX * scaleX;
      const w      = (r.endX - r.startX) * scaleX;
      // Per-card 2D bounds — fall back to full height for single-row legacy regions
      const y      = (r.startY != null ? r.startY : 0) * scaleY;
      const h      = ((r.endY != null ? r.endY : this._H) - (r.startY != null ? r.startY : 0)) * scaleY;
      const isHL   = i === highlightIdx;

      ctx.save();
      if (isHL) {
        // Highlighted: semi-transparent fill + thicker border + glow
        ctx.fillStyle = col + '38';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle   = col;
        ctx.lineWidth     = 4;
        ctx.shadowColor   = col;
        ctx.shadowBlur    = 8;
      } else {
        ctx.strokeStyle = col;
        ctx.lineWidth   = 2.5;
      }
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

      // Number badge
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = col;
      ctx.fillRect(x, y, 22, 20);
      ctx.fillStyle   = '#fff';
      ctx.font        = 'bold 13px sans-serif';
      ctx.fillText(String(i + 1), x + 4, y + 15);
      ctx.restore();
    });
  }

  /* ── Step Navigation ─────────────────────────────────────────────────*/

  _showReview() {
    this._modal.querySelector('#sc-step-capture').style.display = 'none';
    this._modal.querySelector('#sc-step-review').style.display  = 'flex';
    this._modal.querySelector('#sc-apply-btn').style.display    = 'inline-flex';
    this._modal.querySelector('#sc-back-btn').style.display     = 'inline-flex';
    // Widen dialog for 2-column layout
    this._modal.querySelector('.scanner-dialog').classList.add('sc-dialog-wide');
    // Copy loaded image into review pane
    const reviewImg = this._modal.querySelector('#sc-review-img');
    if (reviewImg && this._imgB64) {
      reviewImg.src = this._imgB64;
      const afterLoad = () => {
        const cv = this._modal.querySelector('#sc-review-canvas');
        if (cv) { cv.width = reviewImg.naturalWidth; cv.height = reviewImg.naturalHeight; }
        this._drawReviewOverlay(-1);
      };
      if (reviewImg.complete && reviewImg.naturalWidth > 0) afterLoad();
      else reviewImg.onload = afterLoad;
    }
  }

  _showCapture() {
    this._modal.querySelector('#sc-step-capture').style.display = 'flex';
    this._modal.querySelector('#sc-step-review').style.display  = 'none';
    this._modal.querySelector('#sc-apply-btn').style.display    = 'none';
    this._modal.querySelector('#sc-back-btn').style.display     = 'none';
    this._modal.querySelector('.scanner-dialog').classList.remove('sc-dialog-wide');
  }

  _retake() {
    this._showCapture();
    this._modal.querySelector('#sc-preview-wrap').style.display = 'none';
    this._modal.querySelector('#sc-capture-row').style.display  = 'flex';
    this._imgEl = null; this._imgB64 = null; this._cards = []; this._regions = [];
    this._cubeAssignments = []; this._cubeRowLabels = []; this._actionDefRows = [];
    this._analysisCtx = null;
    if (this._selMode) this._toggleSelectionTool();  // deactivate selection tool
    this._status('');
  }

  /* ── Card List (vertical, draggable, inline-editable) ───────────────*/

  _renderList() {
    const container = this._modal.querySelector('#sc-card-list');
    container.innerHTML = '';

    const hasCards = this._cards.length > 0;
    const hasDefs  = (this._actionDefRows || []).length > 0;

    if (!hasCards && !hasDefs) {
      const empty = document.createElement('p');
      empty.className = 'sc-hint';
      empty.textContent = 'カードがありません。下のセレクトから追加してください。';
      container.appendChild(empty);
      return;
    }

    // Determine whether we have multi-cube rows to display
    const multiCube = this._cubeAssignments.length === this._cards.length &&
      new Set(this._cubeAssignments).size > 1;

    // Build cube label lookup: cubeIdx → display label
    const cubeLabel = (ci) => {
      // Try to find a stored label that maps to this index
      for (const lbl of (this._cubeRowLabels || [])) {
        if (CardScanner._labelToCubeIdx(lbl) === ci) return lbl;
      }
      return `キューブ${ci + 1}`;
    };

    let lastCubeIdx = -1;

    this._cards.forEach((cardId, idx) => {
      const def  = CARD_BY_ID[cardId];
      if (!def) return;
      const cubeIdx = this._cubeAssignments[idx] ?? 0;
      const grp  = COLOR_GROUPS[def.colorKey];
      const hex  = grp ? grp.hex : '#888';

      // Insert cube row header when cubeIdx transitions (multi-cube mode only)
      if (multiCube && cubeIdx !== lastCubeIdx) {
        lastCubeIdx = cubeIdx;
        const header = document.createElement('div');
        header.className = 'sc-cube-header';
        const cubeColors = ['#4C97FF','#FF6680','#59C059','#FFAB19'];
        const borderCol = cubeColors[cubeIdx % cubeColors.length];
        header.style.cssText = `
          display:flex; align-items:center; gap:6px;
          padding:4px 8px; margin:4px 0 2px;
          background:${borderCol}18; border-left:3px solid ${borderCol};
          border-radius:4px; font-size:12px; font-weight:600; color:${borderCol};
        `;
        header.textContent = `${cubeLabel(cubeIdx)} → キューブ${cubeIdx + 1}`;
        container.appendChild(header);
      }

      // Build select: same-color group first, then the rest in an optgroup
      const sameGroup  = CARD_DEFS.filter(d => d.colorKey === def.colorKey);
      const otherGroup = CARD_DEFS.filter(d => d.colorKey !== def.colorKey);
      const sameOpts   = sameGroup.map(d =>
        `<option value="${d.id}"${d.id === cardId ? ' selected' : ''}>${d.icon} : ${d.name}</option>`
      ).join('');
      const otherOpts  = otherGroup.map(d =>
        `<option value="${d.id}">${d.icon} : ${d.name}</option>`
      ).join('');
      const otherGrpHtml = otherGroup.length
        ? `<optgroup label="── 他のカード ──">${otherOpts}</optgroup>`
        : '';

      const row = document.createElement('div');
      row.className   = 'sc-row';
      row.draggable   = true;
      row.dataset.idx = String(idx);

      row.innerHTML = `
        <span class="sc-drag-handle" title="ドラッグして並べ替え">⋮⋮</span>
        <span class="sc-row-num">${idx + 1}</span>
        <span class="sc-row-swatch" style="background:${hex}"></span>
        <select class="sc-row-type-sel" title="カードの種類を変更（同色グループが上部）">
          ${sameOpts}${otherGrpHtml}
        </select>
        <button class="sc-row-del" title="削除">×</button>
      `;

      // ── Hover → highlight region in review image ──────────────────
      row.addEventListener('mouseenter', () => this._drawReviewOverlay(idx));
      row.addEventListener('mouseleave', () => this._drawReviewOverlay(-1));

      // ── Inline select: change card type ──────────────────────────
      const sel = row.querySelector('.sc-row-type-sel');
      sel.addEventListener('change', () => {
        const newId  = sel.value;
        const newDef = CARD_BY_ID[newId];
        const newGrp = newDef ? COLOR_GROUPS[newDef.colorKey] : null;
        this._cards[idx] = newId;
        row.querySelector('.sc-row-swatch').style.background = newGrp ? newGrp.hex : '#888';
        this._drawReviewOverlay(idx);
      });
      // Prevent drag starting when interacting with the select
      sel.addEventListener('mousedown', e => e.stopPropagation());

      // ── Drag & drop ────────────────────────────────────────────────
      row.addEventListener('dragstart', e => {
        this._dragIdx = idx;
        row.classList.add('sc-row--dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('sc-row--dragging');
        container.querySelectorAll('.sc-row--over').forEach(r => r.classList.remove('sc-row--over'));
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.sc-row--over').forEach(r => r.classList.remove('sc-row--over'));
        if (idx !== this._dragIdx) row.classList.add('sc-row--over');
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('sc-row--over');
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('sc-row--over');
        const fromIdx = this._dragIdx;
        const toIdx   = parseInt(row.dataset.idx);
        if (fromIdx < 0 || fromIdx === toIdx) return;
        const movedCard   = this._cards.splice(fromIdx, 1)[0];
        const movedRegion = this._regions.splice(fromIdx, 1)[0];  // keep overlay in sync
        const movedCube   = this._cubeAssignments.splice(fromIdx, 1)[0];
        const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
        this._cards.splice(insertAt, 0, movedCard);
        if (movedRegion !== undefined) this._regions.splice(insertAt, 0, movedRegion);
        if (movedCube !== undefined)   this._cubeAssignments.splice(insertAt, 0, movedCube);
        this._renderList();
        this._drawReviewOverlay(-1);
      });

      // ── Delete ─────────────────────────────────────────────────────
      row.querySelector('.sc-row-del').addEventListener('click', e => {
        e.stopPropagation();
        this._cards.splice(idx, 1);
        // Keep overlay regions and cube assignments in sync
        if (idx < this._regions.length)         this._regions.splice(idx, 1);
        if (idx < this._cubeAssignments.length)  this._cubeAssignments.splice(idx, 1);
        this._renderList();
        this._drawReviewOverlay(-1);
      });

      container.appendChild(row);
    });

    // ── Function definition rows ─────────────────────────────────────────
    if (hasDefs) {
      // Separator
      if (hasCards) {
        const sep = document.createElement('div');
        sep.style.cssText = 'margin:10px 0 4px;border-top:1px dashed var(--border);padding-top:6px;font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:.04em;';
        sep.textContent = '── 関数定義 ──';
        container.appendChild(sep);
      }

      (this._actionDefRows || []).forEach((defRow, defIdx) => {
        // Section header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;margin:4px 0 2px;background:#9966FF18;border-left:3px solid #9966FF;border-radius:4px;font-size:12px;font-weight:600;color:#9966FF;';
        hdr.textContent = `定義: ${defRow.name}`;
        container.appendChild(hdr);

        if (defRow.cards.length === 0) {
          const em = document.createElement('p');
          em.className = 'sc-hint sc-hint-sm';
          em.textContent = '(カードなし)';
          container.appendChild(em);
          return;
        }

        defRow.cards.forEach((cardId, cardIdx) => {
          const def  = CARD_BY_ID[cardId];
          if (!def) return;
          const grp  = COLOR_GROUPS[def.colorKey];
          const hex  = grp ? grp.hex : '#888';

          const sameGroup  = CARD_DEFS.filter(d => d.colorKey === def.colorKey);
          const otherGroup = CARD_DEFS.filter(d => d.colorKey !== def.colorKey);
          const sameOpts   = sameGroup.map(d =>
            `<option value="${d.id}"${d.id === cardId ? ' selected' : ''}>${d.icon} : ${d.name}</option>`
          ).join('');
          const otherGrpHtml = otherGroup.length
            ? `<optgroup label="── 他のカード ──">${otherGroup.map(d =>
                `<option value="${d.id}">${d.icon} : ${d.name}</option>`).join('')}</optgroup>`
            : '';

          const row = document.createElement('div');
          row.className = 'sc-row';
          row.innerHTML = `
            <span class="sc-drag-handle" title="ドラッグ不可">⋮⋮</span>
            <span class="sc-row-num">${cardIdx + 1}</span>
            <span class="sc-row-swatch" style="background:${hex}"></span>
            <select class="sc-row-type-sel">${sameOpts}${otherGrpHtml}</select>
            <button class="sc-row-del" title="削除">×</button>
          `;

          const sel = row.querySelector('.sc-row-type-sel');
          sel.addEventListener('change', () => {
            this._actionDefRows[defIdx].cards[cardIdx] = sel.value;
            const nd = CARD_BY_ID[sel.value];
            const ng = nd ? COLOR_GROUPS[nd.colorKey] : null;
            row.querySelector('.sc-row-swatch').style.background = ng ? ng.hex : '#888';
          });
          sel.addEventListener('mousedown', e => e.stopPropagation());

          row.querySelector('.sc-row-del').addEventListener('click', () => {
            this._actionDefRows[defIdx].cards.splice(cardIdx, 1);
            this._renderList();
          });

          container.appendChild(row);
        });
      });
    }

    // Summary
    const note = document.createElement('p');
    note.className = 'sc-hint sc-hint-sm';
    note.style.marginTop = '6px';
    const cubeCount = new Set(this._cubeAssignments).size;
    const cubeInfo  = multiCube ? t('sc.cubeCount').replace('%1', cubeCount) : '';
    const defCount  = (this._actionDefRows || []).reduce((s, d) => s + d.cards.length, 0);
    const defInfo   = hasDefs ? t('sc.defInfo').replace('%1', (this._actionDefRows || []).length) : '';
    note.textContent = t('sc.totalCards').replace('%1', this._cards.length).replace('%2', cubeInfo).replace('%3', defInfo);
    container.appendChild(note);
  }

  _addFromSelect() {
    const sel = this._modal.querySelector('#sc-add-select');
    const id  = sel.value;
    if (!id) return;
    // Infer cube index from the last card in the list (default 0)
    const lastCube = this._cubeAssignments.length > 0
      ? this._cubeAssignments[this._cubeAssignments.length - 1]
      : 0;
    this._cards.push(id);
    this._regions.push(null);          // keep regions array in sync; null = no overlay box
    this._cubeAssignments.push(lastCube); // continue with same cube as previous card
    sel.value = '';
    this._renderList();
    this._drawReviewOverlay(-1);  // refresh overlay (null regions get skipped)
    this._modal.querySelector('#sc-apply-btn').style.display = 'inline-flex';
  }

  /* ── Apply to Workspace ──────────────────────────────────────────────*/

  _applyToWorkspace() {
    if (this._cards.length === 0 && (this._actionDefRows || []).length === 0) {
      this._status(t('sc.noCards'), 'warn');
      return;
    }

    let xmlStr;
    try {
      xmlStr = cardsToWorkspaceXML(this._cards, this._cubeAssignments, this._actionDefRows);
    } catch (err) {
      console.error('[CardScanner] XML build error:', err);
      this._status(t('sc.xmlError') + err.message, 'error');
      return;
    }

    try {
      if (typeof workspace !== 'undefined' && workspace) {
        const cardCount = this._cards.filter(id => CARD_BY_ID[id]?.block).length;
        const defCount  = (this._actionDefRows || []).length;
        const defMsg    = defCount ? t('sc.defMsg').replace('%1', defCount) : '';
        if (!confirm(t('sc.confirmApply').replace('%1', cardCount).replace('%2', defMsg))) return;
        workspace.clear();
        const dom = Blockly.utils.xml.textToDom(xmlStr);
        Blockly.Xml.domToWorkspace(dom, workspace);
        // Auto-arrange blocks in a tidy layout
        try {
          if (typeof workspace.cleanUp === 'function') {
            workspace.cleanUp();
          } else {
            // Fallback: lay out top-level blocks in a column with spacing
            const topBlocks = workspace.getTopBlocks(true);
            let yOffset = 20;
            topBlocks.forEach(block => {
              block.moveBy(-block.getRelativeToSurfaceXY().x + 20,
                           -block.getRelativeToSurfaceXY().y + yOffset);
              yOffset += (block.getHeightWidth()?.height ?? 80) + 30;
            });
          }
        } catch (e) { console.warn('[CardScanner] auto-arrange failed:', e); }
        try { workspace.scrollCenter(); workspace.zoomToFit(); } catch (e) {}
        this.close();
      } else {
        console.log('[CardScanner] Generated XML:\n', xmlStr);
        this._status('ワークスペースが見つかりません — XMLをコンソールに出力しました。', 'warn');
      }
    } catch (err) {
      console.error('[CardScanner] Workspace load error:', err);
      this._status('ブロック変換エラー: ' + err.message, 'error');
    }
  }

  /* ── Rectangle Selection Tool ───────────────────────────────────────
     Allows the user to drag a rectangle on the review image to select a
     sub-region and run additional card detection on that area.             */

  _toggleSelectionTool() {
    this._selMode = !this._selMode;
    const btn = this._modal?.querySelector('#sc-sel-tool-btn');
    const cv  = this._modal?.querySelector('#sc-review-canvas');
    if (!btn || !cv) return;
    if (this._selMode) {
      btn.classList.add('active');
      cv.style.cursor        = 'crosshair';
      cv.style.pointerEvents = 'auto';
      this._status('ドラッグでカード範囲を選択してください。');
      this._bindSelectionEvents(cv);
    } else {
      btn.classList.remove('active');
      cv.style.cursor        = '';
      cv.style.pointerEvents = 'none';
      this._unbindSelectionEvents(cv);
      this._drawReviewOverlay(-1);
      this._status('');
    }
  }

  _bindSelectionEvents(cv) {
    this._selDrag  = null;
    this._onSelMousedown = (e) => {
      const rect = cv.getBoundingClientRect();
      const scX  = cv.width  / rect.width;
      const scY  = cv.height / rect.height;
      this._selDrag = {
        x0: (e.clientX - rect.left) * scX,
        y0: (e.clientY - rect.top)  * scY,
      };
    };
    this._onSelMousemove = (e) => {
      if (!this._selDrag) return;
      const rect = cv.getBoundingClientRect();
      const scX  = cv.width  / rect.width;
      const scY  = cv.height / rect.height;
      const x1 = this._selDrag.x0, y1 = this._selDrag.y0;
      const x2 = (e.clientX - rect.left) * scX;
      const y2 = (e.clientY - rect.top)  * scY;
      this._selDrag.x1 = x2; this._selDrag.y1 = y2;
      // Redraw overlay + selection rect
      this._drawReviewOverlay(-1);
      const ctx2 = cv.getContext('2d');
      ctx2.save();
      ctx2.strokeStyle = '#0078FF';
      ctx2.lineWidth   = 2;
      ctx2.setLineDash([4, 3]);
      ctx2.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
      ctx2.fillStyle = 'rgba(0,120,255,0.08)';
      ctx2.fillRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
      ctx2.restore();
    };
    this._onSelMouseup = (e) => {
      if (!this._selDrag || this._selDrag.x1 == null) { this._selDrag = null; return; }
      const cv2 = this._modal?.querySelector('#sc-review-canvas');
      const rect = cv2.getBoundingClientRect();
      const scX  = cv2.width  / rect.width;
      const scY  = cv2.height / rect.height;
      let cx1 = Math.min(this._selDrag.x0, this._selDrag.x1);
      let cx2 = Math.max(this._selDrag.x0, this._selDrag.x1);
      let cy1 = Math.min(this._selDrag.y0, this._selDrag.y1);
      let cy2 = Math.max(this._selDrag.y0, this._selDrag.y1);
      this._selDrag = null;
      // Minimum selection 20px in each dimension
      if (cx2 - cx1 < 20 || cy2 - cy1 < 20) { this._drawReviewOverlay(-1); return; }
      // Map canvas-pixel coords → analysis coords
      // canvas size = reviewImg.naturalWidth × naturalHeight
      // analysis coords scaled by scaleX = naturalWidth / this._W
      const reviewImg = this._modal?.querySelector('#sc-review-img');
      const aScX = this._W / (reviewImg?.naturalWidth  || this._W);
      const aScY = this._H / (reviewImg?.naturalHeight || this._H);
      const ax1 = Math.round(cx1 * aScX), ax2 = Math.round(cx2 * aScX);
      const ay1 = Math.round(cy1 * aScY), ay2 = Math.round(cy2 * aScY);
      this._analyzeSelection(ax1, ay1, ax2, ay2);
    };
    cv.addEventListener('mousedown', this._onSelMousedown);
    cv.addEventListener('mousemove', this._onSelMousemove);
    cv.addEventListener('mouseup',   this._onSelMouseup);
  }

  _unbindSelectionEvents(cv) {
    if (this._onSelMousedown) cv.removeEventListener('mousedown', this._onSelMousedown);
    if (this._onSelMousemove) cv.removeEventListener('mousemove', this._onSelMousemove);
    if (this._onSelMouseup)   cv.removeEventListener('mouseup',   this._onSelMouseup);
    this._onSelMousedown = this._onSelMousemove = this._onSelMouseup = null;
  }

  /**
   * Run card detection on the selected sub-region (analysis coords) and
   * append any NEW cards (non-overlapping with existing regions) to the list.
   */
  _analyzeSelection(ax1, ay1, ax2, ay2) {
    if (!this._analysisCtx || !this._W || !this._H) {
      this._status('先にカードを認識してください。', 'warn');
      return;
    }
    const ctx = this._analysisCtx;
    const W   = this._W;
    const H   = this._H;

    // Detect card regions in the selected Y band
    const yPad  = Math.max(0, ay1 - Math.round(H * 0.01));
    const yEnd  = Math.min(H, ay2 + Math.round(H * 0.01));
    const rawRegions = detectCardRegionsInBand(ctx, W, yPad, yEnd);

    // Filter to regions within the selected X range
    const xMargin = Math.round(W * 0.02);
    const newCells = rawRegions
      .filter(r => r.endX > ax1 - xMargin && r.startX < ax2 + xMargin)
      .map(r => ({ ...r, startX: Math.max(r.startX, ax1 - xMargin),
                         endX:   Math.min(r.endX,   ax2 + xMargin),
                         startY: ay1, endY: ay2 }));

    if (newCells.length === 0) {
      this._status('選択範囲内でカードを検出できませんでした。', 'warn');
      this._drawReviewOverlay(-1);
      return;
    }

    // Skip regions that largely overlap existing ones (IoU > 50%)
    const _overlap = (a, b) => {
      const ix = Math.max(0, Math.min(a.endX, b.endX) - Math.max(a.startX, b.startX));
      const iy = Math.max(0, Math.min(a.endY, b.endY) - Math.max(a.startY, b.startY));
      const inter = ix * iy;
      if (inter === 0) return 0;
      const areaA = (a.endX - a.startX) * (a.endY - a.startY);
      const areaB = (b.endX - b.startX) * (b.endY - b.startY);
      return inter / Math.min(areaA, areaB);
    };

    let added = 0;
    for (const nr of newCells) {
      const dup = this._regions.some(er => er && _overlap(er, nr) > 0.5);
      if (dup) continue;

      // Disambiguate card type
      const colorKey   = nr.grp;
      const candidates = CARD_DEFS.filter(d => d.colorKey === colorKey);
      if (candidates.length === 0) continue;
      let cardId = candidates[0].id;
      if (candidates.length > 1) {
        const refined = this._disambiguateCard(ctx, W, H, nr, colorKey,
                          this._regions.length, this._regions.length + 1);
        if (refined) cardId = refined;
      }

      this._cards.push(cardId);
      this._regions.push(nr);
      // Range-selection always adds to cube 0 (no row labels available)
      this._cubeAssignments.push(0);
      added++;
    }

    if (added > 0) {
      this._renderList();
      this._drawReviewOverlay(-1);
      this._status(`${added} 枚のカードを追加しました。`);
    } else {
      this._drawReviewOverlay(-1);
      this._status('新しいカードは見つかりませんでした（すでに認識済み）。', 'warn');
    }
  }

  /* ── Utility ─────────────────────────────────────────────────────────*/

  _status(msg, type = 'info') {
    const el = this._modal?.querySelector('#sc-status');
    if (!el) return;
    el.textContent = msg;
    el.className   = `sc-status${type !== 'info' ? ' ' + type : ''}`;
  }
}

/* ─── Module-level helpers ──────────────────────────────────────────────────*/

/**
 * Normalize any recognised action-label variant to the current-language name.
 * The physical cards always show Japanese ("こうどう1"), but when the UI is set
 * to English or Chinese, Blockly procedure names should match the UI language.
 */
function _normalizeActionLabel(label) {
  if (!label) return label;
  const s = label.trim();
  if (/^こうどう\s*[1１]$/.test(s) || /^action[\s_-]?1$/i.test(s) || /^动作\s*[1１]$/.test(s))
    return t('action.name1');
  if (/^こうどう\s*[2２]$/.test(s) || /^action[\s_-]?2$/i.test(s) || /^动作\s*[2２]$/.test(s))
    return t('action.name2');
  return s;
}

/* ─── Module init ───────────────────────────────────────────────────────────*/

let _cardScanner = null;

/** Called from app.js DOMContentLoaded */
function initCardScanner() {
  _cardScanner = new CardScanner();
  const btn = document.getElementById('btn-card-scan');
  if (btn) {
    btn.addEventListener('click', () => _cardScanner.open());
    if (typeof t === 'function') btn.title = t('ui.cardScan') || 'カードスキャン';
  }
}
