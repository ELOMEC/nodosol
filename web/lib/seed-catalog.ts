/**
 * Seed metadata catalog — consumed by /api/metadata/[slug] to serve the JSON
 * that on-chain metadata_uri values point at for seeded demo assets + events.
 *
 * Kept intentionally minimal (name/symbol/description/image) since anything
 * richer lives in the Anchor account state itself.
 */

export type SeedMetadata = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  /** Optional venue template id for events — matches VENUE_TEMPLATES in venue-templates.ts. */
  venueTemplate?: "arena-circle" | "open-air" | "theatre" | "conference";
};

export const SEED_METADATA: Record<string, SeedMetadata> = {
  "organic-wheat-pannonia": {
    name: "Organic Wheat Package — Pannonia",
    symbol: "OWP",
    description:
      "Certified organic winter wheat from Pannonian farms. 1 token = 1 tonne, delivered FOB Belgrade port.",
    image: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=900&q=80",
  },
  "barley-harvest-23": {
    name: "Pannonian Barley Harvest",
    symbol: "PBL",
    description: "Two-row malting barley, 11.5% protein, suitable for breweries. 1 token = 1 tonne.",
    image: "https://images.unsplash.com/photo-1601593768799-76e8261aa1be?w=900&q=80",
  },
  "apple-orchard-yields": {
    name: "Apple Orchard Yields",
    symbol: "APL",
    description:
      "Mixed-variety table apples (Idared, Granny Smith, Jonagold). 1 token = 1 crate (18 kg).",
    image: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=900&q=80",
  },
  "plum-crop-fruska-gora": {
    name: "Plum Crop — Fruška Gora",
    symbol: "PLM",
    description:
      "Premium Pozegača plums for fresh and dried market. 1 token = 1 crate (10 kg).",
    image: "https://images.unsplash.com/photo-1500828060116-fb40c66898e6?w=900&q=80",
  },
  "honey-cooperative": {
    name: "Highland Honey Cooperative",
    symbol: "HNY",
    description:
      "Raw acacia honey from Tara mountain apiaries. 1 token = 1 kg jar with cooperative seal.",
    image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=900&q=80",
  },
  "olive-oil-reserve": {
    name: "Mediterranean Olive Oil Reserve",
    symbol: "OIL",
    description:
      "First cold pressed extra-virgin olive oil from Adriatic groves. 1 token = 1 L bottle.",
    image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=900&q=80",
  },
  "mountain-cheese-aged": {
    name: "Mountain Cheese — 12-month Aged",
    symbol: "CHS",
    description: "Hard sheep cheese aged 12 months in Durmitor caves. 1 token = 1 kg wedge.",
    image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=900&q=80",
  },
  "vineyard-fruska-gora": {
    name: "Vineyard Reserve — Fruška Gora",
    symbol: "VIN",
    description:
      "Bermet dessert wine from heritage Fruška Gora vineyards. 1 token = 1 bottle (0.5 L).",
    image: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=900&q=80",
  },
  "festival-exit-2026": {
    name: "Festival Pass — Summer 2026",
    symbol: "FST",
    description:
      "Three-day festival pass for the Summer 2026 edition. Includes camping access.",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=900&q=80",
  },
  "concert-philharmonic": {
    name: "Belgrade Philharmonic — Spring Series",
    symbol: "PHI",
    description: "Single-ticket admission to the Spring Concert Series. Seat assigned at check-in.",
    image: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=900&q=80",
  },
  "basketball-cup-final": {
    name: "Basketball Cup — Final Four",
    symbol: "B4F",
    description:
      "Two-day Final Four pass at Štark Arena. Both semi-finals and final included.",
    image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=80",
  },
  "theater-yugoslav-drama": {
    name: "Yugoslav Drama Theatre — Premiere Night",
    symbol: "YDT",
    description: "Premiere night seat for the spring production. Champagne reception included.",
    image: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=900&q=80",
  },
  "apartment-belgrade-vracar": {
    name: "Belgrade — Vračar Apartment Share",
    symbol: "VRC",
    description:
      "1/100th fractional ownership of a 65 m² Vračar apartment, professionally managed for short-term rental.",
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&q=80",
  },
  "mountain-cabin-tara": {
    name: "Mountain Cabin — Tara",
    symbol: "TARA",
    description: "1/50th fractional ownership of a Tara mountain cabin (90 m²), revenue-managed.",
    image: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=900&q=80",
  },
  "farmland-vojvodina": {
    name: "Vojvodina Farmland — 5 ha",
    symbol: "FRM",
    description:
      "1/50th of 5 hectares of class-1 Vojvodina farmland; lease income distributed to holders.",
    image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&q=80",
  },
  "warehouse-port-bar": {
    name: "Port of Bar Warehouse Slot",
    symbol: "WHB",
    description: "1/30th of a 1 200 m² bonded warehouse slot at the Port of Bar; long-lease income.",
    image: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=900&q=80",
  },
  "bond-balkan-infra-26": {
    name: "Balkan Infrastructure Bond 2026",
    symbol: "BIB",
    description:
      "Tokenised tranche of a private infrastructure bond, 7% coupon, 24-month tenor.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=900&q=80",
  },
  "equity-ag-coop": {
    name: "Pannonia Ag Cooperative Equity",
    symbol: "PAE",
    description:
      "Equity tranche in a 12-farm cooperative aggregating wheat, barley, and corn supply.",
    image: "https://images.unsplash.com/photo-1535398089889-dd807df1dfaa?w=900&q=80",
  },
  "carbon-tara-reforestation": {
    name: "Tara Reforestation Carbon Credit",
    symbol: "CO2",
    description: "VCS-verified 1 t CO₂ credits from Tara mountain reforestation programme.",
    image: "https://images.unsplash.com/photo-1511497584788-876760111969?w=900&q=80",
  },
  "olive-oil-export-pool": {
    name: "Olive Oil Export Pool — 2026",
    symbol: "OEP",
    description:
      "Pool exposure to the 2026 Adriatic olive oil export run. Settles in USDC at season close.",
    image: "https://images.unsplash.com/photo-1601000938259-9e92002320b2?w=900&q=80",
  },
  // Events --------------------------------------------------------------
  "event-exit-summer-2026": {
    name: "Exit Festival 2026",
    symbol: "EXT",
    description: "Four-day flagship festival at Petrovaradin Fortress, Novi Sad.",
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=900&q=80",
    venueTemplate: "open-air",
  },
  "event-sea-dance-2026": {
    name: "Sea Dance Festival 2026",
    symbol: "SDC",
    description: "Beachfront electronic music festival at Buljarica Bay.",
    image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=900&q=80",
    venueTemplate: "open-air",
  },
  "event-philharmonic-spring": {
    name: "Philharmonic Spring Series",
    symbol: "PSS",
    description: "Five-concert spring series at Kolarac Hall.",
    image: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=900&q=80",
    venueTemplate: "theatre",
  },
  "event-basketball-final-four": {
    name: "Basketball Cup — Final Four",
    symbol: "B4F",
    description: "ABA League Final Four at Štark Arena.",
    image: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=80",
    venueTemplate: "arena-circle",
  },
  "event-volleyball-grand-prix": {
    name: "Volleyball Grand Prix",
    symbol: "VGP",
    description: "International women's volleyball Grand Prix.",
    image: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=900&q=80",
    venueTemplate: "arena-circle",
  },
  "event-handball-cup-finale": {
    name: "Handball Cup Finale",
    symbol: "HCF",
    description: "ARKUS Handball Cup final weekend.",
    image: "https://images.unsplash.com/photo-1577962917302-cd874c4e31d2?w=900&q=80",
    venueTemplate: "arena-circle",
  },
  "event-theatre-premiere-night": {
    name: "Drama Theatre Premiere Night",
    symbol: "DTH",
    description: "Yugoslav Drama Theatre season opener.",
    image: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=900&q=80",
    venueTemplate: "theatre",
  },
  "event-tech-conference-bg": {
    name: "Belgrade Tech Conference 2026",
    symbol: "BTC",
    description: "Two-day developer + founder conference at Sava Centar.",
    image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=900&q=80",
    venueTemplate: "conference",
  },
  "event-wine-fair-fruska": {
    name: "Fruška Gora Wine Fair",
    symbol: "FWF",
    description: "Annual Fruška Gora wine fair with 40 wineries.",
    image: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=900&q=80",
    venueTemplate: "conference",
  },
  "event-exhibition-modern-art": {
    name: "Museum of Contemporary Art — Spring Exhibit",
    symbol: "MCA",
    description: "90-day spring exhibition at MoCA Belgrade.",
    image: "https://images.unsplash.com/photo-1577720580479-7d839d829c73?w=900&q=80",
    venueTemplate: "theatre",
  },
};
