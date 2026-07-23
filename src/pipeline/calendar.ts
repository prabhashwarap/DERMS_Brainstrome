/**
 * Sri Lanka calendar helpers.
 *
 * Everything in the pipeline works in Asia/Colombo (UTC+5:30). The demo runs
 * entirely in the browser, so rather than depend on the viewer's system zone we
 * carry an explicit offset and derive local calendar fields from it.
 */

export const LKT_OFFSET_MIN = 330; // UTC+05:30

/** Local (Colombo) calendar fields for an absolute instant. */
export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday */
  weekday: number;
  /** Hour of day as a decimal, e.g. 18.75 for 18:45. */
  decimalHour: number;
  /** 1-366 */
  dayOfYear: number;
  /** YYYY-MM-DD in Colombo local time. */
  dateKey: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function localParts(ts: number): LocalParts {
  const d = new Date(ts + LKT_OFFSET_MIN * 60_000);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const start = Date.UTC(year, 0, 1);
  const dayOfYear =
    Math.floor((Date.UTC(year, d.getUTCMonth(), day) - start) / 86_400_000) + 1;
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: d.getUTCDay(),
    decimalHour: hour + minute / 60,
    dayOfYear,
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
  };
}

/** Format an instant in Colombo time. */
export function formatLKT(ts: number, opts: { date?: boolean; time?: boolean } = {}) {
  const { date = false, time = true } = opts;
  const p = localParts(ts);
  const t = `${pad(p.hour)}:${pad(p.minute)}`;
  const d = `${p.day} ${MONTHS[p.month - 1]}`;
  if (date && time) return `${d}, ${t}`;
  if (date) return d;
  return t;
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Sri Lankan public holidays. Poya days shift with the lunar calendar, so a
 * production build would read these from an authoritative table; for the demo
 * we carry the mercantile + public holiday set for the covered window.
 */
export const HOLIDAY_MAP: Record<string, string> = {
  "01-14": "Tamil Thai Pongal",
  "01-15": "Duruthu Poya",
  "02-04": "Independence Day",
  "02-13": "Navam Poya",
  "03-14": "Medin Poya",
  "04-12": "Bak Poya",
  "04-13": "Sinhala & Tamil New Year Eve",
  "04-14": "Sinhala & Tamil New Year",
  "05-01": "May Day",
  "05-11": "Vesak Poya",
  "05-12": "Day after Vesak",
  "06-10": "Poson Poya",
  "07-09": "Esala Poya",
  "08-08": "Nikini Poya",
  "09-06": "Binara Poya",
  "10-06": "Vap Poya",
  "11-04": "Il Poya",
  "12-04": "Unduvap Poya",
  "12-25": "Christmas",
};

export function getHolidayName(p: LocalParts): string | null {
  return HOLIDAY_MAP[`${pad(p.month)}-${pad(p.day)}`] ?? null;
}

export function isHoliday(p: LocalParts): boolean {
  return `${pad(p.month)}-${pad(p.day)}` in HOLIDAY_MAP;
}

export const QUARTER_MS = 15 * 60_000;
export const SLOTS_PER_DAY = 96;

/** Round an instant down to the containing 15-minute slot. */
export const floorQuarter = (ts: number) => Math.floor(ts / QUARTER_MS) * QUARTER_MS;

/** Start of the Colombo local day containing `ts`, as an absolute instant. */
export function startOfLocalDay(ts: number): number {
  const shifted = ts + LKT_OFFSET_MIN * 60_000;
  const floored = Math.floor(shifted / 86_400_000) * 86_400_000;
  return floored - LKT_OFFSET_MIN * 60_000;
}
