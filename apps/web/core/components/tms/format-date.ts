/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Traditional-Chinese (Taiwan) date formatting helpers for TMS UI.
 * Standard convention: Arabic numerals + Chinese units — 2026年6月15日.
 */

/** "6月15日" from a Date */
export function twMonthDay(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** "6月" from a Date */
export function twMonth(d: Date): string {
  return `${d.getMonth() + 1}月`;
}

/** "2026年6月" from a Date */
export function twYearMonth(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

/** "15日" from a Date (day only, for dense daily axes) */
export function twDay(d: Date): string {
  return `${d.getDate()}日`;
}

/** Full date "2026年6月15日" from an ISO string; "—" when empty, raw string if unparseable. */
export function twDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** Short date "6月15日" from an ISO string; "—" when empty. */
export function twShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return twMonthDay(d);
}
