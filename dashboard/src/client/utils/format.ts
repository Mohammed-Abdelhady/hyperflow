/**
 * Locale-aware formatters — every UI number/timestamp routes through here.
 * Intl instances are cached per locale + options key.
 */

type CacheKey = string;

const numberCache = new Map<CacheKey, Intl.NumberFormat>();
const dateCache = new Map<CacheKey, Intl.DateTimeFormat>();

function detectLocale(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "en-US";
}

function numberFmt(
  locale: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = numberCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    numberCache.set(key, fmt);
  }
  return fmt;
}

function dateFmt(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = dateCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options);
    dateCache.set(key, fmt);
  }
  return fmt;
}

/** Compact token counts with unit suffix, e.g. "12.4k tok". */
export function formatTokens(
  value: number,
  locale: string = detectLocale(),
): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const n = numberFmt(locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    }).format(value / 1_000_000);
    return `${n}M tok`;
  }
  if (abs >= 1_000) {
    const n = numberFmt(locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    }).format(value / 1_000);
    return `${n}k tok`;
  }
  return `${numberFmt(locale, { maximumFractionDigits: 0 }).format(value)} tok`;
}

/** Duration with unit — ms / s / m. */
export function formatDuration(
  ms: number,
  locale: string = detectLocale(),
): string {
  const abs = Math.abs(ms);
  if (abs < 1000) {
    return `${numberFmt(locale, { maximumFractionDigits: 0 }).format(ms)} ms`;
  }
  if (abs < 60_000) {
    return `${numberFmt(locale, { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
  }
  return `${numberFmt(locale, { maximumFractionDigits: 1 }).format(ms / 60_000)} m`;
}

export function formatPercent(
  ratio: number,
  locale: string = detectLocale(),
): string {
  return numberFmt(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(ratio);
}

/** Stream row time-of-day. */
export function formatTimeOfDay(
  input: string | number | Date,
  locale: string = detectLocale(),
): string {
  const d = input instanceof Date ? input : new Date(input);
  return dateFmt(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

/** Artefact date+time. */
export function formatDateTime(
  input: string | number | Date,
  locale: string = detectLocale(),
): string {
  const d = input instanceof Date ? input : new Date(input);
  return dateFmt(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Signed delta with unit, e.g. "+1.2k tok". */
export function formatDelta(
  value: number,
  unit: "tok" | "%" | "" = "",
  locale: string = detectLocale(),
): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  let body: string;
  if (unit === "tok") {
    body = formatTokens(abs, locale).replace(/ tok$/, "");
    return `${sign}${body} tok`;
  }
  if (unit === "%") {
    body = numberFmt(locale, { maximumFractionDigits: 1 }).format(abs);
    return `${sign}${body}%`;
  }
  body = numberFmt(locale, { maximumFractionDigits: 1 }).format(abs);
  return `${sign}${body}`;
}

/** Test helper — clear caches between locale cases if needed. */
export function clearFormatCaches(): void {
  numberCache.clear();
  dateCache.clear();
}
