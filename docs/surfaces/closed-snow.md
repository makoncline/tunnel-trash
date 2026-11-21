# Closed Snow

Scope: `/closed-snow`. Use the approved Closed Snow local viewer as the visual reference. Keep the store unchanged and this page unlinked and noindex.

## Display

2026-11-16: The page opens on compact resort cards, as in the approved local viewer. Each card leads with the complete pre-open image for the resort’s ski day. If that image is unavailable, the card says “Pre-open image unavailable.” More shows Now when it is a different capture or when the pre-open image is unavailable. The caption says “Fetched” when the camera time is unknown. The name line shows the resort name, Base with the nearby SWE percent when it is current, and the operating-status dot. One row shows a Prev 5 bracket over five daily reported-snow bars and a box with today's reported overnight snow and report time. A tap on the image opens the camera dialog. A tap on a date or the box opens that date's saved morning image. A tap elsewhere on the card opens More with report values, snowpack, the six-date table, observed facts and status sources. Open resorts sort first, then by overnight snow and seven-day snow.

Use one grid with complete native camera views. Tap a stake image to open the camera dialog. Image, Clear stake and available clips share that dialog. Timelapses have 44px previous/play/next controls, an exact capture timestamp and a frame slider below the video. Pause and step through the 72 encoded frames using the producer’s timestamp map. Back gauges are the default; diagonal gauges are optional where supplied. Escape, close and focus return must work.

## Data

Use the independent Closed Snow API and immutable assets. Cards combine `/v1/morning.json`, `/v1/current.json` and `/v1/conditions.json`. Validate each resort entry separately. The producer owns selection, clearing evidence and calibrated SVGs. The page does not estimate snow or calibrate images. `clearedReference` is a fixed reviewed empty-platform image with its original date; it is not today's clearing result. Keep image bytes clean and guides separate. Check each camera record so one invalid record does not block the rest.

Refresh once per minute and when the page becomes visible. Show resort reports only after a successful conditions read with a valid build time and the current America/Denver date. A build can be up to 15 minutes old or up to 5 minutes in the future. Keep valid resorts when only some entries fail validation. If conditions are unavailable, show one resort-report warning and one available stake image per resort instead of report cards. Use a saved morning selection when available, or show the current feed image with its Now label and capture time. Restore reports on the next valid refresh. Keep request and producer correlation IDs in feed diagnostics.

## Private forecast blend

On `/closed-snow`, **Private forecast · Closed Snow blend** shows below Clank with no file picker. The browser fetches the newest blend from the owner-only local viewer at `https://makonmacair.tailb1a90d.ts.net:8448/forecast/blend.json`. That route serves the newest `closed-snow-private-liquid` file under `~/.local/share/closed-snow-forecast/private-blend.*/`, which the research tool writes (`node scripts/blend-forecast.mjs /path/to/weathernext.json`). The public HTML and API responses never include the blend. Off the tailnet the fetch fails and the section stays hidden. The section reads the newest file on each page load.

The three models use the same initialization and time window for each resort point. Sum each model's liquid over the block, then average the three totals with equal weights. Hatching means one or more models lack a complete block. Do not redistribute the weight or fill gaps. A dot means zero from all three models. The **Sources, block totals and model ranges** disclosure shows the model inputs, each exact time span, the blend and its low-to-high model range. The range is not a probability. WeatherNext's hour-ending convention is provisional.

The first 12 hours use one mark per hour. Then six-hour blocks run through the second local midnight, followed by local days, up to the end of the file (maximum seven days). A block at the end of a section or file can be shorter. Marks use the same mean liquid-rate scale. Longer blocks smooth short bursts. These are liquid amounts, not snowfall.

Do not put forecast files in `public/`, Git, a deploy environment or the public API. The [WeatherNext terms](https://storage.googleapis.com/weathernext-public/terms-of-use.pdf) restrict sharing of live model data and some derived work. The deployed page includes only the reader; it does not distribute the forecast files.

## Verification

2026-11-02: Actual eight-camera API data checked in Chrome at 1280 × 800 and 390 × 844. All images and guides loaded. Clear/Image and gauge switches worked; close returned focus to the selected tile. No horizontal overflow. The Impeccable detector returned no findings. Type, lint, build and the real-feed HTTP golden passed. No raster files are bundled; camera media comes from the producer.

2026-11-03: Real Nov 3 data checked at 1280 × 800 and 390 × 844. Frame stepping returned 20 → 21 → 20; the last Keystone frame showed 6:00:15 AM MST. Play/pause and seeking worked with HTTP range responses. No horizontal overflow. The detector had no findings; the finish review returned ship. Type, lint and updated real-data goldens passed.

2026-11-16: Real Nov 16 producer data checked in Chrome on a production build at 390 × 844 and 1440 × 1000. Eight cards and all images loaded. More, date and camera dialogs opened and returned focus. No horizontal overflow. Lint, types, build and the real conditions golden passed.
