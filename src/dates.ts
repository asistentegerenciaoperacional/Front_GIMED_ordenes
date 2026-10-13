/** Calendar dates stay independent of the computer's time zone. */
export function parseDateInput(value: string): string | null {
  const source = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(source);
  if (!iso && !local) return null;
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(local![3]), Number(local![2]), Number(local![1])];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
    return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatDateInput(value: string): string {
  const date = parseDateInput(value);
  return date
    ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
    : value;
}

/** Insert separators while keeping partially edited day/month segments intact. */
export function maskDateInput(
  value: string,
  caret = value.length,
  deleting = false,
): { value: string; caret: number } {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return { value: `${iso[3]}/${iso[2]}/${iso[1]}`, caret: 10 };

  const clean = value.replace(/[^\d/]/g, "");
  const parts = clean.split("/");
  const continuous = parts.length === 1;
  const day = parts[0].slice(0, 2);
  const rest = continuous ? parts[0].slice(2) : (parts[1] ?? "");
  const month = rest.slice(0, 2);
  const year = (
    parts.length > 2 ? parts.slice(2).join("") : rest.slice(2)
  ).slice(0, 4);
  const monthSeparator =
    !continuous || rest.length > 0 || (day.length === 2 && !deleting);
  const yearSeparator =
    parts.length > 2 || year.length > 0 || (month.length === 2 && !deleting);
  const masked =
    day +
    (monthSeparator ? "/" + month : "") +
    (yearSeparator ? "/" + year : "");

  const prefix = value.slice(0, caret).replace(/[^\d/]/g, "");
  let position: number;
  if (continuous) {
    const digits = Math.min(prefix.length, 8);
    position =
      digits +
      (monthSeparator && digits >= 2 ? 1 : 0) +
      (yearSeparator && digits >= 4 ? 1 : 0);
  } else {
    const prefixParts = prefix.split("/");
    const segment = Math.min(prefixParts.length - 1, 2);
    const digits = prefixParts[segment].length;
    if (segment === 0)
      position =
        Math.min(digits, day.length) +
        (digits === 2 && monthSeparator && !deleting ? 1 : 0);
    else if (segment === 1)
      position =
        day.length +
        1 +
        Math.min(digits, month.length) +
        (digits === 2 && yearSeparator && !deleting ? 1 : 0) +
        Math.max(0, Math.min(digits - 2, year.length));
    else
      position = day.length + month.length + 2 + Math.min(digits, year.length);
  }
  return { value: masked, caret: Math.min(position, masked.length) };
}
