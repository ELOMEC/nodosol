/**
 * Venue layout templates — used by the event detail page to render a clickable
 * floor map next to the tier list. Each template defines labelled regions with
 * SVG polygon `d` attributes; the region's `tierRef` maps to the `sectionCode`
 * of a TicketTier on-chain.
 *
 * Templates are intentionally schematic (not pixel-accurate venue plans) — they
 * communicate the idea of categories/zones without needing a custom SVG per
 * event. Layouts are chosen by setting `venueTemplate` on a seed event / set
 * by the creator when they publish.
 */

export type VenueRegion = {
  /** Matches TicketTier.section_code in on-chain state. */
  tierRef: string;
  label: string;
  /** SVG path `d` in the template's 0–1000 coordinate space. */
  d: string;
  /** Optional text label position — defaults to region centroid. */
  labelAnchor?: { x: number; y: number };
};

export type VenueTemplate = {
  id: string;
  name: string;
  /** SVG viewBox — every `d` value is in this coordinate space. */
  viewBox: string;
  /** Stage / pitch / focus region rendered statically (no tier, just context). */
  stage?: { d: string; label: string };
  regions: VenueRegion[];
  /** Optional floor-plan image rendered under the zones (custom layouts only). */
  backgroundUrl?: string;
};

export const VENUE_TEMPLATES: Record<string, VenueTemplate> = {
  // Circular arena (basketball / concert in-the-round) — stage at bottom,
  // lower bowl 100-level, upper bowl 200-level, floor in front of stage, SRO.
  "arena-circle": {
    id: "arena-circle",
    name: "Circular arena",
    viewBox: "0 0 1000 700",
    stage: { d: "M 400 620 L 600 620 L 600 680 L 400 680 Z", label: "STAGE" },
    regions: [
      // Floor (in front of stage)
      { tierRef: "FLOOR", label: "Floor", d: "M 360 480 L 640 480 L 640 620 L 360 620 Z", labelAnchor: { x: 500, y: 550 } },
      // 100-level lower bowl — 6 wedges around the stage
      { tierRef: "101", label: "101", d: "M 220 440 L 360 440 L 360 620 L 240 620 L 180 540 Z", labelAnchor: { x: 275, y: 540 } },
      { tierRef: "102", label: "102", d: "M 640 440 L 780 440 L 820 540 L 760 620 L 640 620 Z", labelAnchor: { x: 725, y: 540 } },
      { tierRef: "103", label: "103", d: "M 220 300 L 360 300 L 360 440 L 220 440 L 170 380 Z", labelAnchor: { x: 265, y: 380 } },
      { tierRef: "104", label: "104", d: "M 640 300 L 780 300 L 830 380 L 780 440 L 640 440 Z", labelAnchor: { x: 735, y: 380 } },
      { tierRef: "105", label: "105", d: "M 360 240 L 500 220 L 640 240 L 640 300 L 360 300 Z", labelAnchor: { x: 500, y: 270 } },
      // 200-level upper bowl
      { tierRef: "201", label: "201", d: "M 150 400 L 220 440 L 180 540 L 100 580 Z", labelAnchor: { x: 160, y: 500 } },
      { tierRef: "202", label: "202", d: "M 850 400 L 780 440 L 820 540 L 900 580 Z", labelAnchor: { x: 840, y: 500 } },
      { tierRef: "203", label: "203", d: "M 150 400 L 220 440 L 220 300 L 130 260 Z", labelAnchor: { x: 165, y: 350 } },
      { tierRef: "204", label: "204", d: "M 850 400 L 780 440 L 780 300 L 870 260 Z", labelAnchor: { x: 835, y: 350 } },
      { tierRef: "205", label: "205", d: "M 360 180 L 500 160 L 640 180 L 640 240 L 500 220 L 360 240 Z", labelAnchor: { x: 500, y: 200 } },
      // SRO behind 200-level
      { tierRef: "SRO", label: "SRO", d: "M 100 150 L 900 150 L 900 250 L 870 260 L 640 180 L 500 160 L 360 180 L 130 260 L 100 250 Z", labelAnchor: { x: 500, y: 200 } },
    ],
  },

  // Open-air festival — front pit, mid, VIP platforms, general admission lawn.
  "open-air": {
    id: "open-air",
    name: "Open-air festival",
    viewBox: "0 0 1000 600",
    stage: { d: "M 300 30 L 700 30 L 700 90 L 300 90 Z", label: "STAGE" },
    regions: [
      { tierRef: "PIT",   label: "Front pit",    d: "M 320 110 L 680 110 L 680 200 L 320 200 Z", labelAnchor: { x: 500, y: 155 } },
      { tierRef: "VIP-L", label: "VIP Left",     d: "M 80 110  L 300 110 L 300 260 L 80  260 Z", labelAnchor: { x: 185, y: 185 } },
      { tierRef: "VIP-R", label: "VIP Right",    d: "M 700 110 L 920 110 L 920 260 L 700 260 Z", labelAnchor: { x: 810, y: 185 } },
      { tierRef: "MID",   label: "Mid floor",    d: "M 200 220 L 800 220 L 800 380 L 200 380 Z", labelAnchor: { x: 500, y: 300 } },
      { tierRef: "GA",    label: "General Admission lawn", d: "M 80 400 L 920 400 L 920 560 L 80 560 Z", labelAnchor: { x: 500, y: 480 } },
    ],
  },

  // Theatre / proscenium — fan-shaped orchestra + circle + balcony.
  "theatre": {
    id: "theatre",
    name: "Theatre",
    viewBox: "0 0 1000 600",
    stage: { d: "M 350 520 L 650 520 L 650 580 L 350 580 Z", label: "STAGE" },
    regions: [
      { tierRef: "ORCH-A", label: "Orchestra A (front)",  d: "M 300 420 L 700 420 L 700 520 L 300 520 Z", labelAnchor: { x: 500, y: 470 } },
      { tierRef: "ORCH-B", label: "Orchestra B (mid)",    d: "M 250 320 L 750 320 L 750 420 L 250 420 Z", labelAnchor: { x: 500, y: 370 } },
      { tierRef: "CIRCLE-L", label: "Circle Left",        d: "M 120 200 L 330 220 L 330 320 L 120 320 Z", labelAnchor: { x: 220, y: 260 } },
      { tierRef: "CIRCLE-C", label: "Circle Center",      d: "M 330 220 L 670 220 L 670 320 L 330 320 Z", labelAnchor: { x: 500, y: 270 } },
      { tierRef: "CIRCLE-R", label: "Circle Right",       d: "M 670 220 L 880 200 L 880 320 L 670 320 Z", labelAnchor: { x: 780, y: 260 } },
      { tierRef: "BALC",   label: "Balcony",              d: "M 160 60  L 840 60  L 840 200 L 670 220 L 330 220 L 160 200 Z", labelAnchor: { x: 500, y: 135 } },
    ],
  },

  // Conference hall — simple rectangles: stage/front/mid/back + sides
  "conference": {
    id: "conference",
    name: "Conference hall",
    viewBox: "0 0 1000 600",
    stage: { d: "M 350 50 L 650 50 L 650 110 L 350 110 Z", label: "STAGE" },
    regions: [
      { tierRef: "FRONT", label: "Front rows",        d: "M 200 140 L 800 140 L 800 260 L 200 260 Z", labelAnchor: { x: 500, y: 200 } },
      { tierRef: "MID",   label: "Mid rows",          d: "M 200 280 L 800 280 L 800 400 L 200 400 Z", labelAnchor: { x: 500, y: 340 } },
      { tierRef: "BACK",  label: "Back rows",         d: "M 200 420 L 800 420 L 800 540 L 200 540 Z", labelAnchor: { x: 500, y: 480 } },
      { tierRef: "SIDE-L", label: "Side Left",        d: "M 60 140 L 180 140 L 180 540 L 60 540 Z",   labelAnchor: { x: 120, y: 340 } },
      { tierRef: "SIDE-R", label: "Side Right",       d: "M 820 140 L 940 140 L 940 540 L 820 540 Z", labelAnchor: { x: 880, y: 340 } },
    ],
  },
};

export function getVenueTemplate(id: string): VenueTemplate | null {
  return VENUE_TEMPLATES[id] ?? null;
}
