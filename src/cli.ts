#!/usr/bin/env node
import { explain, next, CronParseError } from "./index.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const countFlag = args.find((a) => a.startsWith("--next="));
const count = countFlag ? Number(countFlag.split("=")[1]) : flags.has("--next") ? 5 : 0;

if (flags.has("--help") || positional.length === 0) {
  console.log(`Usage: cron-explain "<expression>" [--next[=N]] [--utc] [--json]

Examples:
  cron-explain "*/15 9-17 * * 1-5"
  cron-explain "@daily" --next=3
  cron-explain "0 9 1 * *" --next --utc --json`);
  process.exit(positional.length === 0 && !flags.has("--help") ? 1 : 0);
}

const expression = positional.join(" ");
try {
  const text = explain(expression);
  const upcoming = count > 0 ? next(expression, { count, utc: flags.has("--utc") }) : [];
  if (flags.has("--json")) {
    console.log(JSON.stringify({ expression, description: text, next: upcoming.map((d) => d.toISOString()) }, null, 2));
  } else {
    console.log(text);
    for (const d of upcoming) console.log("  " + (flags.has("--utc") ? d.toISOString() : d.toString()));
  }
} catch (err) {
  if (err instanceof CronParseError) {
    console.error(`cron-explain: ${err.message}`);
    process.exit(2);
  }
  throw err;
}
