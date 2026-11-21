# Closed Snow

Scope: `/closed-snow`. Use the approved Closed Snow local viewer as the visual reference. Keep the store unchanged and this page unlinked and noindex.

## Display

2026-11-21: The header shows the ski day (`Today` or `For tomorrow`). When live captures differ from morning pre-open captures, a floating bottom `Morning | Now` pill bar switches all cards for easy phone thumb access, and each card image shows a two-state `Before clear | Now` (or `Opening | Now`) pill to switch that card in place. Cards with clips show a `Timelapse` button that opens the camera dialog directly on the clip. The enlarged camera dialog lets skiers switch directly between the morning capture, `Now`, `Clear stake`, and available clips, with controls placed at the bottom on phones. The facts line shows `Base` and `Snowpack <N>% for date` separately so nearby SWE percent is not confused with base depth or season total.

2026-11-16: The page opens on compact resort cards, as in the approved local viewer. Each card leads with the complete pre-open image for the resort’s ski day. If that image is unavailable, the card says “Pre-open image unavailable.” More shows Now when it is a different capture or when the pre-open image is unavailable. The caption says “Fetched” when the camera time is unknown. One row shows a Prev 5 bracket over five daily reported-snow bars and a box with today's reported overnight snow and report time. A tap on the image opens the camera dialog. A tap on a date or the box opens that date's saved morning image. A tap elsewhere on the card opens More with report values, snowpack, the six-date table, observed facts and status sources. Open resorts sort first, then by overnight snow and seven-day snow.

Use one grid with complete native camera views. Tap a stake image to open the camera dialog. Press and hold a still image to see its saved clear reference, then release to restore the image. Each saved date shows the gauge overlay published with its image. The snow assessment chip shows only the band. The percentage beside the base is nearby snow water equivalent against the 1991–2020 median for the same date, not a percentage of the resort base. Image, Clear stake and available clips share the camera dialog. Timelapses have 44px previous/play/next controls, an exact capture timestamp and a frame slider below the video. Pause and step through the 72 encoded frames using the producer’s timestamp map. Back gauges are the default; diagonal gauges are optional where supplied. Escape, close and focus return must work.

## Data

Use the independent Closed Snow API and immutable assets. Cards combine `/v1/morning.json`, `/v1/current.json` and `/v1/conditions.json`. Validate each resort entry separately. The producer owns selection, clearing evidence and calibrated SVGs. The page does not estimate snow or calibrate images. `clearedReference` is a fixed reviewed empty-platform image with its original date; it is not today's clearing result. Keep image bytes clean and guides separate. Check each camera record so one invalid record does not block the rest.

Refresh once per minute and when the page becomes visible. Show resort reports only after a successful conditions read with a valid build time and the current America/Denver date. A build can be up to 15 minutes old or up to 5 minutes in the future. Keep valid resorts when only some entries fail validation. If conditions are unavailable, show one resort-report warning and one available stake image per resort instead of report cards. Use a saved morning selection when available, or show the current feed image with its Now label and capture time. Restore reports on the next valid refresh. Keep request and producer correlation IDs in feed diagnostics.

## Forecast

Clank publishes our own forecast on the public site. Use weather models and meteorologist reports as inputs, alongside resort reports and stake observations. Publish the forecast, not the source snapshots.

The current operator chart reads the latest blend from the local viewer’s `/forecast/blend.json` route. The viewer reads files from `~/.local/share/closed-snow-forecast/private-blend.*/`. The chart is visible when the viewer is reachable over Tailscale; it is not part of the public forecast.

The three models use the same initialization and time window for each resort point. Sum each model's liquid over the block, then average the three totals with equal weights. Hatching means one or more models lack a complete block. Do not redistribute the weight or fill gaps. A dot means zero from all three models. The chart shows the forecast range, time labels, live marker, and resort rows. A screen-reader table gives the liquid total in each block. WeatherNext's hour-ending convention is provisional.

The stake cards show the temperature range, conditions, and sustained wind speed range from the viewer's `/forecast/ski-day.json` route. The window is the next complete 9 a.m.–4 p.m. Mountain period. It does not indicate lift hours or operating status. Match the National Weather Service forecast by resort ID and omit unavailable values. The weather does not depend on a current liquid blend file or resort report. Steamboat and Loveland are forecast points only, with no stake cards.

The first 12 hours use one mark per hour. The live Mountain time clock updates each minute. The ▼ marker points to the current hour when the file covers it. That mark uses the full forecast hour, not the elapsed part or an observation. If the file starts later, show the clock without a marker. Then six-hour blocks run through the second local midnight, followed by local days, up to the end of the file (maximum seven days). A block at the end of a section or file can be shorter. Mark height follows the mean rate on a fixed 0–0.10 inch-per-hour liquid scale. Round to the nearest available height. A nonzero rate always gets at least the shortest bar; reserve the full bar for 0.10 inches per hour or more. Longer blocks smooth short bursts. The scale is not a snowfall conversion or a winter warning threshold.

## Verification

2026-11-02: Actual eight-camera API data checked in Chrome at 1280 × 800 and 390 × 844. All images and guides loaded. Clear/Image and gauge switches worked; close returned focus to the selected tile. No horizontal overflow. The Impeccable detector returned no findings. Type, lint, build and the real-feed HTTP golden passed. No raster files are bundled; camera media comes from the producer.

2026-11-03: Real Nov 3 data checked at 1280 × 800 and 390 × 844. Frame stepping returned 20 → 21 → 20; the last Keystone frame showed 6:00:15 AM MST. Play/pause and seeking worked with HTTP range responses. No horizontal overflow. The detector had no findings; the finish review returned ship. Type, lint and updated real-data goldens passed.

2026-11-16: Real Nov 16 producer data checked in Chrome on a production build at 390 × 844 and 1440 × 1000. Eight cards and all images loaded. More, date and camera dialogs opened and returned focus. No horizontal overflow. Lint, types, build and the real conditions golden passed.
