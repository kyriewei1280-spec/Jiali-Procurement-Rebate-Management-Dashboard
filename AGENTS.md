# Repository instructions

## Purpose and communication

- Maintain the procurement rebate dashboard and its supporting documentation.
- Default to Chinese for user-facing content and change summaries.
- Keep the four primary views: department overview, owner progress, action plan, and supplier detail.
- Read README.md, docs/METRICS.md, and docs/DATA.md before changing calculations or data.

## Editing and build

- Edit src/dashboard.template.html, src/dashboard.css, and src/dashboard.js. Regenerate index.html with `python tools/build.py`; never edit only the generated HTML.
- Use data/snapshot.json as the normalized input. It contains real business records.
- Preserve source sheet/row locators, units, as-of date, and source fingerprint.
- Do not add source workbooks, full raw extracts, local filesystem paths, credentials, caches, browser profiles, or screenshots containing unrelated information.
- Keep original business sources read-only unless the user authorizes a specific source change.
- Do not add remote analytics, external fonts, tracking, or runtime CDNs. The delivered HTML must work offline.

## Metric rules

- Missing values are null/unknown, never automatically zero.
- Separate assigned target, negotiated result, signed agreement, finance confirmation, and actual realization. Do not infer one from another.
- H-column target completion dates are deadlines, not negotiation appointments.
- Show eligible sample coverage next to on-time rates. A past deadline with no actual date means completion needs confirmation, not proven business delay.
- non-BOM missing data does not mean zero. Do not call BOM-only coverage a complete department result.
- PMO action status counts remain separate from supplier negotiation completion.
- Retain unresolved source discrepancies. Do not invent suppliers, owners, dates, targets, or achievements to reconcile totals.
- When updating snapshots, review descriptive copy as well as computed metrics; some comments describe the initial snapshot specifically.

## Design and interactions

- Preserve the dark, full-width visual system: #040606 canvas, #121411 surfaces, #56D15F active accent, restrained borders.
- Keep the page fluid; do not introduce a narrow centered max-width wrapper.
- Filters must update all relevant summaries and tables consistently. Clearly label any whole-source note that does not follow owner filters.
- Keep keyboard navigation, visible focus, semantic controls, dialog Escape handling, CSV blank preservation, and CSV formula-injection protection.
- At 390px, use readable horizontal bar rows and local table scrolling. Do not shrink chart labels until unreadable.

## Validation

Run `python tools/build.py`, `python tools/validate.py`, and `node --check src/dashboard.js` after relevant changes.

For UI changes, verify 1440px, 1920px, and 390px: no page-level overflow; tables scroll locally; all navigation destinations are accessible; filters, owner drilldown, week windows, search, sorting, pagination, detail dialogs, and CSV export work. Check displayed totals against the normalized data and investigate differences against the source.

## Publishing

- User authorization applies to the requested publication scope. Do not silently expand the dataset or publish additional originals.
- Verify repository visibility and publication scope before publishing newly introduced business data. Do not modify visibility or enable Pages unless authorized.
- Repository push, Pages deployment, and live website validation are distinct states. Report only verified outcomes.
- Keep tokens and authentication material outside tracked files and console output.
- Do not add a permissive license without an explicit licensing decision.
