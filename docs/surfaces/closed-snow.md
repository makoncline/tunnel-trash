# Closed Snow

Scope: `/closed-snow`. Public dark-mode ski conditions and snow-stake viewer. Keep the store unchanged and this page unlinked and noindex. Everything on `/closed-snow` is public and loads from public endpoints only.

## Display

2026-11-21: The page is always dark mode, including `html`/`body` background and `theme-color: #111516`. The header shows the ski day (`Today` or `For tomorrow`). A compact filter bar above the cards filters by pass (`All`, `Epic`, `Ikon`), `Open`, `New snow`, and sort order (`Fresh`, `5-day`, `Base`). When live captures differ from morning pre-open captures, a floating bottom `Morning | Now` pill bar switches all cards for phone thumb access, and each card image shows a two-state `Before clear | Now` (or `Opening | Now`) pill to switch that card in place. A floating bottom-right feedback button opens a quick dialog (`16px` textarea to prevent iOS zoom, top-anchored on phones) that attaches lightweight view context to submitted notes.

Each card leads with the complete native stake view. Tapping `Timelapse` plays the default `Since close` clip inline inside the card with its gauge overlay, live frame timestamp, `Stop`, and `Expand` controls. Pressing and holding a still image shows its saved clear reference, then restores the image on release. Hide `uncertain` snow-band chips on cards; show only `none`, `some`, `lots`, or `extreme`. The resort-name row shows the resort name, `Base`, and the operating-status link (`Open · X/Y lifts ↗` when lift counts are available, or `Open ↗` / `Closed ↗`) to the resort's official terrain/snow report page. Keep nearby SNOTEL snowpack details (station, SWE, depth, 1991–2020 daily median, and caveat) inside `More` rather than on the card front. Below the header, show the public NWS ski-day forecast (9 a.m.–4 p.m. Mountain temp range, conditions, and sustained wind) when available, followed by the five-day Prev 5 bar row and today's overnight snow hero box.

The enlarged camera dialog lets skiers switch directly between the morning capture, `Now`, `Clear stake`, and compact timelapse range buttons (`Since close`, `Pre-clear`, `24h`, `48h`, `72h`), with controls placed at the bottom on phones. Timelapses have 44px previous/play/next controls, an exact capture timestamp, and a frame slider below the video. Pause and step through the 72 encoded frames using the producer's timestamp map. Gauge controls offer `Back gauges`, `Diagonal gauges` where supplied, and `No guides`. Escape, close, and focus return must work.

## Data

Use the independent public Closed Snow API (`https://closed-snow.makon.dev`) and immutable assets. Cards combine `/v1/morning.json`, `/v1/current.json`, `/v1/conditions.json`, and `/v1/brief.json`, plus public National Weather Service hourly forecasts (`api.weather.gov`) cached server-side for the next complete 9 a.m.–4 p.m. Mountain ski-day window. Validate each resort entry separately. The producer owns selection, clearing evidence, and calibrated SVGs. The page does not estimate snow or calibrate images. `clearedReference` is a fixed reviewed empty-platform image with its original date; it is not today's clearing result. Keep image bytes clean and guides separate.

Refresh once per minute and when the page becomes visible. Show resort reports only after a successful conditions read with a valid build time and the current America/Denver date. A build can be up to 15 minutes old or up to 5 minutes in the future. Keep valid resorts when only some entries fail validation. If conditions are unavailable, show one resort-report warning and one available stake image per resort instead of report cards. Restore reports on the next valid refresh. Keep request and producer correlation IDs in feed diagnostics.

## Verification

2026-11-21: Verified `npm run check`, `node --test tests/closed-snow.test.mjs`, `npm run build`, and headless Chromium checks at `1280 × 850` and touch `390 × 844` with public NWS ski-day weather, pass/open/new-snow filters, inline timelapse playback, dark mobile chrome, and quick feedback dialog.
