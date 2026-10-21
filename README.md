# cron-explain

Explain cron expressions in plain English and compute their next run times. Zero dependencies,
TypeScript types included, tiny CLI.

```
$ cron-explain "*/15 9-17 * * 1-5" --next=3
Every 15 minutes past hour 9 through 17 on Monday through Friday.
  Thu Oct 22 2026 09:00:00 GMT-0400 (Eastern Daylight Time)
  Thu Oct 22 2026 09:15:00 GMT-0400 (Eastern Daylight Time)
  Thu Oct 22 2026 09:30:00 GMT-0400 (Eastern Daylight Time)
```

## Install

```sh
npm install cron-explain        # library
npm install -g cron-explain     # CLI
```

## CLI

```
cron-explain "<expression>" [--next[=N]] [--utc] [--json]
```

- `--next` prints the next 5 runs, `--next=N` the next N.
- `--utc` evaluates the schedule in UTC instead of your local time zone.
- `--json` prints `{ expression, description, next[] }`.
- Exit code 2 on a parse error (with a message naming the bad field), so it works as a validator in scripts.

## Library

```ts
import { explain, next, parse, matches } from "cron-explain";

explain("0 9 * * 1-5");
// "At 09:00 on Monday through Friday."

next("0 9 * * 1-5", { count: 3, utc: true });
// [Date, Date, Date]

next("@monthly", { from: new Date("2026-10-21T00:00:00Z"), utc: true })[0].toISOString();
// "2026-11-01T00:00:00.000Z"

parse("*/15 9-17 1,15 JAN-MAR MON-FRI");
// { minute: [0,15,30,45], hour: [9..17], dayOfMonth: [1,15], month: [1,2,3], dayOfWeek: [1..5], ... }

matches("30 9 * * *", new Date("2026-10-21T09:30:00Z"), true); // true
```

## What's supported

- The standard 5 fields: minute, hour, day-of-month, month, day-of-week.
- `*`, lists (`1,15`), ranges (`9-17`), steps (`*/5`, `1-30/10`, `5/10`), month and day names (`JAN`, `MON`), `7` as Sunday.
- Aliases: `@yearly` `@annually` `@monthly` `@weekly` `@daily` `@midnight` `@hourly`.
- POSIX semantics for day fields: when both day-of-month and day-of-week are restricted, a run happens when **either** matches (the description says "or" for this reason).
- `next()` searches up to 5 years ahead and returns an empty array if nothing matches (e.g. `0 0 31 2 *`).

Not supported: seconds (6-field), `L`, `W`, `#`, `?` (Quartz extensions).

## Development

```sh
npm install
npm test
npm run build
```

## License

MIT © Yosef Ehrenfeld
