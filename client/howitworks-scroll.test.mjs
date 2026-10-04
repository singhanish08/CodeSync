// How-it-works scroll section (Issue 4) — numeric model of the trigger logic.
// Run from the client dir:  node howitworks-scroll.test.mjs
//
// The section picks the active step by finding which step's text block is
// nearest a focus line at 35% of the viewport height, and the illustration
// only re-renders while framer-motion's `scrollYProgress` is actually CHANGING
// (useMotionValueEvent('change')). If the scroll range ends before the last
// steps reach the focus line, progress clamps at 1 and the illustration freezes.
//
// This model replays the exact geometry: container top T and height C moving up
// through a viewport of height H, five evenly spaced steps, and the two offset
// configurations, and asks "can each of the 5 steps ever become active while an
// event would still fire?"

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};

const FOCUS_RATIO = 0.35;
const STEPS = 5;

/** Mirrors updateActiveStep: nearest [data-step] block to the focus line. */
const activeStepAt = (containerTop, containerHeight, viewportHeight) => {
  const focusLine = viewportHeight * FOCUS_RATIO;
  const stepHeight = containerHeight / STEPS;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < STEPS; index += 1) {
    const top = containerTop + index * stepHeight;
    const distance = Math.abs(top - focusLine);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
};

/**
 * framer-motion useScroll offset semantics: progress 0 when the container's
 * start edge hits the first viewport marker, 1 when its end edge hits the
 * second. Returns the open interval of container-top positions over which
 * progress is strictly inside (0, 1) — the only range where 'change' fires.
 */
const firingRange = (offset, containerHeight, viewportHeight) => {
  // The second token is the VIEWPORT marker: a named edge or an explicit %.
  const marker = (label) => {
    const part = label.split(' ')[1];
    if (part === 'start') return 0;
    if (part === 'center') return viewportHeight / 2;
    if (part === 'end') return viewportHeight;
    return (parseFloat(part) / 100) * viewportHeight;
  };
  const zeroAt = marker(offset[0]); // container top at this viewport y → progress 0
  const oneAt = marker(offset[1]); // container BOTTOM at this viewport y → progress 1
  const startTop = oneAt - containerHeight; // container top when progress hits 1
  // progress decreases as the container scrolls up (containerTop decreases).
  return [startTop, zeroAt];
};

const OLD_OFFSET = ['start 20%', 'end 70%'];
const NEW_OFFSET = ['start end', 'end start'];

// Realistic geometry: a tall-ish viewport and a step list taller than the art
// panel (the section height is driven by the list).
const VIEWPORTS = [700, 800, 900, 1080];
const CONTAINER_HEIGHTS = [560, 620, 700, 820];

for (const H of VIEWPORTS) {
  for (const C of CONTAINER_HEIGHTS) {
    console.log(`\n— viewport ${H}px, step list ${C}px —`);

    for (const [label, offset] of [
      ['old offset [start 20%, end 70%]', OLD_OFFSET],
      ['new offset [start end, end start]', NEW_OFFSET],
    ]) {
      const [lo, hi] = firingRange(offset, C, H);
      // Scan the whole traversal plus a margin, sampling every 2px.
      const activated = new Set();
      for (let top = H; top >= -C; top -= 2) {
        // An event only arrives where progress is strictly changing.
        if (top > lo && top < hi) {
          activated.add(activeStepAt(top, C, H));
        }
      }
      const reached = [...activated].sort((a, b) => a - b);
      console.log(`  ${label}: events fire for container-top (${lo.toFixed(0)}, ${hi.toFixed(0)}); steps reached: [${reached.map((i) => i + 1).join(', ')}]`);
      if (offset === OLD_OFFSET) {
        check(`${H}/${C}: OLD offset cannot reach all five steps`, reached.length < STEPS, `reached [${reached.map((i) => i + 1).join(', ')}]`);
      } else {
        check(`${H}/${C}: NEW offset reaches all five steps`, reached.length === STEPS, `reached [${reached.map((i) => i + 1).join(', ')}]`);
      }
    }
  }
}

console.log('\n— every one of the five illustrations is reachable, in order —');
{
  const H = 800;
  const C = 620;
  const [lo, hi] = firingRange(NEW_OFFSET, C, H);
  const sequence = [];
  for (let top = hi; top >= lo; top -= 1) {
    const step = activeStepAt(top, C, H);
    if (sequence[sequence.length - 1] !== step) sequence.push(step);
  }
  console.log(`  activation order while scrolling down: [${sequence.join(' → ')}]`);
  check('activates 1→2→3→4→5 in order', sequence.join(',') === '0,1,2,3,4', `got [${sequence.join(',')}]`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECKS FAILED\n`);
process.exit(failures > 0 ? 1 : 0);
