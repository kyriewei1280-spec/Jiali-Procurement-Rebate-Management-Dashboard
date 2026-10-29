# Repository instructions

## Purpose and communication

- Maintain the procurement rebate dashboard and its supporting documentation.
- Default to Chinese for user-facing content and change summaries.
- Keep the five user-requested views in order: 00 guide, 01 negotiation overview, 02 owner progress, 03 daily/weekly progress, and 04 supplier master. Owner and period supplier lists share the master columns and link to 04. Supplier detail remains a shared drilldown dialog.
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
- Negotiated results are T/U/V in the 2026-10-27 main sheet. F is the reference rebate target and I is the target completion date. Owner achievement uses assigned rebate targets, not annual purchase amounts.
- Recorded achievement may aggregate known results against assigned targets, with explicit result and target coverage. Preserve null source amounts; V formula zeros are not evidence of negotiation or a zero rebate.
- Separate assigned target, negotiated result, signed agreement, finance confirmation, and actual realization. Do not infer one from another.
- I-column target completion dates are deadlines, not negotiation appointments.
- A past deadline with no actual date means completion needs confirmation, not proven business delay. The latest user request restores deadline compliance as a second traffic-light column, using all suppliers due by the snapshot date as its denominator. Missing evidence stays explicit.
- non-BOM missing data does not mean zero. Do not call BOM-only coverage a complete department result.
- PMO action status counts remain separate from supplier negotiation completion.
- Retain unresolved source discrepancies. Do not invent suppliers, owners, dates, targets, or achievements to reconcile totals.
- When updating snapshots, review descriptive copy as well as computed metrics; some comments describe the initial snapshot specifically.

## Design and interactions

- Preserve the dark, full-width visual system: #040606 canvas, #121411 surfaces, #56D15F active accent, restrained borders.
- Keep the page fluid; do not introduce a narrow centered max-width wrapper.
- Filters must update all relevant summaries and tables consistently. Clearly label any whole-source note that does not follow owner filters.
- Keep keyboard navigation, visible focus, semantic controls, dialog Escape handling, CSV blank preservation, and CSV formula-injection protection.
- Every table column has a compact funnel icon beside the heading, opening ascending/descending/default sorting. Do not restore column filter inputs. Preserve typed numeric sorting, empty values and export across pagination. Alternate row background colors, including sticky supplier cells.
- Overview has overall/BOM/non-BOM sections, each with two rows of two metric boxes: amount and supplier columns. Every numeric value in the overview cards is clickable, including counts, amounts, ratios and footnotes. Each opens its exact supporting supplier set in the large contribution dialog using the same master layout as 04. Preserve the existing actual-amount entry. Target and whole-scope ratio drilldowns must separately reconcile assigned targets and the unallocated pool, without inventing per-supplier allocation. Zero counts open an empty list. Overview includes the source-backed unallocated mold target pool in fully covered scopes. Show target/receipt, actual/full target, and actual/talked cohort target separately. Do not allocate the mold pool to supplier rows or partial category scopes. P/Q/R blank flags stay visually blank and generate no tags.
- Use 策略 instead of 抓手 or 谈判规划; name 04 供应商返利清单. Hide the global filter bar on 00/01/04 and ignore saved global filters there. Retain global filters on 02/03. Do not restore the top-right data-method button.
- Format monetary amounts with zero decimals and percentages with one decimal; calculate using unrounded source values.
- Hide Excel letter prefixes in visible supplier column headings; retain source locators in details. Use 返利目标 for the source F-column business label. Remove the selected-owner banner and personal KPI cards; retain the achievement-rate link in the owner table.
- Keep numeric master-table values right-aligned. Wide tables have synchronized top horizontal scrolling and left/right controls; avoid scroll synchronization closing an unchanged sort-menu anchor.
- Provide the global Browser/Mobile presentation switch. Browser uses the approved 67% zoom; Mobile uses normal zoom, readable touch-friendly cards and expandable supplier fields. Both modes share data, sorting, pagination, exports and current selections. Do not reset filters or dialogs when toggling. Auto-select Mobile at <=767px only when there is no manual preference; optional local storage must never be required to use the page.
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

## Traffic lights

- Owner compliance: denominator is suppliers with planned completion on/before the snapshot date. Numerator has an actual completion date on/before both the deadline and snapshot. Green exactly 100%, yellow >=80% and <100%, red <80%; no eligible suppliers gray. Never round before threshold comparison.
- Supplier priority: already negotiated with a known below-target amount is yellow (including explicit zero); no negotiation evidence and deadline strictly before the snapshot is red; completed by deadline and amount >= positive target is green. Future completion dates, missing required fields, pending future deadlines and late completed/achieved records are gray with a reason.
- Use a second column and full-row tint, including sticky cells and Mobile cards. Keep textual labels, reason, typed sorting, and alternate shades. Empty project match shows only 无 in project content.

## Typography update

Browser presentation matches the former page viewed at 67% browser zoom. Keep its existing base type scale and root CSS zoom .67; review at 100% browser zoom. Mobile overrides root zoom to 1 with 16px body/controls, smaller secondary labels and 44px touch targets. Preserve responsive layout, keyboard controls, correctly positioned menus and equivalent data access in both modes.

## Approved 2026-10-28 update

The user approved publication of the four-card overview and contribution-dialog repair. Preserve the 2026-10-27 business snapshot unless a data refresh is separately requested. Contribution dialog width/height must be based on the visible viewport, compensating for Browser root zoom .67. Keep its header and close control visible while the body scrolls; test Browser and Mobile before publishing.

## 2026-10-29 first negotiation semantics

The user requested a new local HTML refresh. The current T header is 第一次谈判时间; metadata.actualDateMeaning records this change. Do not label every T-filled record fully completed. When I is later than T and results are below target or provisional, keep that supplier in its I-date daily/weekly plan and show the reviewed reason for further negotiation/follow-up. Do not invent second-round appointments. Keep one supplier record and count each ID once. Owner date-compliance labels now refer to on-time first negotiation, not final completion. 明曜's CNY 300,000 stays in source totals but is explicitly provisional per the user's confirmation. Preserve this disclosure until updated evidence confirms its status.
