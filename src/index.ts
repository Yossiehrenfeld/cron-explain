/**
 * cron-explain — parse 5-field cron expressions, explain them in plain
 * English, and compute upcoming run times. Zero dependencies.
 */

export interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
  /** true when the day-of-month field is "*" (unrestricted) */
  anyDayOfMonth: boolean;
  /** true when the day-of-week field is "*" (unrestricted) */
  anyDayOfWeek: boolean;
  /** The original (alias-expanded) expression */
  expression: string;
}

export class CronParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronParseError";
  }
}

const ALIASES: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: string[];
}

const SPECS: FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTH_NAMES },
  { name: "day-of-week", min: 0, max: 7, names: DAY_NAMES },
];

function parseValue(raw: string, spec: FieldSpec): number {
  const upper = raw.toUpperCase();
  if (spec.names) {
    const idx = spec.names.indexOf(upper);
    if (idx >= 0) return idx + (spec.name === "month" ? 1 : 0);
  }
  if (!/^\d+$/.test(raw)) throw new CronParseError(`Invalid value "${raw}" in ${spec.name} field`);
  const n = Number(raw);
  if (n < spec.min || n > spec.max) throw new CronParseError(`Value ${n} out of range ${spec.min}-${spec.max} in ${spec.name} field`);
  return n;
}

function parseField(field: string, spec: FieldSpec): number[] {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    if (part === "") throw new CronParseError(`Empty list item in ${spec.name} field`);
    let [range, stepStr] = part.split("/");
    if (part.includes("/") && (stepStr === undefined || stepStr === "")) throw new CronParseError(`Missing step in "${part}"`);
    const step = stepStr === undefined ? 1 : Number(stepStr);
    if (!Number.isInteger(step) || step < 1) throw new CronParseError(`Invalid step "${stepStr}" in ${spec.name} field`);
    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = spec.min;
      hi = spec.name === "day-of-week" ? 6 : spec.max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-");
      lo = parseValue(a, spec);
      hi = parseValue(b, spec);
      if (hi < lo) throw new CronParseError(`Range "${range}" is backwards in ${spec.name} field`);
    } else {
      lo = parseValue(range, spec);
      hi = stepStr === undefined ? lo : (spec.name === "day-of-week" ? 6 : spec.max);
    }
    for (let v = lo; v <= hi; v += step) values.add(spec.name === "day-of-week" && v === 7 ? 0 : v);
  }
  return [...values].sort((a, b) => a - b);
}

/** Parse a 5-field cron expression (or an @alias). Throws CronParseError. */
export function parse(expression: string): CronFields {
  const trimmed = expression.trim();
  const expanded = ALIASES[trimmed.toLowerCase()] ?? trimmed;
  const fields = expanded.split(/\s+/);
  if (fields.length !== 5) throw new CronParseError(`Expected 5 fields, got ${fields.length}: "${expression}"`);
  const [m, h, dom, mon, dow] = fields.map((f, i) => parseField(f, SPECS[i]));
  return {
    minute: m, hour: h, dayOfMonth: dom, month: mon, dayOfWeek: dow,
    anyDayOfMonth: fields[2] === "*", anyDayOfWeek: fields[3] === "*" && fields[4] === "*" ? true : fields[4] === "*",
    expression: expanded,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Detect "every n" steps across the full range, or a contiguous range. */
function shape(values: number[], min: number, max: number): { kind: "all" } | { kind: "step"; step: number } | { kind: "range"; lo: number; hi: number } | { kind: "list" } {
  const full = max - min + 1;
  if (values.length === full) return { kind: "all" };
  if (values.length >= 2) {
    const step = values[1] - values[0];
    const isStep = values.every((v, i) => i === 0 || v - values[i - 1] === step);
    if (step === 1 && values[0] !== min || step === 1 && values[values.length - 1] !== max) {
      if (isStep) return { kind: "range", lo: values[0], hi: values[values.length - 1] };
    }
    const expectedCount = Math.floor((max - min) / step) + 1;
    if (isStep && step > 1 && values.length >= 3 && values[0] === min && values.length === expectedCount) return { kind: "step", step };
  }
  return { kind: "list" };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function describeUnit(values: number[], spec: FieldSpec, label: (v: number) => string, unitWord: string): string {
  const max = spec.name === "day-of-week" ? 6 : spec.max;
  const s = shape(values, spec.min, max);
  switch (s.kind) {
    case "all": return `every ${unitWord}`;
    case "step": return `every ${ordinal(s.step)} ${unitWord}`;
    case "range": return `${unitWord} ${label(s.lo)} through ${label(s.hi)}`;
    default: return `${unitWord} ${joinList(values.map(label))}`;
  }
}

/** Describe a cron expression in plain English. */
export function explain(expression: string): string {
  const c = parse(expression);
  const parts: string[] = [];

  const minShape = shape(c.minute, 0, 59);
  const hourShape = shape(c.hour, 0, 23);

  if (c.minute.length === 1 && c.hour.length === 1) {
    parts.push(`At ${pad(c.hour[0])}:${pad(c.minute[0])}`);
  } else if (minShape.kind === "all" && hourShape.kind === "all") {
    parts.push("Every minute");
  } else if (minShape.kind === "step" && hourShape.kind === "all") {
    parts.push(`Every ${minShape.step} minutes`);
  } else if (minShape.kind === "all") {
    parts.push(`Every minute past ${describeUnit(c.hour, SPECS[1], String, "hour")}`);
  } else if (minShape.kind === "step") {
    parts.push(`Every ${minShape.step} minutes past ${describeUnit(c.hour, SPECS[1], String, "hour")}`);
  } else if (hourShape.kind === "all") {
    parts.push(`At ${describeUnit(c.minute, SPECS[0], String, "minute")} past every hour`);
  } else {
    parts.push(`At ${describeUnit(c.minute, SPECS[0], String, "minute")} past ${describeUnit(c.hour, SPECS[1], String, "hour")}`);
  }

  const domText = c.anyDayOfMonth ? null : `on ${describeUnit(c.dayOfMonth, SPECS[2], String, "day-of-month")}`;
  const dowText = c.anyDayOfWeek ? null : `on ${describeUnit(c.dayOfWeek, SPECS[4], (v) => DAY_LONG[v], "day-of-week")}`.replace("day-of-week ", "");
  if (domText && dowText) parts.push(`${domText} or ${dowText}`);
  else if (domText) parts.push(domText);
  else if (dowText) parts.push(dowText);

  if (c.month.length < 12) parts.push(`in ${describeUnit(c.month, SPECS[3], (v) => MONTH_LONG[v - 1], "month").replace(/^month /, "")}`);

  return parts.join(" ") + ".";
}

export interface NextOptions {
  /** Start searching after this instant. Defaults to now. */
  from?: Date;
  /** How many occurrences to return. Default 1. */
  count?: number;
  /** Evaluate the schedule in UTC instead of the process's local time zone. */
  utc?: boolean;
}

interface Clock {
  get(d: Date, k: "y" | "mo" | "d" | "h" | "mi" | "dow"): number;
  make(y: number, mo: number, d: number, h: number, mi: number): Date;
}

const localClock: Clock = {
  get: (d, k) => ({ y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), dow: d.getDay() })[k],
  make: (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0),
};
const utcClock: Clock = {
  get: (d, k) => ({ y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() })[k],
  make: (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h, mi, 0, 0)),
};

/** Does the expression match this instant (seconds ignored)? */
export function matches(expression: string | CronFields, date: Date, utc = false): boolean {
  const c = typeof expression === "string" ? parse(expression) : expression;
  const k = utc ? utcClock : localClock;
  if (!c.minute.includes(k.get(date, "mi"))) return false;
  if (!c.hour.includes(k.get(date, "h"))) return false;
  if (!c.month.includes(k.get(date, "mo"))) return false;
  const domOk = c.dayOfMonth.includes(k.get(date, "d"));
  const dowOk = c.dayOfWeek.includes(k.get(date, "dow"));
  if (c.anyDayOfMonth && c.anyDayOfWeek) return true;
  if (c.anyDayOfMonth) return dowOk;
  if (c.anyDayOfWeek) return domOk;
  return domOk || dowOk; // POSIX cron: both restricted => either matches
}

/** Compute the next run time(s) after `from`. Returns fewer than `count` only if none exist within 5 years. */
export function next(expression: string, options: NextOptions = {}): Date[] {
  const c = parse(expression);
  const k = options.utc ? utcClock : localClock;
  const count = options.count ?? 1;
  const start = options.from ?? new Date();
  const limit = new Date(start.getTime() + 5 * 366 * 86_400_000);
  const out: Date[] = [];

  // Begin at the next whole minute.
  let t = k.make(k.get(start, "y"), k.get(start, "mo"), k.get(start, "d"), k.get(start, "h"), k.get(start, "mi") + 1);
  while (out.length < count && t < limit) {
    const y = k.get(t, "y"), mo = k.get(t, "mo"), d = k.get(t, "d"), h = k.get(t, "h"), mi = k.get(t, "mi");
    if (!c.month.includes(mo)) { t = k.make(y, mo + 1, 1, 0, 0); continue; }
    const domOk = c.dayOfMonth.includes(d);
    const dowOk = c.dayOfWeek.includes(k.get(t, "dow"));
    const dayOk = c.anyDayOfMonth && c.anyDayOfWeek ? true : c.anyDayOfMonth ? dowOk : c.anyDayOfWeek ? domOk : domOk || dowOk;
    if (!dayOk) { t = k.make(y, mo, d + 1, 0, 0); continue; }
    if (!c.hour.includes(h)) { t = k.make(y, mo, d, h + 1, 0); continue; }
    if (!c.minute.includes(mi)) { t = k.make(y, mo, d, h, mi + 1); continue; }
    out.push(t);
    t = k.make(y, mo, d, h, mi + 1);
  }
  return out;
}
