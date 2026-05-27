/* blocks.js — Custom Blockly block definitions for toio
   All UI strings come from i18n.js (t() helper).
   Block colours use flat hex values aligned with CSS palette. */

// ─── Colour presets (shared with generators) ─────────────────────────────────
const COLOR_MAP = {
  RED:    [255, 0,   0  ],
  GREEN:  [0,   255, 0  ],
  BLUE:   [0,   0,   255],
  WHITE:  [255, 255, 255],
  YELLOW: [255, 255, 0  ],
  CYAN:   [0,   255, 255],
  PINK:   [255, 20,  147],
  OFF:    [0,   0,   0  ],
};

// ─── Block colour palette (bright, flat, toio-themed) ────────────────────────
const BC = {
  MOTION:  '#4C97FF',  // Scratch blue
  LED:     '#9966FF',  // Scratch purple / toio
  SOUND:   '#59C059',  // Scratch green
  CTRL:    '#FFAB19',  // Scratch orange
  SENSOR:  '#FF6680',  // pink-red
  OUT:     '#5CB1D6',  // teal-blue
};

// ─── Cube selector dropdown ───────────────────────────────────────────────────
// Called as a function so t() values are resolved at define-time (after i18n loads)
function cubeDropdown() {
  return [
    [t('ui.cubeAll'), 'ALL'],
    [t('ui.cube1'),   '0'],
    [t('ui.cube2'),   '1'],
    [t('ui.cube3'),   '2'],
    [t('ui.cube4'),   '3'],
  ];
}

// ─── Block definitions ────────────────────────────────────────────────────────
function initBlocks() {
  const CD = cubeDropdown();

  Blockly.defineBlocksWithJsonArray([

    // ── MOTION ────────────────────────────────────────────────────────────────
    {
      type: 'toio_move',
      message0: t('block.moveDir'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'field_dropdown', name: 'DIRECTION',
          options: [[t('block.forward'), 'FORWARD'], [t('block.backward'), 'BACKWARD']] },
        { type: 'input_value', name: 'SPEED',    check: 'Number' },
        { type: 'input_value', name: 'DURATION', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.MOTION,
      tooltip: t('tip.move'),
    },
    {
      type: 'toio_turn',
      message0: t('block.turnDir'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'field_dropdown', name: 'DIRECTION',
          options: [[t('block.left'), 'LEFT'], [t('block.right'), 'RIGHT']] },
        { type: 'input_value', name: 'SPEED',    check: 'Number' },
        { type: 'input_value', name: 'DURATION', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.MOTION,
      tooltip: t('tip.turn'),
    },
    {
      type: 'toio_move_raw',
      message0: t('block.moveRaw'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'input_value', name: 'LEFT',     check: 'Number' },
        { type: 'input_value', name: 'RIGHT',    check: 'Number' },
        { type: 'input_value', name: 'DURATION', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.MOTION,
      tooltip: t('tip.moveRaw'),
    },
    {
      type: 'toio_move_to',
      message0: t('block.moveTo'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE',  options: CD },
        { type: 'input_value',    name: 'X',     check: 'Number' },
        { type: 'input_value',    name: 'Y',     check: 'Number' },
        { type: 'input_value',    name: 'ANGLE', check: 'Number' },
        { type: 'input_value',    name: 'SPEED', check: 'Number' },
        { type: 'field_dropdown', name: 'MODE',
          options: [
            [t('block.modeNormal'),   'NORMAL'],
            [t('block.modeBack'),     'BACKWARD'],
            [t('block.modeRotFirst'), 'ROT_FIRST'],
          ]},
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.MOTION,
      tooltip: t('tip.moveTo'),
    },
    {
      type: 'toio_move_to_xy',
      message0: t('block.moveToXY'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE',  options: CD },
        { type: 'input_value',    name: 'X',     check: 'Number' },
        { type: 'input_value',    name: 'Y',     check: 'Number' },
        { type: 'input_value',    name: 'SPEED', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.MOTION,
      tooltip: t('tip.moveToXY'),
    },
    {
      type: 'toio_rotate_to',
      message0: t('block.rotateTo'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE',  options: CD },
        { type: 'input_value',    name: 'ANGLE', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.MOTION,
      tooltip: t('tip.rotateTo'),
    },
    {
      type: 'toio_move_rel',
      message0: t('block.moveRel'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'field_dropdown', name: 'DIRECTION',
          options: [[t('block.forward'), 'FORWARD'], [t('block.backward'), 'BACKWARD']] },
        { type: 'input_value', name: 'DIST',  check: 'Number' },
        { type: 'input_value', name: 'SPEED', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.MOTION,
      tooltip: t('tip.moveRel'),
    },
    {
      type: 'toio_rotate_rel',
      message0: t('block.rotateRel'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'field_dropdown', name: 'DIRECTION',
          options: [[t('block.right'), 'RIGHT'], [t('block.left'), 'LEFT']] },
        { type: 'input_value', name: 'ANGLE', check: 'Number' },
        { type: 'input_value', name: 'SPEED', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.MOTION,
      tooltip: t('tip.rotateRel'),
    },
    {
      type: 'toio_stop',
      message0: t('block.stop'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.MOTION,
      tooltip: t('tip.stop'),
    },

    // ── LED ───────────────────────────────────────────────────────────────────
    {
      type: 'toio_led',
      message0: t('block.setLED'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'input_value', name: 'R', check: 'Number' },
        { type: 'input_value', name: 'G', check: 'Number' },
        { type: 'input_value', name: 'B', check: 'Number' },
        { type: 'input_value', name: 'DURATION', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.LED,
      tooltip: t('tip.led'),
    },
    {
      type: 'toio_led_color',
      message0: t('block.ledColor'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'field_dropdown', name: 'COLOR',
          options: [
            [t('color.red'),    'RED'],
            [t('color.green'),  'GREEN'],
            [t('color.blue'),   'BLUE'],
            [t('color.white'),  'WHITE'],
            [t('color.yellow'), 'YELLOW'],
            [t('color.cyan'),   'CYAN'],
            [t('color.pink'),   'PINK'],
            [t('color.off'),    'OFF'],
          ]},
        { type: 'input_value', name: 'DURATION', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.LED,
      tooltip: t('tip.ledColor'),
    },
    {
      type: 'toio_led_off',
      message0: t('block.ledOff'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.LED,
      tooltip: t('tip.ledOff'),
    },

    // ── SOUND ─────────────────────────────────────────────────────────────────
    {
      type: 'toio_sound_effect',
      message0: t('block.playEffect'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'field_dropdown', name: 'EFFECT',
          options: [
            ['Entry',  '0'],
            ['Select', '1'],
            ['Cancel', '2'],
            ['Cursor', '3'],
            ['Mat',    '4'],
            ['Item',   '5'],
            ['Score',  '6'],
            ['Error',  '7'],
          ]},
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.SOUND,
      tooltip: t('tip.effect'),
    },
    {
      type: 'toio_play_note',
      message0: t('block.playNote'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'field_dropdown', name: 'NOTE',
          options: [
            ['C4 (ド)',  '60'], ['D4 (レ)',  '62'], ['E4 (ミ)',  '64'],
            ['F4 (ファ)','65'], ['G4 (ソ)',  '67'], ['A4 (ラ)',  '69'],
            ['B4 (シ)',  '71'], ['C5 (高ド)','72'], ['D5 (高レ)','74'],
            ['E5 (高ミ)','76'],
          ]},
        { type: 'input_value', name: 'DURATION', check: 'Number' },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.SOUND,
      tooltip: t('tip.note'),
    },
    {
      type: 'toio_stop_sound',
      message0: t('block.stopSound'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.SOUND,
      tooltip: t('tip.stopSound'),
    },

    // ── CONTROL ───────────────────────────────────────────────────────────────
    {
      type: 'toio_wait',
      message0: t('block.wait'),
      args0: [{ type: 'input_value', name: 'SECONDS', check: 'Number' }],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.CTRL,
      tooltip: t('tip.wait'),
    },
    {
      type: 'toio_wait_button',
      message0: t('block.waitBtn'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.CTRL,
      tooltip: t('tip.waitBtn'),
    },
    {
      type: 'toio_run_action',
      message0: t('block.runAction'),
      args0: [
        { type: 'field_dropdown', name: 'CUBE', options: CD },
        { type: 'field_dropdown', name: 'SLOT',
          options: [['Action 1', '1'], ['Action 2', '2']] },
      ],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.CTRL,
      tooltip: t('tip.runAction'),
    },

    // ── SENSING ───────────────────────────────────────────────────────────────
    {
      type: 'toio_on_start',
      message0: t('block.onStart'),
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      colour: BC.CTRL,
      hat: 'cap',
      tooltip: t('tip.onStart'),
    },
    {
      type: 'toio_on_button',
      message0: t('block.onButton'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      style: 'sensor_blocks',
      hat: 'cap',
      tooltip: t('tip.onButton'),
    },
    {
      type: 'toio_is_button',
      message0: t('block.isBtn'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      output: 'Boolean',
      colour: BC.SENSOR,
      tooltip: t('tip.isBtn'),
    },
    {
      type: 'toio_is_horizontal',
      message0: t('block.isHoriz'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      output: 'Boolean',
      colour: BC.SENSOR,
      tooltip: t('tip.isHoriz'),
    },
    {
      type: 'toio_battery',
      message0: t('block.battery'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      output: 'Number',
      colour: BC.SENSOR,
      tooltip: t('tip.battery'),
    },
    {
      type: 'toio_position_x',
      message0: t('block.posX'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      output: 'Number',
      colour: BC.SENSOR,
      tooltip: t('tip.posX'),
    },
    {
      type: 'toio_position_y',
      message0: t('block.posY'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      output: 'Number',
      colour: BC.SENSOR,
      tooltip: t('tip.posY'),
    },
    {
      type: 'toio_position_angle',
      message0: t('block.angle'),
      args0: [{ type: 'field_dropdown', name: 'CUBE', options: CD }],
      output: 'Number',
      colour: BC.SENSOR,
      tooltip: t('tip.angle'),
    },

    // ── OUTPUT ────────────────────────────────────────────────────────────────
    {
      type: 'toio_print',
      message0: t('block.print'),
      args0: [{ type: 'input_value', name: 'TEXT' }],
      inputsInline: true,
      previousStatement: null, nextStatement: null,
      colour: BC.OUT,
      tooltip: t('tip.print'),
    },
  ]);
}

// Export for use in app.js toolbox builder and generators.js
window.initBlocks  = initBlocks;
window.COLOR_MAP   = COLOR_MAP;
window.BC          = BC;
window.cubeDropdown = cubeDropdown;
