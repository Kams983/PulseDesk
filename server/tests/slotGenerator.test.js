const { generateSlots } = require('../src/services/slotGenerator');
const { timeToMinutes } = require('../src/utils/time');

// the generator is pure, so these tests need no database and no fixtures
const starts = (slots) => slots.map((slot) => slot.startTime);

// the invariant that matters most: whatever the inputs, the output can never double book a doctor
function expectNoOverlap(slots) {
  for (let i = 1; i < slots.length; i += 1) {
    expect(timeToMinutes(slots[i].startTime)).toBeGreaterThanOrEqual(timeToMinutes(slots[i - 1].endTime));
  }

  expect(new Set(starts(slots)).size).toBe(slots.length);
}

describe('generateSlots', () => {
  it('walks a session in steps of the duration, 09:00 to 10:00 with 15 minutes', () => {
    const slots = generateSlots({ sessions: [{ start: '09:00', end: '10:00' }], slotDurationMinutes: 15 });

    expect(slots).toEqual([
      { startTime: '09:00', endTime: '09:15' },
      { startTime: '09:15', endTime: '09:30' },
      { startTime: '09:30', endTime: '09:45' },
      { startTime: '09:45', endTime: '10:00' },
    ]);
    expectNoOverlap(slots);
  });

  it('never places a slot inside the lunch break of a split day', () => {
    const slots = generateSlots({
      sessions: [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '17:00' },
      ],
      breaks: [{ start: '12:00', end: '13:00' }],
      slotDurationMinutes: 15,
    });

    const breakStart = timeToMinutes('12:00');
    const breakEnd = timeToMinutes('13:00');

    for (const slot of slots) {
      // a slot is fine only when it ends by the break or starts after it
      const clear = timeToMinutes(slot.endTime) <= breakStart || timeToMinutes(slot.startTime) >= breakEnd;
      expect(clear).toBe(true);
    }

    expect(starts(slots)).not.toContain('12:00');
    expect(starts(slots)[0]).toBe('09:00');
    expect(starts(slots)).toContain('13:00');
    expect(starts(slots).at(-1)).toBe('16:45');
    // twelve in the morning and sixteen in the evening, the break itself contributes no slot
    expect(slots).toHaveLength(12 + 16);
    expectNoOverlap(slots);
  });

  it('removes the slots that overlap a break taken inside a session', () => {
    const slots = generateSlots({
      sessions: [{ start: '09:00', end: '12:00' }],
      breaks: [{ start: '10:00', end: '10:30' }],
      slotDurationMinutes: 15,
    });

    expect(starts(slots)).toEqual(['09:00', '09:15', '09:30', '09:45', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45']);
    // 10:00 and 10:15 each ran into the break, so both are gone
    expect(starts(slots)).not.toContain('10:00');
    expect(starts(slots)).not.toContain('10:15');
    expectNoOverlap(slots);
  });

  it('leaves the tail unused when the session is not a multiple of the duration', () => {
    const slots = generateSlots({ sessions: [{ start: '09:00', end: '10:00' }], slotDurationMinutes: 25 });

    // 09:25 to 09:50 fits, a third slot would run to 10:15 and is dropped
    expect(slots).toEqual([
      { startTime: '09:00', endTime: '09:25' },
      { startTime: '09:25', endTime: '09:50' },
    ]);
    expect(timeToMinutes(slots.at(-1).endTime)).toBeLessThanOrEqual(timeToMinutes('10:00'));
    expectNoOverlap(slots);
  });

  it('produces no duplicates or overlaps from overlapping sessions', () => {
    const slots = generateSlots({
      sessions: [
        { start: '09:00', end: '10:00' },
        { start: '09:30', end: '11:00' },
      ],
      slotDurationMinutes: 15,
    });

    expect(starts(slots)).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45']);
    expectNoOverlap(slots);
  });

  it('keeps every generated list non overlapping, across the awkward shapes', () => {
    const cases = [
      { sessions: [{ start: '09:00', end: '12:00' }, { start: '09:30', end: '11:00' }], breaks: [{ start: '09:45', end: '10:00' }], slotDurationMinutes: 5 },
      { sessions: [{ start: '13:00', end: '17:00' }], breaks: [{ start: '12:00', end: '13:00' }, { start: '14:00', end: '14:30' }], slotDurationMinutes: 30 },
      { sessions: [{ start: '08:00', end: '09:00' }], breaks: [{ start: '08:20', end: '08:40' }], slotDurationMinutes: 20 },
      { sessions: [{ start: '09:00', end: '17:00' }], breaks: [], slotDurationMinutes: 120 },
    ];

    for (const input of cases) {
      expectNoOverlap(generateSlots(input));
    }
  });

  it('ignores breaks that sit outside the sessions, so they change nothing', () => {
    const withStrayBreak = generateSlots({
      sessions: [{ start: '09:00', end: '10:00' }],
      breaks: [{ start: '12:00', end: '13:00' }],
      slotDurationMinutes: 15,
    });

    expect(withStrayBreak).toHaveLength(4);
  });

  it('returns nothing for a doctor who does not work that day', () => {
    expect(generateSlots({ sessions: [], breaks: [], slotDurationMinutes: 15 })).toEqual([]);
  });

  it('refuses a duration that cannot produce a slot grid', () => {
    expect(() => generateSlots({ sessions: [{ start: '09:00', end: '10:00' }], slotDurationMinutes: 0 })).toThrow(RangeError);
    expect(() => generateSlots({ sessions: [{ start: '09:00', end: '10:00' }], slotDurationMinutes: 1.5 })).toThrow(RangeError);
  });
});
