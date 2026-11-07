/** Formatting helpers shared by client and server. */

export function fmtMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}

/** "+$10.00" / "-$5.00" / "$0.00" — for exact price differences. */
export function fmtSignedMoney(cents: number, currency = "USD"): string {
  const abs = fmtMoney(Math.abs(cents), currency);
  if (cents > 0) return `+${abs}`;
  if (cents < 0) return `-${abs}`;
  return abs;
}

export function centsToApiValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function shortId(id: string | null | undefined, keep = 14): string {
  if (!id) return "-";
  return id.length > keep ? `${id.slice(0, keep)}...` : id;
}
