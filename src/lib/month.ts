// Shared month-navigation helpers used by Overview, Jobs, Schedule, and
// Availability so "which month am I looking at" works the same way everywhere.

export function monthLabel(month: string) {
  const d = new Date(month + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function currentMonthFirstDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function shiftMonth(month: string, delta: number) {
  const d = new Date(month + "T00:00:00");
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function addDays(dateStr: string, delta: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getMonthsWithDates(dates: string[]): string[] {
  return [...new Set(dates.map((d) => `${d.slice(0, 7)}-01`))].sort();
}

// Soonest month that still has upcoming dates, falling back to the most
// recent month with any dates at all, or today's calendar month otherwise.
export function pickDefaultMonth(monthsWithDates: string[]): string {
  const current = currentMonthFirstDay();
  const upcoming = monthsWithDates.filter((m) => m >= current);
  if (upcoming.length > 0) return upcoming[0];
  if (monthsWithDates.length > 0) return monthsWithDates[monthsWithDates.length - 1];
  return current;
}

// The list of months worth offering in a picker: the current month, up to
// two months back (older history lives in Pixifi, not here), and every
// future month that already has something booked — schools often book a
// year ahead.
export function selectableMonths(monthsWithDates: string[]): string[] {
  const current = currentMonthFirstDay();
  const recentPast = [shiftMonth(current, -2), shiftMonth(current, -1), current];
  const future = monthsWithDates.filter((m) => m > current);
  return [...new Set([...recentPast, ...future])].sort();
}

// A calendar month laid out as full weeks (Mon-Sun), padded with the tail of
// the previous month and the head of the next so the grid is always a clean
// rectangle. Padding days are returned so cells can render dimmed, not so
// their Picture Days show up under the wrong month.
export type CalendarDay = { date: string; inMonth: boolean };

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Monday of the week containing the given date.
export function mondayOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0 = Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return toIso(d);
}

export function shiftWeek(weekStart: string, delta: number) {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + delta * 7);
  return toIso(d);
}

// A single Mon-Sun week as a flat array of 7 days.
export function getWeekGrid(weekStart: string, currentMonth: string): CalendarDay[] {
  const days: CalendarDay[] = [];
  const d = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const date = toIso(d);
    days.push({ date, inMonth: date.slice(0, 7) === currentMonth.slice(0, 7) });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function getMonthGrid(month: string): CalendarDay[][] {
  const [year, monthNum] = month.split("-").map(Number);
  const firstOfMonth = new Date(year, monthNum - 1, 1);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const days: CalendarDay[] = [];
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(year, monthNum - 1, i + 1);
    days.push({ date: toIso(d), inMonth: true });
  }

  const leadingCount = (firstOfMonth.getDay() + 6) % 7; // Mon = 0 ... Sun = 6
  const leadingDays: CalendarDay[] = [];
  for (let i = leadingCount; i > 0; i--) {
    const d = new Date(year, monthNum - 1, 1 - i);
    leadingDays.push({ date: toIso(d), inMonth: false });
  }
  days.unshift(...leadingDays);

  while (days.length % 7 !== 0) {
    const last = new Date(days[days.length - 1].date + "T00:00:00");
    last.setDate(last.getDate() + 1);
    days.push({ date: toIso(last), inMonth: false });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

// Assigns each job a stable "lane" (vertical slot) within a single week, so a
// job spanning multiple days in that week renders in the same row position
// on each of those days — even if that leaves blank gaps on days it's not
// on. Once a job has a lane, it keeps it for the rest of the week; new jobs
// take the lowest lane not already used that day.
export function computeJobLanes(week: CalendarDay[], jobIdsByDate: Map<string, string[]>): Map<string, number> {
  const laneOf = new Map<string, number>();
  week.forEach((day) => {
    const jobIds = jobIdsByDate.get(day.date) || [];
    const usedToday = new Set<number>();
    jobIds.forEach((id) => {
      const existing = laneOf.get(id);
      if (existing !== undefined) usedToday.add(existing);
    });
    jobIds.forEach((id) => {
      if (laneOf.has(id)) return;
      let lane = 0;
      while (usedToday.has(lane)) lane++;
      laneOf.set(id, lane);
      usedToday.add(lane);
    });
  });
  return laneOf;
}
