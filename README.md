# ChemPulse: chemical price trends

A stock-market-style dashboard for spotting chemical price trends: 30 chemicals, 21 driver markets
(crude, gas, propane, rupee, China futures), India's monthly import flows, and individual sellers' asking
prices by city (IndiaMART, TradeIndia, imported briefs) for 46 products. Free data only, refreshed every 3 hours.

```
Free sources ──► Python collector (GitHub Actions, every 3 h) ──► MongoDB Atlas ──► Next.js website
                 saves a price only if it is new or changed                        (cached, refreshed after each run)
```

## Run it locally

```powershell
npm install
npm run dev            # http://localhost:3000
```

With no `MONGODB_URI` set, the site reads the JSON files in `data/snapshot/`, which already hold real data
(10 years of daily prices, India imports from Oct 2022, origin countries, news).

### Run the data collector

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r collector\requirements.txt

.\.venv\Scripts\python -m collector.run --sink json           # update data/snapshot
.\.venv\Scripts\python -m collector.run --only futures fx      # just some sources
.\.venv\Scripts\python -m collector.run --force                # ignore the per-source intervals
```

Per-source schedule inside each run: futures, FRED and FX every run; news (incl. regulatory alerts) every 6 h;
Tradestat once a day (it downloads only months it does not have yet, and re-checks the last two months weekly);
IndiaMART and TradeIndia every run, each working through a queue of product and city pages:

| Marketplace | Pace | Per run | Full pass |
|---|---|---|---|
| TradeIndia | a page every 2.5–4 s | up to 250 pages / 10 min | about a day |
| IndiaMART | a page every 10–16 s | up to 40 pages / 9 min | about three days (it answers 429 to fast visitors) |

A site that answers 403/429 or shows a CAPTCHA is paused for 6 hours. Only robots.txt-allowed public pages
are read; nothing tries to get around blocks. Note: IndiaMART's Terms of Use prohibit compiling its listings
into a database without written permission; including it was a deliberate decision by the owner of this project.

```powershell
.\.venv\Scripts\python -m collector.run --only tradeindia --budget 40   # long manual crawl
.\.venv\Scripts\python -m collector.recheck            # after editing config/products.json (add --apply)
```

## Connect MongoDB Atlas

1. Create a free M0 cluster, a database user, and allow network access (`0.0.0.0/0` for GitHub Actions and Vercel).
2. Copy `.env.example` to `.env.local` and set `MONGODB_URI` (and `MONGODB_DB`, default `chempulse`).
3. Load the existing history into Atlas once (only new or changed values are written, so it's safe to repeat):
   ```powershell
   $env:MONGODB_URI="mongodb+srv://..."; .\.venv\Scripts\python -m collector.seed_mongo
   ```
4. Restart `npm run dev`. The Data & methods page shows "Storage: MongoDB Atlas".

Collections: `points` (one doc per series per date, unique on `s`+`t`), `series`, `origins`, `news`, `runs`, `state`, `quotes`,
`listings` + `listing_prices` (seller asks and their history), `crawl` (where each marketplace queue stopped), `briefs`, `watchlist`.

## Deploy

**Collector (GitHub Actions, free):** push this folder to a GitHub repo (public or private, see minutes below), then under
*Settings → Secrets and variables → Actions* add:

| Name | Kind | Value |
|---|---|---|
| `MONGODB_URI` | secret | Atlas connection string |
| `REVALIDATE_SECRET` | secret | any long random string (same as the website) |
| `SITE_URL` | variable | leave empty while the site runs only on your PC (it then refreshes from Atlas within 10 min) |
| `MONGODB_DB` | variable | optional, default `chempulse` |
| `MARKET_MINUTES` | variable | optional; `1` for private repos (see below) |

`.github/workflows/collect.yml` runs at 00:15, 03:15, 06:15 … UTC (every 3 hours; GitHub may start a few minutes
late) and from the Actions tab with *Run workflow*. Each run: futures, FRED, FX, Tradestat (new months only), the next
slice of each marketplace queue, news when the last news run is ≥ 6 h old, then the data checks.

GitHub minutes: a full run takes ~30 min, i.e. ~7,200 min/month at 8 runs a day. Public repos have no limit.
Private repos on the free plan get 2,000 min/month, so add the repo variable `MARKET_MINUTES` = `1`
(~6–8 min per run); seller pages then refresh more slowly. Public repos: scheduled runs pause after 60 days
without a commit (GitHub emails you; *Enable workflow* turns them back on).

**Website:** Vercel (import the repo) or Render. Set `MONGODB_URI`, `MONGODB_DB`, `SITE_PASSWORD`, `AUTH_SECRET`,
`REVALIDATE_SECRET`. With `SITE_PASSWORD` set, every page asks for the password (single user).
Vercel's free plan is meant for non-commercial use; Render's free web service is the fallback (it sleeps when idle).

## Seller prices

- `config/products.json` lists the 46 seller-tracked products: title patterns (`include` / `exclude`),
  density for litre prices, and candidate page names on IndiaMART (`im`) and TradeIndia (`ti`). ExportersIndia page
  names are found automatically.
- Each listing is converted to ₹/kg (litres via density, drums/bags via the stated pack). Lab grades, packs of
  5 kg/L or less, foreign-currency prices and anything over 3× / under ⅓ of the product median are kept but left
  out of medians. Towns are grouped into trading regions (`lib/regions.ts`).
- **Import a brief** (`/brief/import`): paste a brief laid out as Company · Product · Price under city headings.
  Rows are matched to products and stored as listings; importing a newer brief records price changes.
- Pages: Daily brief (auto-generated, rule-based), Suppliers (directory + company profiles), City prices,
  and a seller page per product (`/products/<id>`).

## Add or change a chemical

Edit `config/catalog.json`; both the collector and the website read it.

```json
{ "id": "toluene", "name": "Toluene", "short": "TOL", "category": "solvents", "cas": "108-88-3",
  "hs": ["290230"], "daily": null, "drivers": ["cn-benzene", "brent"], "density": 0.867,
  "news": "toluene", "about": "…" }
```

- `hs`: 6-digit Indian HS codes for the import data (several codes are added together).
- `daily`: id of a market in `markets` when a China futures contract exists, else `null` (monthly only).
- `drivers`: markets shown in "Price vs its drivers".
- `news`: search terms separated by `|`; short acronyms (e.g. `PVC`) must appear in the headline.

To add a new futures contract, add a `markets` entry with `source: "futures"` and the AkShare/Sina symbol (e.g. `PP0`).

## Where the numbers come from

| Source | Gives | Freshness |
|---|---|---|
| China futures (DCE/ZCE/SHFE via AkShare) | 15 contracts, daily OHLC | Every trading day |
| FRED / US EIA | Brent, WTI, Henry Hub gas, propane | Daily, a few days late |
| ECB via Frankfurter | USD/INR, CNY/INR | Daily |
| Tradestat (DGCI&S) | India imports by HS code: kg, ₹ value, origin countries | Monthly, ~6–8 weeks late |
| Google News RSS | Headlines per chemical + regulatory alerts (DGTR, BIS, CBIC, FSSAI, CDSCO, CIB&RC) | Every 6 h |
| IndiaMART | Seller listings: company, city, asking price, pack, grade, years on site, rating | Rolling, ~3-day pass |
| TradeIndia | Seller listings with manufacturer / trader / exporter flags | Rolling, ~1-day pass |
| ExportersIndia | Seller listings, city, asking price, years on site | Rolling |
| Pasted briefs | Filed under the marketplace they came from, marked "via brief" | When you paste one |

**Currency:** Settings → *Show prices in* switches every price on the site between ₹, US$ and the original units.
Charts convert each day at that day's ECB rate; single numbers use the latest rate.

**Data checks** (run after every collection, shown on *Data & methods*): futures bars consistent (low ≤ open/close ≤
high), no unexplained day-to-day jump above 20%, ECB exchange rates within 1% of the US Federal Reserve's, crude/gas
inside sane ranges, India import prices 0.6–1.7× the China futures price for the same month, tracked imports below
India's total, and every source updated recently.

Every calculation (trend, strength, unusual move, correlation, seasonality, import-price outlier filter) is in
`lib/analytics.ts` and explained on the site's **Data & methods** page.

## Known limits

- Seller prices are advertised asking prices, not transaction prices; coverage per city grows as the
  collectors work through their queues. No free source gives buyer names.
- Tradestat is an Indian government site and the marketplaces may slow down requests from GitHub's US servers.
  If a source keeps failing there, run the collector from your own PC instead: Windows Task Scheduler, every 3 hours,
  action `C:\…\chempulse\.venv\Scripts\python.exe`, arguments `-m collector.run --sink mongo`, start in the project
  folder (it reads `MONGODB_URI` from `.env.local`).
- China futures use the continuous most-traded contract; a contract switch can show as a small jump.

## Project map

```
app/(app)/        pages: overview, screener, heatmap, compare, imports, markets, alerts, news, data, chemical/[id], market/[id]
app/api/          series data, quotes, login, revalidate
components/       charts (lightweight-charts + SVG), shell (sidebar, ticker, search, tour), page views
lib/              analytics, board (summary rows + signals), detail (chemical page), repo (Mongo/JSON)
collector/        Python collector: run.py, store.py, sources/*.py, seed_mongo.py
config/           catalog.json (chemicals, markets, categories)
data/snapshot/    local data used when MONGODB_URI is not set
```
