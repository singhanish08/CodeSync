// Verifies the Share popover placement against a matrix of realistic room
// layouts. Run with:  node popover-placement.test.mjs
//
// Node 24 strips TS types, so this imports the module the component uses.

import {
  computePopoverPlacement,
  popoverRightEdge,
  POPOVER_GAP,
  POPOVER_WIDTH,
  VIEWPORT_MARGIN,
} from './src/lib/popoverGeometry.ts';

let failures = 0;
let assertions = 0;

const check = (name, condition, detail) => {
  assertions += 1;
  if (!condition) {
    failures += 1;
    console.log(`  ✗ ${name}  ${detail ?? ''}`);
  }
};

const HEADER = 56; // h-14
const BUTTON_H = 32; // h-8

/**
 * Approximates the real room toolbar geometry at a given viewport width.
 * Right cluster: [Share] [History 32] [ConnectionPill ~90] [AI toggle 32]
 * [ThemeToggle 32], padded 16px from the right edge. The Share button sits
 * just left of that group, so its right edge is ~202px from the viewport edge.
 */
const shareButtonRect = (viewportWidth) => {
  const groupWidth = 32 + 90 + 32 + 32 + 8 * 4; // ~218 with gaps
  const right = viewportWidth - 16 - groupWidth;
  return { top: (HEADER - BUTTON_H) / 2, bottom: (HEADER + BUTTON_H) / 2, left: right - 52, right };
};

const cases = [
  // [label, viewportWidth, panelSplit (null = closed)]
  ['desktop 1440, panel open default 38%', 1440, 0.38],
  ['desktop 1440, panel dragged to max 52%', 1440, 0.52],
  ['desktop 1440, panel dragged to min 26%', 1440, 0.26],
  ['desktop 1440, panel closed', 1440, null],
  ['laptop 1280, panel open 38%', 1280, 0.38],
  ['laptop 1024 (lg breakpoint), panel 45%', 1024, 0.45],
  ['narrow desktop 900, panel max 52%', 900, 0.52],
  ['tablet 800 (below lg, panel full-width)', 800, 1.0],
  ['mobile 390, panel closed', 390, null],
  ['tiny mobile 320, panel closed', 320, null],
];

console.log('Share popover placement — geometry verification\n');

for (const [label, vw, split] of cases) {
  const rect = shareButtonRect(vw);
  // panel size is expressed as a FRACTION OF THE WIDTH; its left edge is (1 - fraction) * vw.
  const panelLeft = split === null ? null : Math.round(vw * (1 - split));
  const p = computePopoverPlacement(rect, panelLeft, vw);
  const right = popoverRightEdge(p);

  console.log(`\n• ${label}`);
  console.log(`    viewport=${vw}  buttonRight=${Math.round(rect.right)}  panelLeft=${panelLeft}`);
  console.log(`    → top=${Math.round(p.top)} left=${Math.round(p.left)} width=${Math.round(p.width)} right=${Math.round(right)}`);

  // 1. Anchored directly below the button.
  check('top == button bottom + gap', p.top === rect.bottom + POPOVER_GAP, `got ${p.top}, want ${rect.bottom + POPOVER_GAP}`);

  // 2. Never right of the button.
  check('right edge <= button right', right <= rect.right + 0.001, `${right} > ${rect.right}`);

  // 3. Never right of the viewport margin.
  check('right edge <= viewport - margin', right <= vw - VIEWPORT_MARGIN + 0.001, `${right} > ${vw - VIEWPORT_MARGIN}`);

  // 4. Never left of the viewport margin.
  check('left >= viewport margin', p.left >= VIEWPORT_MARGIN - 0.001, `${p.left} < ${VIEWPORT_MARGIN}`);

  // 5. Never crosses into a side-by-side AI panel.
  if (panelLeft !== null && panelLeft >= vw * 0.3) {
    check('right edge < panel left edge', right <= panelLeft - POPOVER_GAP + 0.001, `${right} overlaps panel at ${panelLeft}`);
  }

  // 6. Width is the full popper width unless clamped, and never negative.
  check('width <= POPOVER_WIDTH', p.width <= POPOVER_WIDTH + 0.001, `${p.width}`);
  check('width > 0', p.width > 0, `${p.width}`);
}

// Explicit before/after comparison at the reference layout (1440, panel 38%).
console.log('\n\nBefore/after @ 1440×900, AI panel open at 38% (left edge = 893):');
const rect = shareButtonRect(1440);
const after = computePopoverPlacement(rect, 893, 1440);
console.log(`  BEFORE (CSS absolute, right-0 top-full): right edge = button right = ${Math.round(rect.right)},`);
console.log(`        covering AI panel horizontally by ${Math.round(rect.right) - 893}px`);
console.log(`  AFTER  (portal + rect clamp):            left=${Math.round(after.left)} right=${Math.round(popoverRightEdge(after))},`);
console.log(`        clears the panel by ${893 - Math.round(popoverRightEdge(after))}px`);

console.log(`\n${assertions} assertions, ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
