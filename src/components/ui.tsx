import {
  AudioLines,
  Backpack,
  Coffee,
  GlassWater,
  Headphones,
  Keyboard,
  LampDesk,
  Monitor,
  Mouse,
  Package,
  Speaker,
  Usb,
  Webcam,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { OrderStatus } from "@/lib/types";
import { fmtSignedMoney } from "@/lib/format";

const ICONS: Record<string, LucideIcon> = {
  headphones: Headphones,
  speaker: Speaker,
  "audio-lines": AudioLines,
  keyboard: Keyboard,
  mouse: Mouse,
  "lamp-desk": LampDesk,
  "glass-water": GlassWater,
  backpack: Backpack,
  coffee: Coffee,
  webcam: Webcam,
  usb: Usb,
  monitor: Monitor,
};

export function ProductIcon({
  icon,
  size = 30,
  strokeWidth = 1.7,
}: {
  icon: string;
  size?: number;
  strokeWidth?: number;
}) {
  const Cmp = ICONS[icon] ?? Package;
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

export function Tile({
  icon,
  hue,
  size = 30,
  className = "",
  style,
}: {
  icon: string;
  hue: number;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`prod-tile ${className}`}
      style={{ "--hue": hue, ...style } as CSSProperties}
      aria-hidden="true"
    >
      <ProductIcon icon={icon} size={size} />
    </div>
  );
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: "Created",
  PENDING_APPROVAL: "Awaiting PayPal approval",
  AUTHORIZED: "Authorization held",
  SUBSTITUTION_NEEDED: "Out of stock — swap needed",
  AWAITING_CONSENT: "Awaiting buyer consent",
  CAPTURED: "Captured",
  VOIDED: "Voided",
  CANCELLED: "Cancelled",
  ERROR: "Error",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <span className="badge-dot" aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function StockBadge({ inStock }: { inStock: boolean }) {
  return (
    <span className={`badge ${inStock ? "badge-stock-in" : "badge-stock-out"}`}>
      <span className="badge-dot" aria-hidden="true" />
      {inStock ? "In stock" : "Out of stock"}
    </span>
  );
}

interface StepperProps {
  steps: string[];
  /** Index of the currently active step (-1 = none). */
  active: number;
  /** Style the active step as failed. */
  failed?: boolean;
  /** Steps before this index are rendered complete. Defaults to `active`. */
  doneUntil?: number;
}

export function Stepper({ steps, active, failed = false, doneUntil }: StepperProps) {
  const done = doneUntil ?? active;
  return (
    <ol className="stepper" aria-label="Checkout progress">
      {steps.map((label, i) => {
        const cls =
          i === active
            ? failed
              ? "step failed"
              : "step active"
            : i < done
              ? "step done"
              : "step";
        const current = i === active ? ("step" as const) : undefined;
        return (
          <li key={label} className={cls} aria-current={current}>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Spinner({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`spinner ${large ? "spinner-lg" : ""}`}
      role="status"
      aria-label="Working"
    />
  );
}

/** Exact price difference with sign and color. */
export function PriceDiff({ cents, currency }: { cents: number; currency: string }) {
  const cls = cents > 0 ? "diff-up" : cents < 0 ? "diff-down" : "diff-flat";
  const label =
    cents > 0 ? "buyer pays more" : cents < 0 ? "buyer saves money" : "no price change";
  return (
    <span className={`mono text-sm font-semibold ${cls}`} aria-label={`${fmtSignedMoney(cents, currency)} — ${label}`}>
      {fmtSignedMoney(cents, currency)}
    </span>
  );
}
