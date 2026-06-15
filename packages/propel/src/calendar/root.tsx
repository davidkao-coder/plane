/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeftIcon } from "../icons/arrows/chevron-left";

import { cn } from "../utils";

// Traditional-Chinese (Taiwan) date-picker labels — implemented locally so
// propel needn't depend on date-fns. Month caption "2026年6月", weekday "日".
const ZH_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const zhFormatters = {
  formatCaption: (month: Date) => `${month.getFullYear()}年${month.getMonth() + 1}月`,
  formatWeekdayName: (day: Date) => ZH_WEEKDAYS[day.getDay()],
};

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, showOutsideDays = true, ...props }: CalendarProps) {
  const currentYear = new Date().getFullYear();
  const thirtyYearsAgoFirstDay = new Date(currentYear - 30, 0, 1);
  const thirtyYearsFromNowFirstDay = new Date(currentYear + 30, 11, 31);

  return (
    <DayPicker
      formatters={zhFormatters}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      weekStartsOn={props.weekStartsOn}
      components={{
        Chevron: ({ className, ...props }) => (
          <ChevronLeftIcon
            className={cn(
              "size-4",
              { "rotate-180": props.orientation === "right", "-rotate-90": props.orientation === "down" },
              className
            )}
            {...props}
          />
        ),
      }}
      startMonth={thirtyYearsAgoFirstDay}
      endMonth={thirtyYearsFromNowFirstDay}
      {...props}
    />
  );
}
