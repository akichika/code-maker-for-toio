// JavaScript and Python code generators for toio blocks
// NOTE: COLOR_MAP is defined in blocks.js (window.COLOR_MAP). Do NOT redeclare it here.

// ─── Cube selector helper ─────────────────────────────────────────────────────
// Returns JS code: `toio[n]` for a specific cube or wraps in `toio.all(...)` for ALL.
// Usage (statement): cubeCall(block, 'G', 'method(a, b)')
//   → "await toio.all(t => t.method(a, b));\n"   or   "await toio[0].method(a, b);\n"
function cubeCallJS(block, method_call) {
  const cube = block.getFieldValue('CUBE');
  if (cube === 'ALL') {
    return `await toio.all(async t => { await t.${method_call}; });\n`;
  }
  return `await toio[${cube}].${method_call};\n`;
}

function cubeExprJS(block, method_call) {
  const cube = block.getFieldValue('CUBE');
  if (cube === 'ALL') {
    return [`toio[0].${method_call}`, Blockly.JavaScript.ORDER_ATOMIC];
  }
  return [`toio[${cube}].${method_call}`, Blockly.JavaScript.ORDER_ATOMIC];
}

// ─── JavaScript Generator ────────────────────────────────────────────────────
function initJSGenerators() {
  const G = Blockly.JavaScript;

  G['toio_move'] = function(block) {
    const dir   = block.getFieldValue('DIRECTION');
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '50';
    const dur   = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '1';
    const [l, r] = dir === 'FORWARD' ? [speed, speed] : [`-(${speed})`, `-(${speed})`];
    return cubeCallJS(block, `move(${l}, ${r}, ${dur} * 1000)`);
  };

  G['toio_turn'] = function(block) {
    const dir   = block.getFieldValue('DIRECTION');
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '50';
    const dur   = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '1';
    const [l, r] = dir === 'LEFT' ? [`-(${speed})`, speed] : [speed, `-(${speed})`];
    return cubeCallJS(block, `move(${l}, ${r}, ${dur} * 1000)`);
  };

  G['toio_move_raw'] = function(block) {
    const l   = G.valueToCode(block, 'LEFT',     G.ORDER_ATOMIC) || '0';
    const r   = G.valueToCode(block, 'RIGHT',    G.ORDER_ATOMIC) || '0';
    const dur = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '0';
    return cubeCallJS(block, `move(${l}, ${r}, ${dur} * 1000)`);
  };

  G['toio_move_to'] = function(block) {
    const x     = G.valueToCode(block, 'X',     G.ORDER_ATOMIC) || '200';
    const y     = G.valueToCode(block, 'Y',     G.ORDER_ATOMIC) || '200';
    const angle = G.valueToCode(block, 'ANGLE', G.ORDER_ATOMIC) || '0';
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '80';
    const mode  = block.getFieldValue('MODE') || 'NORMAL';
    return cubeCallJS(block, `moveTo(${x}, ${y}, ${angle}, ${speed}, '${mode}')`);
  };

  G['toio_move_to_xy'] = function(block) {
    const x     = G.valueToCode(block, 'X',     G.ORDER_ATOMIC) || '200';
    const y     = G.valueToCode(block, 'Y',     G.ORDER_ATOMIC) || '200';
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '80';
    return cubeCallJS(block, `moveTo(${x}, ${y}, null, ${speed}, 'POS_ONLY')`);
  };

  G['toio_rotate_to'] = function(block) {
    const angle = G.valueToCode(block, 'ANGLE', G.ORDER_ATOMIC) || '0';
    return cubeCallJS(block, `rotateTo(${angle})`);
  };

  G['toio_move_rel'] = function(block) {
    const dir   = block.getFieldValue('DIRECTION');
    const dist  = G.valueToCode(block, 'DIST',  G.ORDER_ATOMIC) || '50';
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '60';
    const d = dir === 'FORWARD' ? dist : `-(${dist})`;
    return cubeCallJS(block, `moveRel(${d}, ${speed})`);
  };

  G['toio_rotate_rel'] = function(block) {
    const dir   = block.getFieldValue('DIRECTION');
    const angle = G.valueToCode(block, 'ANGLE', G.ORDER_ATOMIC) || '90';
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '60';
    const da = dir === 'RIGHT' ? angle : `-(${angle})`;
    return cubeCallJS(block, `rotateRel(${da}, ${speed})`);
  };

  G['toio_stop'] = function(block) {
    return cubeCallJS(block, 'stop()');
  };

  G['toio_led'] = function(block) {
    const r   = G.valueToCode(block, 'R', G.ORDER_ATOMIC) || '0';
    const g   = G.valueToCode(block, 'G', G.ORDER_ATOMIC) || '0';
    const b   = G.valueToCode(block, 'B', G.ORDER_ATOMIC) || '0';
    const dur = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '0';
    return cubeCallJS(block, `setLED(${r}, ${g}, ${b}, ${dur} * 1000)`);
  };

  G['toio_led_color'] = function(block) {
    const key = block.getFieldValue('COLOR');
    const dur = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '0';
    if (key === 'OFF') return cubeCallJS(block, 'turnOffLED()');
    const [r, g, b] = COLOR_MAP[key] || [0, 0, 0];
    return cubeCallJS(block, `setLED(${r}, ${g}, ${b}, ${dur} * 1000)`);
  };

  G['toio_led_off'] = function(block) {
    return cubeCallJS(block, 'turnOffLED()');
  };

  G['toio_sound_effect'] = function(block) {
    const id = block.getFieldValue('EFFECT');
    return cubeCallJS(block, `playSoundEffect(${id})`);
  };

  G['toio_play_note'] = function(block) {
    const note = block.getFieldValue('NOTE');
    const dur  = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '1';
    return cubeCallJS(block, `playSound(${note}, ${dur} * 1000)`);
  };

  G['toio_stop_sound'] = function(block) {
    return cubeCallJS(block, 'stopSound()');
  };

  G['toio_wait'] = function(block) {
    const sec = G.valueToCode(block, 'SECONDS', G.ORDER_ATOMIC) || '1';
    return `await toio.wait(${sec});\n`;
  };

  G['toio_wait_button'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return `await toio.waitButton(${idx});\n`;
  };

  // toio_run_action: legacy block — now delegates to the こうどう procedure
  G['toio_run_action'] = function(block) {
    const slot = block.getFieldValue('SLOT');
    const name = slot === '1' ? 'こうどう1' : 'こうどう2';
    return `if (typeof ${name} === 'function') await ${name}();\n`;
  };

  // ── Async-aware procedure generators ────────────────────────────────────
  // All toio API calls use await; procedures must be async so their bodies
  // can contain await expressions.

  G['procedures_defnoreturn'] = function(block) {
    const name   = block.getFieldValue('NAME') || 'procedure';
    const args   = (block.arguments_ || []).map(a =>
      G.nameDB_.getName(a, Blockly.Names.NameType.VARIABLE));
    const branch = G.statementToCode(block, 'STACK');
    return `async function ${name}(${args.join(', ')}) {\n${branch || ''}}\n`;
  };

  G['procedures_defreturn'] = function(block) {
    const name   = block.getFieldValue('NAME') || 'procedure';
    const args   = (block.arguments_ || []).map(a =>
      G.nameDB_.getName(a, Blockly.Names.NameType.VARIABLE));
    const branch = G.statementToCode(block, 'STACK');
    const retVal = G.valueToCode(block, 'RETURN', G.ORDER_NONE) || '';
    return `async function ${name}(${args.join(', ')}) {\n${branch}${retVal ? `  return ${retVal};\n` : ''}}\n`;
  };

  G['procedures_callnoreturn'] = function(block) {
    const name = block.getFieldValue('NAME') || '';
    const args = [];
    for (let i = 0; i < (block.arguments_ || []).length; i++) {
      args.push(G.valueToCode(block, 'ARG' + i, G.ORDER_COMMA) || 'null');
    }
    return name ? `await ${name}(${args.join(', ')});\n` : '';
  };

  G['procedures_callreturn'] = function(block) {
    const name = block.getFieldValue('NAME') || '';
    const args = [];
    for (let i = 0; i < (block.arguments_ || []).length; i++) {
      args.push(G.valueToCode(block, 'ARG' + i, G.ORDER_COMMA) || 'null');
    }
    return name
      ? [`(await ${name}(${args.join(', ')}))`, G.ORDER_FUNCTION_CALL]
      : ['null', G.ORDER_ATOMIC];
  };

  G['toio_on_start'] = function(block) {
    const body = G.statementToCode(block, 'DO');
    return `toio.onStart(async () => {\n${body}});\n`;
  };

  G['toio_on_button'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '-1' : cube;
    const body = G.statementToCode(block, 'DO');
    return `toio.onButton(${idx}, async () => {\n${body}});\n`;
  };

  G['toio_is_button'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`toio.getState(${idx}).button`, G.ORDER_ATOMIC];
  };

  G['toio_is_horizontal'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`toio.getState(${idx}).horizontal`, G.ORDER_ATOMIC];
  };

  G['toio_battery'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`(await toio.getBattery(${idx}))`, G.ORDER_AWAIT];
  };

  G['toio_position_x'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`toio.getState(${idx}).x`, G.ORDER_ATOMIC];
  };

  G['toio_position_y'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`toio.getState(${idx}).y`, G.ORDER_ATOMIC];
  };

  G['toio_position_angle'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`toio.getState(${idx}).angle`, G.ORDER_ATOMIC];
  };

  G['toio_print'] = function(block) {
    const text = G.valueToCode(block, 'TEXT', G.ORDER_ATOMIC) || '""';
    return `toio.log(${text});\n`;
  };
}

// ─── Python Generator (toio.py API) ──────────────────────────────────────────
// Generates proper toio.py code. See: https://github.com/toio/toio.py/
function initPythonGenerators() {
  const G = Blockly.Python;
  if (!G) return;

  // Helper: call a cube API method (direct .api.xxx path)
  function pyCall(block, apiPath) {
    const c = block.getFieldValue('CUBE');
    if (c === 'ALL') {
      return `for _c in cubes:\n    await _c.${apiPath}\n`;
    }
    return `await cubes[${c}].${apiPath}\n`;
  }

  // Helper: call a boilerplate helper function (motor, move_to, led_on, …)
  function pyHelper(block, helperName, args) {
    const c = block.getFieldValue('CUBE');
    if (c === 'ALL') {
      return `for _c in cubes:\n    await ${helperName}(_c, ${args})\n`;
    }
    return `await ${helperName}(cubes[${c}], ${args})\n`;
  }

  // ── Motion ──────────────────────────────────────────────────────────────────

  G['toio_move'] = function(block) {
    const dir   = block.getFieldValue('DIRECTION');
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '50';
    const dur   = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '1';
    const [l, r] = dir === 'FORWARD' ? [speed, speed] : [`-(${speed})`, `-(${speed})`];
    return pyHelper(block, 'motor', `${l}, ${r}, ${dur}`);
  };

  G['toio_turn'] = function(block) {
    const dir   = block.getFieldValue('DIRECTION');
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '50';
    const dur   = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '1';
    const [l, r] = dir === 'LEFT' ? [`-(${speed})`, speed] : [speed, `-(${speed})`];
    return pyHelper(block, 'motor', `${l}, ${r}, ${dur}`);
  };

  G['toio_move_raw'] = function(block) {
    const l   = G.valueToCode(block, 'LEFT',     G.ORDER_ATOMIC) || '0';
    const r   = G.valueToCode(block, 'RIGHT',    G.ORDER_ATOMIC) || '0';
    const dur = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '0';
    return pyHelper(block, 'motor', `${l}, ${r}, ${dur}`);
  };

  G['toio_move_to'] = function(block) {
    const x     = G.valueToCode(block, 'X',     G.ORDER_ATOMIC) || '250';
    const y     = G.valueToCode(block, 'Y',     G.ORDER_ATOMIC) || '250';
    const angle = G.valueToCode(block, 'ANGLE', G.ORDER_ATOMIC) || '0';
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '80';
    return pyHelper(block, 'move_to', `${x}, ${y}, ${angle}, ${speed}`);
  };

  G['toio_move_to_xy'] = function(block) {
    const x     = G.valueToCode(block, 'X',     G.ORDER_ATOMIC) || '200';
    const y     = G.valueToCode(block, 'Y',     G.ORDER_ATOMIC) || '200';
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '80';
    return pyHelper(block, 'move_to', `${x}, ${y}, speed=${speed}`);
  };

  G['toio_rotate_to'] = function(block) {
    const angle = G.valueToCode(block, 'ANGLE', G.ORDER_ATOMIC) || '0';
    const c = block.getFieldValue('CUBE');
    if (c === 'ALL') {
      return `for _c in cubes:\n    _x, _y, _ = await get_pos(_c)\n    if _x is not None: await move_to(_c, _x, _y, ${angle})\n`;
    }
    return `_x, _y, _ = await get_pos(cubes[${c}])\nif _x is not None: await move_to(cubes[${c}], _x, _y, ${angle})\n`;
  };

  G['toio_move_rel'] = function(block) {
    const dir   = block.getFieldValue('DIRECTION');
    const dist  = G.valueToCode(block, 'DIST',  G.ORDER_ATOMIC) || '50';
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '60';
    const d = dir === 'FORWARD' ? dist : `-(${dist})`;
    return pyHelper(block, 'move_rel', `${d}, ${speed}`);
  };

  G['toio_rotate_rel'] = function(block) {
    const dir   = block.getFieldValue('DIRECTION');
    const angle = G.valueToCode(block, 'ANGLE', G.ORDER_ATOMIC) || '90';
    const speed = G.valueToCode(block, 'SPEED', G.ORDER_ATOMIC) || '60';
    const da = dir === 'RIGHT' ? angle : `-(${angle})`;
    return pyHelper(block, 'rotate_rel', `${da}, ${speed}`);
  };

  G['toio_stop'] = function(block) {
    return pyCall(block, 'api.motor.motor_control(left=0, right=0, duration_ms=0)');
  };

  // ── LED ─────────────────────────────────────────────────────────────────────

  G['toio_led'] = function(block) {
    const r   = G.valueToCode(block, 'R', G.ORDER_ATOMIC) || '0';
    const g   = G.valueToCode(block, 'G', G.ORDER_ATOMIC) || '0';
    const b   = G.valueToCode(block, 'B', G.ORDER_ATOMIC) || '0';
    const dur = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '0';
    return pyHelper(block, 'led_on', `${r}, ${g}, ${b}, ${dur}`);
  };

  G['toio_led_color'] = function(block) {
    const key = block.getFieldValue('COLOR');
    const dur = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '0';
    if (key === 'OFF') return pyCall(block, 'api.indicator.turn_off()');
    const [r, g, b] = COLOR_MAP[key] || [0, 0, 0];
    return pyHelper(block, 'led_on', `${r}, ${g}, ${b}, ${dur}`);
  };

  G['toio_led_off'] = function(block) {
    return pyCall(block, 'api.indicator.turn_off()');
  };

  // ── Sound ────────────────────────────────────────────────────────────────────

  G['toio_sound_effect'] = function(block) {
    const id = block.getFieldValue('EFFECT');
    return pyCall(block, `api.sound.play_sound_effect(sound_id=${id}, volume=255)`);
  };

  G['toio_play_note'] = function(block) {
    const note = block.getFieldValue('NOTE');
    const dur  = G.valueToCode(block, 'DURATION', G.ORDER_ATOMIC) || '1';
    return pyCall(block, `api.sound.play_midi(repeat=0, midi_notes=[MidiNote(duration_ms=int(${dur} * 1000), note=Note(${note}), volume=255)])`);
  };

  G['toio_stop_sound'] = function(block) {
    return pyCall(block, 'api.sound.stop()');
  };

  // ── Control ──────────────────────────────────────────────────────────────────

  G['toio_wait'] = function(block) {
    const sec = G.valueToCode(block, 'SECONDS', G.ORDER_ATOMIC) || '1';
    return `await asyncio.sleep(${sec})\n`;
  };

  G['toio_wait_button'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return `await wait_for_button(cubes[${idx}])\n`;
  };

  G['toio_run_action'] = function(block) {
    const slot = block.getFieldValue('SLOT');
    return `# play_action(${slot}) — not directly available in toio.py\npass\n`;
  };

  G['toio_on_start'] = function(block) {
    const body = G.statementToCode(block, 'DO');
    return `async def _on_start():\n${body || '    pass\n'}asyncio.create_task(_on_start())\n`;
  };

  G['toio_on_button'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    const body = G.statementToCode(block, 'DO');
    return `async def _on_button${idx}():\n    await wait_for_button(cubes[${idx}])\n${body || '    pass\n'}asyncio.create_task(_on_button${idx}())\n`;
  };

  // ── Sensors ──────────────────────────────────────────────────────────────────

  G['toio_is_button'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`cubes[${idx}].api.button.is_pressed`, G.ORDER_ATOMIC];
  };

  G['toio_is_horizontal'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`(await cubes[${idx}].api.sensor.read()).is_level`, G.ORDER_ATOMIC];
  };

  G['toio_battery'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`(await cubes[${idx}].api.battery.read()).battery_level`, G.ORDER_ATOMIC];
  };

  G['toio_position_x'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`(await get_pos(cubes[${idx}]))[0]`, G.ORDER_ATOMIC];
  };

  G['toio_position_y'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`(await get_pos(cubes[${idx}]))[1]`, G.ORDER_ATOMIC];
  };

  G['toio_position_angle'] = function(block) {
    const cube = block.getFieldValue('CUBE');
    const idx  = cube === 'ALL' ? '0' : cube;
    return [`(await get_pos(cubes[${idx}]))[2]`, G.ORDER_ATOMIC];
  };

  // ── Output ───────────────────────────────────────────────────────────────────

  G['toio_print'] = function(block) {
    const text = G.valueToCode(block, 'TEXT', G.ORDER_ATOMIC) || '""';
    return `print(${text})\n`;
  };
}

// ─── Python output (toio.py API) ─────────────────────────────────────────────
// wrapPython  → main.py content (shown in code panel & saved as main.py in ZIP)
// buildPythonHelpers → toio_helpers.py (saved in ZIP, not shown in panel)
// buildPythonReadme  → README.txt     (saved in ZIP)
// Download as ZIP via JSZip (loaded in index.html).

function wrapPython(body) {
  // Indent user code: inside `async with cubes[0]:` = 12 spaces
  const indented = body
    .split('\n')
    .map(l => '            ' + l)
    .join('\n')
    .trimEnd();
  return `# main.py — Code Maker for toio™ で生成 / generated by Code Maker for toio™
# ⚠ このアプリでは JavaScript が実行されます。Python 実行には pip install toio-py が必要です。
# ⚠ Execution in this app uses JavaScript. To run as Python: pip install toio-py
# Helper functions → toio_helpers.py

import asyncio
from toio import *
from toio_helpers import (
    motor, move_to, led_on, get_pos,
    wait_for_button, move_rel, rotate_rel,
)


async def main():
    async with BLEScanner.scan(1) as found:
        if not found:
            print("toioが見つかりません / No toio found")
            return
        # 複数キューブの場合: cubes = [Cube(f.interface) for f in found]
        cubes = [Cube(found[0].interface)]
        async with cubes[0]:
${indented}


asyncio.run(main())
`;
}

// ─── toio_helpers.py ─────────────────────────────────────────────────────────
function buildPythonHelpers() {
  return `# toio_helpers.py — Code Maker for toio™ helper functions
# https://akichika.github.io/code-maker-for-toio/
# Requires: pip install toio-py  (Python 3.10+)

import asyncio
import math
from toio import *


async def motor(cube, left, right, duration_sec=0):
    """モーター制御 / Motor control.
    left, right: -115..115  |  duration_sec: 0 = indefinite"""
    await cube.api.motor.motor_control(
        left=int(left), right=int(right),
        duration_ms=int(duration_sec * 1000),
    )
    if duration_sec > 0:
        await asyncio.sleep(duration_sec)


async def move_to(cube, x, y, angle=0, speed=80):
    """マット座標 (x, y) へ移動し angle 方向を向く / Move to mat coordinate."""
    await cube.api.motor.motor_control_target(
        timeout=10,
        movement_type=MovementType.Linear,
        speed=Speed(max=int(speed), speed_change_type=SpeedChangeType.Constant),
        target=TargetPosition(
            cube_location=CubeLocation(
                point=Point(x=int(x), y=int(y)),
                angle=int(angle),
            ),
            rotation_option=RotationOption.AbsoluteOptimal,
        ),
    )


async def led_on(cube, r, g, b, duration_sec=0):
    """LED を RGB で点灯 / Light LED with RGB color.
    duration_sec=0: 消えるまで点灯 / stays on until turned off"""
    await cube.api.indicator.turn_on(
        IndicatorParam(
            duration_ms=int(duration_sec * 1000),
            color=Color(r=int(r), g=int(g), b=int(b)),
        )
    )
    if duration_sec > 0:
        await asyncio.sleep(duration_sec)


async def get_pos(cube):
    """現在の座標と角度を返す / Return (x, y, angle), or (None, None, None) if off mat."""
    info = await cube.api.id_information.read()
    if info and hasattr(info, 'center'):
        return info.center.point.x, info.center.point.y, info.center.angle
    return None, None, None


async def wait_for_button(cube):
    """ボタンが押されるまで待つ / Block until the cube button is pressed."""
    while True:
        btn = await cube.api.button.read()
        if btn and btn.is_pressed:
            return
        await asyncio.sleep(0.05)


async def move_rel(cube, distance, speed=60):
    """現在向きを基準に前進(+)/後退(-) / Move relative to current heading (mat units)."""
    x, y, angle = await get_pos(cube)
    if x is None:
        return
    rad = math.radians(angle - 90)
    await move_to(cube,
                  x + math.cos(rad) * distance,
                  y + math.sin(rad) * distance,
                  angle, speed)


async def rotate_rel(cube, delta_angle, speed=60):
    """現在の向きから delta_angle 度回転 (+= 時計回り) / Rotate relative to current heading."""
    x, y, angle = await get_pos(cube)
    if x is None:
        return
    await move_to(cube, x, y, (angle + delta_angle) % 360, speed)
`;
}

// ─── README.txt ──────────────────────────────────────────────────────────────
function buildPythonReadme() {
  return `Code Maker for toio™ — Python Export
======================================
https://akichika.github.io/code-maker-for-toio/

Files in this ZIP
-----------------
  main.py         — Your program  (edit this)
  toio_helpers.py — Helper functions  (don't edit)
  README.txt      — This file

Requirements
------------
  Python 3.10 or later
  toio-py library:

    pip install toio-py

  Bluetooth adapter (Windows / macOS / Linux)
  toio core cube (power it on before running)

Run
---
  python main.py

Multiple cubes
--------------
  Change  BLEScanner.scan(1)  to  BLEScanner.scan(N)
  and use  cubes[0], cubes[1], ...  to address each cube.

Notes
-----
  toio™ is a trademark of Sony Interactive Entertainment Inc.
  This is an unofficial fan-made tool, unaffiliated with SIE.
  toio-py: https://github.com/toio/toio.py
`;
}

window.initJSGenerators     = initJSGenerators;
window.initPythonGenerators = initPythonGenerators;
window.wrapPython           = wrapPython;
window.buildPythonHelpers   = buildPythonHelpers;
window.buildPythonReadme    = buildPythonReadme;
window.COLOR_MAP            = COLOR_MAP;
