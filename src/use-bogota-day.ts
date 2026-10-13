import { useEffect, useState } from "react";
import { calendarDay } from "./order-table";
import { addCalendarDays } from "./order-filters";

export const bogotaDay = (now = new Date()) => calendarDay(now.toISOString())!;
export function millisecondsToBogotaMidnight(now = new Date()): number {
  // Bogotá observes UTC−05:00 throughout the year.
  const midnight = Date.parse(
    addCalendarDays(bogotaDay(now), 1) + "T00:00:00-05:00",
  );
  return Math.max(1, midnight - now.getTime());
}

export function useBogotaDay(): string {
  const [day, setDay] = useState(bogotaDay);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setDay(bogotaDay());
      timer = setTimeout(refresh, millisecondsToBogotaMidnight());
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return day;
}
