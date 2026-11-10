/**
 * PayPal authorization settlement policy for the USD-only demo catalog.
 *
 * Buyer-initiated authorizations can be captured for up to 115% of the
 * original amount, capped at a $75 increase, with buyer consent.
 * Reauthorization is NOT an immediate top-up: it is available after the
 * initial three-day honor period, within the 29-day authorization period.
 * An increased amount may be reauthorized only once.
 *
 * PayPal remains the final authority. This conservative guard uses calendar
 * days in America/Los_Angeles and never invents eligibility when metadata is
 * missing. Unsupported increases fail safely before a payment API call.
 */
export interface SettlementInput {
  authorizedCents: number;
  finalCents: number;
  currency: string;
  authorizedAt: Date | null;
  increaseUsed: boolean;
  now?: Date;
}

export type SettlementPlan =
  | { kind: "capture"; reason: string }
  | { kind: "reauthorize"; reason: string }
  | { kind: "blocked"; reason: string };

function pacificCalendarDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000;
}

export function maximumCaptureCents(authorizedCents: number): number {
  return Math.min(Math.floor(authorizedCents * 115 / 100), authorizedCents + 7_500);
}

export function planSettlement(input: SettlementInput): SettlementPlan {
  const { authorizedCents, finalCents, currency, authorizedAt, increaseUsed } = input;
  if (!Number.isSafeInteger(authorizedCents) || !Number.isSafeInteger(finalCents) || authorizedCents <= 0 || finalCents <= 0) {
    return { kind: "blocked", reason: "Amounts must be positive integer cents." };
  }
  if (currency !== "USD") {
    return { kind: "blocked", reason: "This demo's increase policy supports USD only." };
  }
  if (finalCents <= authorizedCents) {
    return { kind: "capture", reason: "Capture the consented amount without increasing the authorization." };
  }
  if (finalCents > maximumCaptureCents(authorizedCents)) {
    return { kind: "blocked", reason: "The replacement exceeds PayPal's increase limit (115% of the original, at most $75 extra). A new checkout is required; decline to release the existing hold." };
  }
  if (!authorizedAt || !Number.isFinite(authorizedAt.getTime())) {
    return { kind: "blocked", reason: "Authorization timestamp is missing; an increased capture cannot be validated safely. Decline to void the hold." };
  }
  const now = input.now ?? new Date();
  const ageDays = pacificCalendarDay(now) - pacificCalendarDay(authorizedAt);
  if (ageDays < 0) {
    return { kind: "blocked", reason: "Authorization timestamp is in the future." };
  }
  if (ageDays < 3) {
    return { kind: "capture", reason: "Within the initial honor period: capture the explicitly consented, allowed increase directly. Immediate reauthorization is not supported." };
  }
  if (ageDays >= 29) {
    return { kind: "blocked", reason: "The 29-day authorization period has ended. A new checkout is required." };
  }
  if (increaseUsed) {
    return { kind: "blocked", reason: "The one permitted amount-increasing reauthorization has already been used." };
  }
  return { kind: "reauthorize", reason: "Initial honor period has elapsed: reauthorize the consented increase, then capture the new authorization." };
}
