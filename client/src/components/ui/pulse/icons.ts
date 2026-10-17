// The four icons the loader morphs between, plus the stage table that drives it.
//
// Every icon is drawn from the same seven slots, in the same order, so MorphSVGPlugin has a target for
// every source. The slots are:
//
//   0  structure, left or top         4  the pulse motif
//   1  structure, right or bottom     5  the ring
//   2  detail row one                 6  the dot
//   3  detail row two
//
// The pulse motif is in all four icons and the ring and dot are in all four, which is what makes a morph
// read as one drawing changing its mind rather than two unrelated drawings swapping places. Everything
// is line art on one 160 by 60 grid: no fills, round caps, round joins.

export type IconName = 'server' | 'shield' | 'calendar' | 'pulse';

export type StageId = 'wake' | 'session' | 'schedule' | 'live' | 'stalled';

export type Stage = {
  id: StageId;
  title: string;
  sub: string;
  accent: string;
  icon: IconName;
};

export const PATHS_PER_ICON = 7;

const round = (value: number) => Math.round(value * 100) / 100;

// A rounded rectangle outline, clockwise from its top left corner
function box(x: number, y: number, width: number, height: number, radius: number) {
  const right = x + width;
  const bottom = y + height;

  return (
    `M${x + radius} ${y} H${right - radius} A${radius} ${radius} 0 0 1 ${right} ${y + radius}` +
    ` V${bottom - radius} A${radius} ${radius} 0 0 1 ${right - radius} ${bottom}` +
    ` H${x + radius} A${radius} ${radius} 0 0 1 ${x} ${bottom - radius}` +
    ` V${y + radius} A${radius} ${radius} 0 0 1 ${x + radius} ${y} Z`
  );
}

// A circle as two arcs. Used for the dot, which is a real path so it can morph like everything else
function circle(cx: number, cy: number, r: number) {
  return `M${round(cx - r)} ${round(cy)} a${r} ${r} 0 1 0 ${round(r * 2)} 0 a${r} ${r} 0 1 0 ${round(-r * 2)} 0`;
}

// A ring with a gap, so turning the group it lives in is visible as movement rather than as nothing
function ring(cx: number, cy: number, r: number, sweep = 0.84) {
  const start = (-70 * Math.PI) / 180;
  const end = start + sweep * Math.PI * 2;
  const x1 = round(cx + r * Math.cos(start));
  const y1 = round(cy + r * Math.sin(start));
  const x2 = round(cx + r * Math.cos(end));
  const y2 = round(cy + r * Math.sin(end));

  return `M${x1} ${y1} A${r} ${r} 0 ${sweep > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
}

// One row of short marks: the led lights on the server, the grid inside the calendar
function dashRow(y: number, spans: readonly (readonly [number, number])[]) {
  return spans.map(([from, to]) => `M${from} ${y} H${to}`).join(' ');
}

// A heartbeat across a box: flat, small blip, dip, tall spike, deep dip, recovery, flat. The proportions
// are fixed and only the box changes, so the waveform keeps its identity at every size.
function pulse(x: number, base: number, width: number, amplitude: number) {
  const at = (fraction: number) => round(x + width * fraction);
  const y = (fraction: number) => round(base - amplitude * fraction);

  return [
    `M${round(x)} ${base}`,
    `H${at(0.3)}`,
    `L${at(0.36)} ${y(-0.4)}`,
    `L${at(0.42)} ${y(0.5)}`,
    `L${at(0.5)} ${y(1)}`,
    `L${at(0.58)} ${y(-0.7)}`,
    `L${at(0.64)} ${y(0.15)}`,
    `L${at(0.68)} ${base}`,
    `H${round(x + width)}`,
  ].join(' ');
}

export const ICONS: Record<IconName, readonly string[]> = {
  // two stacked units with a heartbeat running between them
  server: [
    box(22, 2, 100, 16, 5),
    box(22, 42, 100, 16, 5),
    dashRow(10, [
      [36, 46],
      [54, 64],
      [72, 82],
    ]),
    dashRow(50, [
      [36, 46],
      [54, 64],
      [72, 82],
    ]),
    pulse(70, 30, 44, 10),
    ring(132, 30, 4.6),
    circle(132, 30, 1.3),
  ],

  // a shield with a check, and the heartbeat keeping time underneath it
  shield: [
    'M80 3 H50 A7 7 0 0 0 43 10 V28 C43 40 58 48 80 55',
    'M80 3 H110 A7 7 0 0 1 117 10 V28 C117 40 102 48 80 55',
    'M58 22 L70 33 L100 8',
    'M52 34 H64',
    // kept inside the taper: the shield narrows towards its point, so the beat is short and low
    pulse(62, 46, 36, 5),
    ring(132, 30, 4.6),
    circle(132, 30, 1.3),
  ],

  // a month at a glance: two binder tabs, a header rule, a six cell grid and the pulse along the foot
  calendar: [
    'M72 10 H37 A7 7 0 0 0 30 17 V49 A7 7 0 0 0 37 56 H72 M30 24 H72 M46 2 V14',
    'M72 10 H107 A7 7 0 0 1 114 17 V49 A7 7 0 0 1 107 56 H72 M72 24 H114 M98 2 V14',
    dashRow(32, [
      [42, 54],
      [68, 80],
      [94, 106],
    ]),
    dashRow(41, [
      [42, 54],
      [68, 80],
      [94, 106],
    ]),
    pulse(50, 51, 44, 4),
    ring(132, 30, 4.6),
    circle(132, 30, 1.3),
  ],

  // the resting state: a bare line with the beat on it and the ring around the middle
  pulse: [
    'M22 30 H52',
    'M108 30 H138',
    'M52 30 H64',
    'M96 30 H108',
    pulse(56, 30, 48, 16),
    ring(80, 30, 15),
    circle(80, 30, 2),
  ],
};

// Where the ring sits in each icon, which is the point it turns around
export const RING_CENTRE: Record<IconName, readonly [number, number]> = {
  server: [132, 30],
  shield: [132, 30],
  calendar: [132, 30],
  pulse: [80, 30],
};

// The four real startup stages, in the order they can complete
export const STAGES: readonly Stage[] = [
  {
    id: 'wake',
    title: 'Waking the clinic server',
    sub: 'A cold start can take up to a minute',
    accent: '#4F52B2',
    icon: 'server',
  },
  {
    id: 'session',
    title: 'Restoring your session',
    sub: 'Checking your sign in',
    accent: '#6C4FD0',
    icon: 'shield',
  },
  {
    id: 'schedule',
    title: "Opening today's schedule",
    sub: 'Loading your appointments',
    accent: '#3E7FC4',
    icon: 'calendar',
  },
  {
    id: 'live',
    title: 'Connecting live updates',
    sub: 'Almost there',
    accent: '#2FA38A',
    icon: 'pulse',
  },
];

// Shown only when the wake signal never arrives inside the timeout
export const STALLED_STAGE: Stage = {
  id: 'stalled',
  title: 'Taking longer than usual',
  sub: 'The server is still starting. You can keep waiting or retry.',
  accent: '#8B6FD6',
  icon: 'pulse',
};

// Everything the title column can show, in the order it is stacked inside the mask
export const TITLE_LINES: readonly Stage[] = [...STAGES, STALLED_STAGE];

export const stageIndexOf = (id: StageId) => TITLE_LINES.findIndex((stage) => stage.id === id);
