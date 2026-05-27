/* llm.js — Natural language → toio code via Claude / OpenAI / Gemini */

// ─── Default models (can be overridden per-provider via localStorage) ─────────
const LLM_DEFAULT_MODELS = {
  anthropic: 'claude-3-5-sonnet-20241022',
  openai:    'gpt-4o',
  gemini:    'gemini-2.0-flash',
};

// ─── Shared API reference (included in every prompt) ─────────────────────────
const _API_REF = `
## 利用可能なAPI

\`\`\`javascript
// ── 座標移動 (2種類) ─────────────────────────────────────────────────────────
// ① 角度あり移動: 到着時にangleの向きを向く (0=上, 90=右, 180=下, 270=左)
await toio[0].moveTo(x, y, angle, speed);
// ② 座標のみ移動: 角度不要のとき — 進行方向を自動的に向く (Blockly: 「座標へ移動」ブロック)
await toio[0].moveTo(x, y, null, speed, 'POS_ONLY');

// ── その他の移動 ─────────────────────────────────────────────────────────────
await toio[0].rotateTo(angle, speed);                     // その場で角度を変える
await toio[0].move(leftSpeed, rightSpeed, durationMs);    // 時間ベース: speed -115〜115

await toio[0].stop();
await toio[0].setLED(r, g, b, durationMs);   // r,g,b: 0〜255
await toio[0].turnOffLED();
await toio[0].playSound(noteNumber, durationMs); // MIDI: 60=C4
await toio[0].playSoundEffect(id); // 0=入場 1=選択 2=キャンセル 3=カーソル 4=マット 5=アイテム 6=得点 7=エラー
await toio[0].stopSound();
await toio.all(async t => { await t.moveTo(250, 250, null, 80, 'POS_ONLY'); }); // 全キューブ同時
await toio.wait(seconds);
await toio.waitButton(0);
toio.getState(0)   // {x,y,angle,button}
toio.log("メッセージ");
\`\`\`

toioマット座標: X=45〜455, Y=45〜455, 中央=250,250
angle指定: 0=上(北) 90=右(東) 180=下(南) 270=左(西)

### moveTo の使い分け

| 状況 | 使うべき形式 |
|------|------------|
| 形を描く・点を巡る（向きが重要でない） | \`moveTo(x, y, null, speed, 'POS_ONLY')\` |
| 到着時の向きを指定したい | \`moveTo(x, y, angle, speed)\` |
| 実機で特定の向きに停止させたい | \`moveTo(x, y, angle, speed)\` |`;

// ─── Block-compatibility rules (position-based) ──────────────────────────────
const _BLOCK_RULES = `
## ⚠️ ブロック変換必須ルール

生成したコードはBlocklyビジュアルブロックに自動変換されます。
**以下を絶対に守ること — 守らないとブロック変換が失敗します。**

### 禁止事項（NG）
1. **\`function\` 定義は禁止** → \`function getStarPoints(...) {}\` は使わない
2. **Math.*をAPI引数に直接使用禁止** → \`moveTo(Math.round(250 + 100*Math.cos(a)), ...\` は禁止
3. **\`.push()\` による動的配列組み立て禁止** → \`points.push([...])\` は禁止
4. **変数を直接API引数に使用禁止** → \`moveTo(x, y, null, 80, 'POS_ONLY')\` は禁止（x,yが変数の場合）

### 許可事項（OK）
- **数値リテラルのみ** をAPI引数に使う: \`moveTo(250, 300, null, 80, 'POS_ONLY')\`
- **逐次 moveTo 列挙**（推奨）: 各点を 1行ずつ書く ← **ブロックと完全一致**
- **座標配列リテラル**（代替）: \`const pts = [[x,y],[x,y],...]\` で宣言し、インデックスでアクセス
  - 配列ループ: \`for (let i = 0; i < pts.length; i++)\` — **必ず \`pts.length\`（スペースなし）**
- **繰り返し**: \`for (let i = 0; i < N; i++)\` (Nは数値リテラル)

### Blocklyブロック対応表（必須）

| コード形式 | 対応Blocklyブロック |
|-----------|-------------------|
| \`moveTo(x, y, null, speed, 'POS_ONLY')\` | **「座標へ移動」ブロック**（形を描く・点を巡る） |
| \`moveTo(x, y, angle, speed)\` | **「座標・角度へ移動」ブロック**（角度指定が必要なとき） |
| \`move(left, right, ms)\` | **「時間で移動」ブロック** |

**形を描くときは必ず \`'POS_ONLY'\` 形式を使うこと。**

### 多角形・星形などの複雑な形状
**推奨: 各点を1行ずつ書く（ブロックに直接変換される）**
\`\`\`javascript
// 五角形の例（推奨: 逐次書き — 各行がブロック1個に対応）
await toio[0].moveTo(250, 150, null, 80, 'POS_ONLY');
await toio[0].moveTo(334, 209, null, 80, 'POS_ONLY');
await toio[0].moveTo(305, 300, null, 80, 'POS_ONLY');
await toio[0].moveTo(195, 300, null, 80, 'POS_ONLY');
await toio[0].moveTo(166, 209, null, 80, 'POS_ONLY');
await toio[0].moveTo(250, 150, null, 80, 'POS_ONLY');
\`\`\`
配列形式（代替）: **必ず \`pts.length\`（ドットの前後にスペースなし）**:
\`\`\`javascript
const pts = [[250,150],[334,209],[305,300],[195,300],[166,209]];
await toio[0].moveTo(pts[0][0], pts[0][1], null, 80, 'POS_ONLY');
for (let i = 1; i < pts.length; i++) {
    await toio[0].moveTo(pts[i][0], pts[i][1], null, 80, 'POS_ONLY');
}
await toio[0].moveTo(pts[0][0], pts[0][1], null, 80, 'POS_ONLY');
\`\`\``;

// ─── Block-compatibility rules (TIME-based — no moveTo, no coord arrays) ─────
const _BLOCK_RULES_TIME = `
## ⚠️ ブロック変換必須ルール

生成したコードはBlocklyビジュアルブロックに自動変換されます。
**以下を絶対に守ること — 守らないとブロック変換が失敗します。**

### 禁止事項（NG — 時間ベースモードでは厳守）
1. **\`function\` 定義は禁止**
2. **\`moveTo()\` は絶対禁止** → 時間ベースでは座標指定移動を使わない
3. **座標配列の定義禁止** → \`const pts = [[x,y],...]\` は禁止
4. **Math.* をAPI引数に直接使用禁止**
5. **変数を直接 move() 引数に使用禁止** → \`move(speed, speed, ms)\` は禁止（変数の場合）

### 許可事項（OK）
- **数値リテラルのみ** を move() 引数に使う: \`move(80, 80, 1000)\`
- **繰り返し**: \`for (let i = 0; i < N; i++)\` (Nは数値リテラル)
- LED・サウンド・wait は通常通り使用可

### 時間ベースで複雑な動き → move() のみで組み合わせる
\`\`\`javascript
// 三角形に近い動き（前進→左旋回を3回）
for (let i = 0; i < 3; i++) {
    await toio[0].move(80, 80, 700);
    await toio[0].move(-50, 50, 550);
}
await toio[0].stop();
\`\`\``;

// ─── Position-based system prompt ────────────────────────────────────────────
const SYSTEM_PROMPT_POSITION = `あなたはtoioロボットを制御するJavaScriptコードを生成するAIアシスタントです。
ユーザーの指示を受け取り、実行可能なJavaScriptコードを生成してください。
${_API_REF}
/* <<MAT_CONTEXT>> */

## 移動スタイル: 座標ベース（位置指定）

**形を描く・点を巡るときは \`moveTo(x, y, null, speed, 'POS_ONLY')\` を使う（到着向きを自動決定）。**
**特定の方向を向いて止まる必要があるときのみ \`moveTo(x, y, angle, speed)\` を使う。**
move() は旋回・その場回転のみに使う。

### 例

「正方形を描く」→
\`\`\`javascript
// 形を描く → POS_ONLY（到着向きを自動決定）
await toio[0].moveTo(200, 200, null, 80, 'POS_ONLY');
await toio[0].moveTo(300, 200, null, 80, 'POS_ONLY');
await toio[0].moveTo(300, 300, null, 80, 'POS_ONLY');
await toio[0].moveTo(200, 300, null, 80, 'POS_ONLY');
await toio[0].moveTo(200, 200, null, 80, 'POS_ONLY');
\`\`\`

「三角形を描く」→
\`\`\`javascript
// 各点を1行ずつ書く（ブロックに直接変換される）
await toio[0].moveTo(250, 170, null, 80, 'POS_ONLY');
await toio[0].moveTo(330, 310, null, 80, 'POS_ONLY');
await toio[0].moveTo(170, 310, null, 80, 'POS_ONLY');
await toio[0].moveTo(250, 170, null, 80, 'POS_ONLY');
\`\`\`

「中央に移動して上（北）を向いて止まる」→
\`\`\`javascript
// 到着時の向きを指定 → angle形式
await toio[0].moveTo(250, 250, 0, 80);
\`\`\`

「その場で右に90°回転」→
\`\`\`javascript
await toio[0].move(50, -50, 400);
\`\`\`

「赤→緑→青とLED点滅」→
\`\`\`javascript
await toio[0].setLED(255, 0, 0, 500);
await toio[0].setLED(0, 255, 0, 500);
await toio[0].setLED(0, 0, 255, 500);
await toio[0].turnOffLED();
\`\`\`

「全キューブを中央に集める」→
\`\`\`javascript
await toio.all(async t => { await t.moveTo(250, 250, null, 80, 'POS_ONLY'); });
\`\`\`
${_BLOCK_RULES}

## 出力ルール
- コードブロック(\`\`\`javascript ... \`\`\`)内にコードを書く
- duration はミリ秒単位（1秒 = 1000）
- 全ての非同期関数にawaitを付ける
- コードの前後に日本語の説明を添える`;

// ─── Time-based system prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT_TIME = `あなたはtoioロボットを制御するJavaScriptコードを生成するAIアシスタントです。
ユーザーの指示を受け取り、実行可能なJavaScriptコードを生成してください。
${_API_REF}
/* <<MAT_CONTEXT>> */

## 移動スタイル: 時間ベース（モーター速度+時間）

**move(leftSpeed, rightSpeed, durationMs) を使って時間と速度で移動する。**
moveTo() は使わない。speed は -115〜115、durationMs はミリ秒。

| 動作 | コード例 |
|------|---------|
| 前進1秒 | \`move(80, 80, 1000)\` |
| 後退1秒 | \`move(-80, -80, 1000)\` |
| 右旋回0.5秒 | \`move(50, -50, 500)\` |
| 左旋回0.5秒 | \`move(-50, 50, 500)\` |
| その場右90° | \`move(50, -50, 400)\` |

### 例

「前に1秒進んで止まる」→
\`\`\`javascript
await toio[0].move(80, 80, 1000);
await toio[0].stop();
\`\`\`

「正方形を描く（時間ベース）」→
\`\`\`javascript
for (let i = 0; i < 4; i++) {
    await toio[0].move(80, 80, 800);
    await toio[0].move(50, -50, 400);
}
await toio[0].stop();
\`\`\`

「ジグザグに進む」→
\`\`\`javascript
await toio[0].move(80, 80, 500);
await toio[0].move(50, -50, 300);
await toio[0].move(80, 80, 500);
await toio[0].move(-50, 50, 300);
await toio[0].move(80, 80, 500);
await toio[0].stop();
\`\`\`

「赤→緑→青とLED点滅しながら前進」→
\`\`\`javascript
await toio[0].setLED(255, 0, 0, 500);
await toio[0].move(80, 80, 500);
await toio[0].setLED(0, 255, 0, 500);
await toio[0].move(80, 80, 500);
await toio[0].setLED(0, 0, 255, 500);
await toio[0].move(80, 80, 500);
await toio[0].turnOffLED();
await toio[0].stop();
\`\`\`
${_BLOCK_RULES_TIME}

## 出力ルール
- コードブロック(\`\`\`javascript ... \`\`\`)内にコードを書く
- duration はミリ秒単位（1秒 = 1000）
- 全ての非同期関数にawaitを付ける
- コードの前後に日本語の説明を添える`;

// ─── Backward-compat alias used elsewhere in the codebase ─────────────────────
const SYSTEM_PROMPT = SYSTEM_PROMPT_POSITION;

/**
 * Build the "current mat context" section injected into every system prompt.
 * Working area = ~70% of each mat dimension centered on the mat → ~half the total area.
 * @param {object} matCfg  { xMin, yMin, xMax, yMax }
 * @returns {string} Markdown section for injection, or '' if no matCfg.
 */
function _buildMatContext(matCfg) {
  if (!matCfg) return '';
  const { xMin, yMin, xMax, yMax } = matCfg;
  const cx  = Math.round((xMin + xMax) / 2);
  const cy  = Math.round((yMin + yMax) / 2);
  // ~70% of each dimension centered → area ≈ 49% ≈ 面積の半分
  const hw  = Math.round((xMax - xMin) * 0.35);
  const hh  = Math.round((yMax - yMin) * 0.35);
  const wxMin = cx - hw, wxMax = cx + hw;
  const wyMin = cy - hh, wyMax = cy + hh;
  return `
## 現在のマット設定（必ず参照すること）

使用中マット座標範囲: X=${xMin}〜${xMax}, Y=${yMin}〜${yMax}（中央: ${cx}, ${cy}）
**推奨移動範囲（面積の約半分）: X=${wxMin}〜${wxMax}, Y=${wyMin}〜${wyMax}**

サイズ・移動範囲の指定がない場合は、上記の推奨移動範囲内で座標を決定すること。
形のスタート位置も推奨範囲内（中央 ${cx}, ${cy} 付近）に設定すること。
`;
}

/**
 * Return the appropriate system prompt for the given code style.
 * style:   'time'     → time-based movement (move + duration)
 *          'position' → position-based movement (moveTo with coordinates)
 * matCfg:  current mat config { xMin, yMin, xMax, yMax } — injected as coordinate context
 */
function buildSystemPrompt(style, matCfg) {
  const base = style === 'time' ? SYSTEM_PROMPT_TIME : SYSTEM_PROMPT_POSITION;
  const matSection = _buildMatContext(matCfg);
  return base.replace('/* <<MAT_CONTEXT>> */', matSection);
}

window.buildSystemPrompt = buildSystemPrompt;

// ─── LLMClient ────────────────────────────────────────────────────────────────
class LLMClient {
  constructor() {
    this.provider   = 'anthropic';
    this.apiKey     = '';
    this.modelOverride = {};   // { anthropic: '...', openai: '...', gemini: '...' }
    this.messages   = [];
    this._onMessage = null;
    this._onError   = null;
    this._systemPromptOverride = null; // set by app.js for code-style variants
  }

  /** Return the effective system prompt (override takes precedence). */
  _systemPrompt() {
    return this._systemPromptOverride || SYSTEM_PROMPT;
  }

  configure(provider, apiKey) {
    this.provider = provider;
    this.apiKey   = apiKey;
  }

  /** Set model override for a specific provider (empty string = use default). */
  setModel(provider, model) {
    if (model && model.trim()) {
      this.modelOverride[provider] = model.trim();
    } else {
      delete this.modelOverride[provider];
    }
  }

  /** Get effective model for current provider. */
  _model(provider) {
    return (this.modelOverride[provider] || LLM_DEFAULT_MODELS[provider] || '');
  }

  onMessage(fn) { this._onMessage = fn; }
  onError(fn)   { this._onError   = fn; }

  async send(userText) {
    if (!this.apiKey) {
      if (this._onError) this._onError('APIキーが設定されていません。');
      return null;
    }

    this.messages.push({ role: 'user', content: userText });

    try {
      let reply = '';
      if (this.provider === 'anthropic') {
        reply = await this._callClaude();
      } else if (this.provider === 'gemini') {
        reply = await this._callGemini();
      } else {
        reply = await this._callOpenAI();
      }

      this.messages.push({ role: 'assistant', content: reply });

      const match = reply.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
      const code  = match ? match[1].trim() : null;

      if (this._onMessage) this._onMessage({ text: reply, code });
      return { text: reply, code };
    } catch (e) {
      this.messages.pop();
      if (this._onError) this._onError(`API エラー: ${e.message}`);
      return null;
    }
  }

  // ── Claude (Anthropic) ───────────────────────────────────────────────────────
  async _callClaude() {
    const model = this._model('anthropic');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-tool-use': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: this._systemPrompt(),
        messages: this.messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.content[0].text;
  }

  // ── Gemini (Google) ──────────────────────────────────────────────────────────
  async _callGemini() {
    const model = this._model('gemini');
    // v1beta supports all current Gemini models
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    // Gemini requires alternating user/model turns; prepend system as user+model pair
    const contents = [
      { role: 'user',  parts: [{ text: this._systemPrompt() }] },
      { role: 'model', parts: [{ text: 'わかりました。toioのコードを生成します。' }] },
      ...this.messages.map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ];

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: 2048 },
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      let msg = errBody.error?.message || `HTTP ${res.status}`;
      // Friendly hint when model name is stale
      if (res.status === 404 || msg.includes('not found') || msg.includes('deprecated')) {
        msg += ' — モデル名を確認してください。⟳ボタンで最新モデル一覧を取得できます。';
      }
      throw new Error(msg);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  async _callOpenAI() {
    const model = this._model('openai');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: this._systemPrompt() },
          ...this.messages,
        ],
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  clearHistory() { this.messages = []; }
}

window.LLMClient          = LLMClient;
window.LLM_DEFAULT_MODELS = LLM_DEFAULT_MODELS;

// ─── Model list fetcher (shared by AI chat + card scanner) ────────────────────
/**
 * Fetch available models from the given provider's API.
 * provider: 'gemini' | 'openai' | 'anthropic' | 'claude'
 * Returns: Array<{ id: string, name: string }>  sorted newest-first
 * Throws on auth error, network failure, etc.
 */
async function fetchModelList(provider, apiKey) {
  if (!apiKey || !apiKey.trim()) throw new Error('APIキーが入力されていません');
  const p = (provider === 'claude') ? 'anthropic' : provider;

  // ── Gemini ──────────────────────────────────────────────────────────────
  if (p === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(url);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => ({
        id:   m.name.replace(/^models\//, ''),   // strip "models/" prefix
        name: m.displayName || m.name,
      }))
      .sort((a, b) => b.id.localeCompare(a.id));  // newest first
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────
  if (p === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return (data.data || [])
      .filter(m => /^(gpt-|o1-|o3-|o4-)/.test(m.id) && !m.id.includes(':'))
      .map(m => ({ id: m.id, name: m.id }))
      .sort((a, b) => b.id.localeCompare(a.id));
  }

  // ── Anthropic / Claude ───────────────────────────────────────────────────
  if (p === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-tool-use': 'true',
      },
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return (data.data || [])
      .map(m => ({ id: m.id, name: m.display_name || m.id }))
      .sort((a, b) => b.id.localeCompare(a.id));
  }

  throw new Error(`未知のプロバイダー: ${provider}`);
}

window.fetchModelList = fetchModelList;
