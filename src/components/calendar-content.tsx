import { parseDate } from "@internationalized/date";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
} from "react-aria-components/Calendar";
import { Heading } from "react-aria-components/Heading";
import { parseDateInput } from "../dates";
import { Action } from "./controls";
export function CalendarContent({
  label,
  value,
  min,
  max,
  onSelect,
}: {
  label: string;
  value: string | null;
  min?: string;
  max?: string;
  onSelect: (date: string) => void;
}) {
  return (
    <Calendar
      aria-label={label}
      autoFocus
      value={value ? parseDate(value) : null}
      minValue={min && parseDateInput(min) ? parseDate(min) : undefined}
      maxValue={max && parseDateInput(max) ? parseDate(max) : undefined}
      onChange={(date) => onSelect(date.toString())}
    >
      <header>
        <Action slot="previous" aria-label="Mes anterior">
          <ChevronLeft size={16} />
        </Action>
        <Heading />
        <Action slot="next" aria-label="Mes siguiente">
          <ChevronRight size={16} />
        </Action>
      </header>
      <CalendarGrid>
        <CalendarGridHeader>
          {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => <CalendarCell date={date} />}
        </CalendarGridBody>
      </CalendarGrid>
    </Calendar>
  );
}
