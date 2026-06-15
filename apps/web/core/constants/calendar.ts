/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TCalendarLayouts } from "@plane/types";
import { EStartOfTheWeek } from "@plane/types";

export const MONTHS_LIST: {
  [monthNumber: number]: {
    shortTitle: string;
    title: string;
  };
} = {
  1: { shortTitle: "1月", title: "1月" },
  2: { shortTitle: "2月", title: "2月" },
  3: { shortTitle: "3月", title: "3月" },
  4: { shortTitle: "4月", title: "4月" },
  5: { shortTitle: "5月", title: "5月" },
  6: { shortTitle: "6月", title: "6月" },
  7: { shortTitle: "7月", title: "7月" },
  8: { shortTitle: "8月", title: "8月" },
  9: { shortTitle: "9月", title: "9月" },
  10: { shortTitle: "10月", title: "10月" },
  11: { shortTitle: "11月", title: "11月" },
  12: { shortTitle: "12月", title: "12月" },
};

export const DAYS_LIST: {
  [dayIndex: number]: {
    shortTitle: string;
    title: string;
    value: EStartOfTheWeek;
  };
} = {
  1: {
    shortTitle: "週日",
    title: "星期日",
    value: EStartOfTheWeek.SUNDAY,
  },
  2: {
    shortTitle: "週一",
    title: "星期一",
    value: EStartOfTheWeek.MONDAY,
  },
  3: {
    shortTitle: "週二",
    title: "星期二",
    value: EStartOfTheWeek.TUESDAY,
  },
  4: {
    shortTitle: "週三",
    title: "星期三",
    value: EStartOfTheWeek.WEDNESDAY,
  },
  5: {
    shortTitle: "週四",
    title: "星期四",
    value: EStartOfTheWeek.THURSDAY,
  },
  6: {
    shortTitle: "週五",
    title: "星期五",
    value: EStartOfTheWeek.FRIDAY,
  },
  7: {
    shortTitle: "週六",
    title: "星期六",
    value: EStartOfTheWeek.SATURDAY,
  },
};

export const CALENDAR_LAYOUTS: {
  [layout in TCalendarLayouts]: {
    key: TCalendarLayouts;
    title: string;
  };
} = {
  month: {
    key: "month",
    title: "月檢視",
  },
  week: {
    key: "week",
    title: "週檢視",
  },
};
