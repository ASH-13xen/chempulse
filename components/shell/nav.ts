import { BellRing, Database, Factory, FileText, Grid3x3, GitCompareArrows, LayoutDashboard, MapPin, Newspaper, Ship, Star, Store, Table2 } from "lucide-react";

export const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, key: "o", desc: "Market overview, movers and signals" },
  { href: "/watchlist", label: "Watchlist", icon: Star, key: "w", desc: "Everything you chose to follow, by category" },
  { href: "/brief", label: "Daily brief", icon: FileText, key: "b", desc: "Today's brief: top 5, city seller prices, outlook, alerts" },
  { href: "/screener", label: "Screener", icon: Table2, key: "s", desc: "Filter and sort every chemical" },
  { href: "/suppliers", label: "Suppliers", icon: Store, key: "u", desc: "Every seller found, by city, product and type" },
  { href: "/city-prices", label: "City prices", icon: MapPin, key: "r", desc: "Chennai vs Mumbai and other cities, ₹/kg" },
  { href: "/heatmap", label: "Heatmap", icon: Grid3x3, key: "h", desc: "Week-by-week and month-by-month moves" },
  { href: "/compare", label: "Compare", icon: GitCompareArrows, key: "c", desc: "Overlay chemicals and drivers" },
  { href: "/imports", label: "India imports", icon: Ship, key: "i", desc: "Monthly volumes, prices and origins" },
  { href: "/markets", label: "Markets & drivers", icon: Factory, key: "m", desc: "Crude, gas, currencies and China futures" },
  { href: "/alerts", label: "Signals & alerts", icon: BellRing, key: "a", desc: "Detected signals and your alert rules" },
  { href: "/news", label: "News", icon: Newspaper, key: "n", desc: "Recent headlines per chemical" },
  { href: "/data", label: "Data & methods", icon: Database, key: "d", desc: "Sources, freshness and how numbers are made" },
] as const;
