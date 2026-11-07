/**
 * SwitchCart — seeded demo catalog.
 * Exactly one demo merchant ("NOVA Supply Co.") with 12 realistic products.
 * `tags` are used by the AI/rule engine to match buyer preferences,
 * `hue` drives the CSS product-tile artwork, `icon` maps to a Lucide icon.
 */

export const SEED_MERCHANT = {
  id: "nova",
  name: "NOVA Supply Co.",
};

export interface SeedProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  priceCents: number;
  tags: string[];
  icon: string;
  hue: number;
  inStock: boolean;
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    id: "aurora-headphones",
    name: "Aurora Wireless Headphones",
    category: "Audio",
    description: "Over-ear ANC headphones, 40h battery, USB-C fast charge.",
    priceCents: 18900,
    tags: ["audio", "wireless", "premium", "black"],
    icon: "headphones",
    hue: 222,
    inStock: true,
  },
  {
    id: "pulse-speaker",
    name: "Pulse Bluetooth Speaker",
    category: "Audio",
    description: "Pocket-size 360° speaker, IP67, 18h playtime.",
    priceCents: 7900,
    tags: ["audio", "wireless", "travel", "blue"],
    icon: "speaker",
    hue: 199,
    inStock: true,
  },
  {
    id: "studio-earbuds",
    name: "Studio Buds Pro",
    category: "Audio",
    description: "True-wireless earbuds with adaptive ANC and wireless charging.",
    priceCents: 12900,
    tags: ["audio", "wireless", "compact", "white"],
    icon: "audio-lines",
    hue: 265,
    inStock: true,
  },
  {
    id: "orbit-keyboard",
    name: "Orbit Mechanical Keyboard",
    category: "Workspace",
    description: "Hot-swappable 75% board, gasket mount, southpaw friendly.",
    priceCents: 14900,
    tags: ["workspace", "mechanical", "rgb", "white"],
    icon: "keyboard",
    hue: 45,
    inStock: true,
  },
  {
    id: "glide-mouse",
    name: "Glide Ergonomic Mouse",
    category: "Workspace",
    description: "Silent-click vertical mouse, 4K DPI, multi-device pairing.",
    priceCents: 5900,
    tags: ["workspace", "ergonomic", "compact", "black"],
    icon: "mouse",
    hue: 160,
    inStock: true,
  },
  {
    id: "beam-desk-lamp",
    name: "Beam LED Desk Lamp",
    category: "Workspace",
    description: "Eye-care desk lamp with auto-dim sensor and wireless charger base.",
    priceCents: 6900,
    tags: ["workspace", "lighting", "minimalist", "white"],
    icon: "lamp-desk",
    hue: 48,
    inStock: true,
  },
  {
    id: "terra-bottle",
    name: "Terra Insulated Bottle",
    category: "On-the-go",
    description: "750ml vacuum steel bottle, keeps drinks cold for 30 hours.",
    priceCents: 2900,
    tags: ["travel", "steel", "eco", "green"],
    icon: "glass-water",
    hue: 140,
    inStock: true,
  },
  {
    id: "nomad-backpack",
    name: "Nomad Travel Backpack",
    category: "On-the-go",
    description: "22L weatherproof canvas pack with hidden laptop vault.",
    priceCents: 11900,
    tags: ["travel", "canvas", "premium", "black"],
    icon: "backpack",
    hue: 25,
    inStock: true,
  },
  {
    id: "ember-mug",
    name: "Ember Smart Mug",
    category: "Home",
    description: "Temperature-controlled ceramic mug with app presets.",
    priceCents: 9900,
    tags: ["home", "smart", "ceramic", "black"],
    icon: "coffee",
    hue: 18,
    inStock: true,
  },
  {
    id: "clarity-webcam",
    name: "Clarity 4K Webcam",
    category: "Workspace",
    description: "4K Sony-sensor webcam with HDR and AI framing.",
    priceCents: 13900,
    tags: ["workspace", "video", "streaming", "black"],
    icon: "webcam",
    hue: 210,
    inStock: true,
  },
  {
    id: "volt-hub",
    name: "Volt 7-in-1 USB-C Hub",
    category: "Workspace",
    description: "HDMI 4K60, 100W PD pass-through, dual SD readers.",
    priceCents: 8900,
    tags: ["workspace", "usb-c", "compact", "silver"],
    icon: "usb",
    hue: 200,
    inStock: true,
  },
  {
    id: "drift-stand",
    name: "Drift Laptop Stand",
    category: "Workspace",
    description: "CNC aluminum riser, foldable, fits up to 16-inch laptops.",
    priceCents: 4900,
    tags: ["workspace", "aluminum", "ergonomic", "silver"],
    icon: "monitor",
    hue: 230,
    inStock: true,
  },
];

/** Preference facets offered to buyers on the storefront. */
export const PREF_TAGS = [
  "audio",
  "wireless",
  "travel",
  "workspace",
  "compact",
  "premium",
  "eco",
  "smart",
] as const;

export const PREF_COLORS = ["black", "white", "blue", "green", "silver"] as const;
