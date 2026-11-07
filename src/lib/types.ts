/**
 * Shared DTO types. This file has no server-only imports, so both
 * API routes and client components can use it safely.
 */

export type OrderStatus =
  | "CREATED"
  | "PENDING_APPROVAL"
  | "AUTHORIZED"
  | "SUBSTITUTION_NEEDED"
  | "AWAITING_CONSENT"
  | "CAPTURED"
  | "VOIDED"
  | "CANCELLED"
  | "ERROR";

export type PayPalMode = "sandbox" | "simulation";

export interface ProductDTO {
  id: string;
  merchantId: string;
  name: string;
  category: string;
  description: string;
  priceCents: number;
  currency: string;
  tags: string[];
  icon: string;
  hue: number;
  inStock: boolean;
}

export interface BuyerPrefs {
  tags: string[];
  colors: string[];
  /** Maximum extra amount (cents) a buyer is willing to pay for a swap. */
  maxDeltaCents: number | null;
}

export interface SuggestionDTO {
  productId: string;
  name: string;
  category: string;
  priceCents: number;
  currency: string;
  /** replacement price minus original price (cents). */
  diffCents: number;
  rationale: string;
  icon: string;
  hue: number;
  tags: string[];
}

export interface SubstitutionDTO {
  id: string;
  orderId: string;
  decision: "pending" | "accepted" | "declined" | "expired";
  suggestions: SuggestionDTO[];
  chosenProductId: string | null;
  aiProvider: string;
  aiModel: string | null;
  createdAt: string;
}

export interface AuditEventDTO {
  id: number;
  orderId: string | null;
  actor: string;
  event: string;
  message: string | null;
  paypalRequestId: string | null;
  paypalDebugId: string | null;
  httpStatus: number | null;
  simulated: boolean;
  request: unknown;
  response: unknown;
  createdAt: string;
}

export interface OrderDTO {
  id: string;
  status: OrderStatus;
  merchantId: string;
  product: ProductDTO;
  replacement: ProductDTO | null;
  buyerName: string;
  buyerEmail: string;
  prefs: BuyerPrefs;
  currency: string;
  amountCents: number;
  finalAmountCents: number | null;
  paypalOrderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  paypalStatus: string | null;
  mode: PayPalMode;
  approveUrl: string | null;
  error: string | null;
  substitution: SubstitutionDTO | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigDTO {
  paypalClientId: string | null;
  mode: PayPalMode;
  merchantName: string;
  aiConfigured: boolean;
  aiModel: string | null;
}

export interface ApiErrorBody {
  error: string;
  code: string;
}
