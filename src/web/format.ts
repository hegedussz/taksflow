import { DateTime } from 'luxon';
import { ZONE } from '../domain/time.js';
import type { Lang } from '../services/userService.js';

const local = (d: Date | DateTime, lang: Lang) =>
  (d instanceof Date ? DateTime.fromJSDate(d) : d).setZone(ZONE).setLocale(lang);

/** pl. „2027. jan. 12., kedd” / „Tuesday, 12 Jan 2027” */
export const formatDate = (d: Date | DateTime, lang: Lang): string =>
  local(d, lang).toFormat(lang === 'hu' ? 'yyyy. LLL d., cccc' : 'cccc, d LLL yyyy');

export const formatShortDate = (d: Date | DateTime, lang: Lang): string =>
  local(d, lang).toFormat(lang === 'hu' ? 'LLL d.' : 'd LLL');

export const formatTime = (d: Date | DateTime): string => local(d, 'hu').toFormat('H:mm');

export const formatRange = (start: Date, end: Date): string => `${formatTime(start)}–${formatTime(end)}`;

export function formatDuration(minutes: number, lang: Lang): string {
  if (minutes < 60) return lang === 'hu' ? `${minutes} perc` : `${minutes} min`;
  const h = minutes / 60;
  const text = Number.isInteger(h) ? String(h) : lang === 'hu' ? h.toFixed(1).replace('.', ',') : h.toFixed(1);
  return lang === 'hu' ? `${text} óra` : `${text} ${h === 1 ? 'hour' : 'hours'}`;
}
