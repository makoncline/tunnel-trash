# Closed Snow

Scope: `/closed-snow`. Mode: Operate. The owner checks camera images and opens a camera for its morning clips. Use the existing white surface, Geist type, black controls, and quiet borders. Keep the store unchanged. The owner requested autonomous implementation and release.

## Direction contract

THESIS: Let the camera evidence lead. Keep each image separate from notes and optional guides.

OWN-WORLD: Inherit Tunnel Trash's white background, dark text, Geist type, and simple controls. Use large images and clear spacing. Add no decorative data graphics.

STORY: Choose Current or Morning, scan the cameras in feed order, then open a camera to inspect its image, clips, and source details.

FIRST VIEWPORT: A small store link sits above the title. The title, feed time, refresh action, and two view tabs precede a two-column camera grid. Images use contain sizing, with no crop or overlay. A camera opens in the same page with an explicit return action.

FORM: A camera contact sheet with an inspection view. This is a precisely scoped extension of the existing site; no concept seed or new visual world is required. Use code and actual feed media.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Data contract

Read the public `/v1/current.json`, `/v1/morning.json`, and `/v1/schema.json` at `https://closed-snow-api.daylilycatalog.workers.dev`. Media files come from `/assets/` on that origin. Preserve producer entry order. Validate each camera and clip separately so one bad record does not block the rest. Keep feed request IDs, correlation IDs, and producer run IDs available in the inspection details.

The first inspected schema has no guide approval field. Do not infer approval from the presence of an overlay or from prose notes. Show clean images without a guide. The page does not estimate snowfall. Weather and reported totals must come from an explicit future API contract.

No navigation, homepage, sitemap, login, collection, or producer changes are in scope. Use noindex metadata. No shipping raster is added: camera media stays on the producer origin.
