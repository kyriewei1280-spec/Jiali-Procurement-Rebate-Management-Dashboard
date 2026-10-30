# Repository instructions

## Purpose and communication

- Maintain the procurement rebate dashboard and its supporting documentation.
- Default to Chinese for user-facing content and change summaries.
- Keep four authenticated business views in order: 01 negotiation overview, 02 owner progress, 03 daily/weekly progress, and 04 supplier master. The former guide is no longer a navigation destination. Owner and period supplier lists share the master columns and link to 04; supplier detail remains a shared dialog.
- Read README.md, docs/METRICS.md, and docs/DATA.md before changing calculations or data.

## Editing and build

- Edit src/dashboard.template.html, src/dashboard.css, src/dashboard.js, and src/auth.js. Regenerate index.html with `python tools/build.py`; never edit only the generated HTML.
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
- Overview has overall/BOM/non-BOM sections, each with two target cards and three monetary progress cards: recorded won, shortfall, pending reply. Every numeric value in the overview cards is clickable, including counts, amounts, ratios and footnotes. Each opens its exact supporting supplier set in the large contribution dialog using the same master layout as 04. Preserve the existing actual-amount entry. Target and whole-scope ratio drilldowns must separately reconcile assigned targets and the unallocated pool, without inventing per-supplier allocation. Zero counts open an empty list. Overview includes the source-backed unallocated mold target pool in fully covered scopes. Show target/receipt, actual/full target, and actual/talked cohort target separately. Do not allocate the mold pool to supplier rows or partial category scopes. P/Q/R blank flags stay visually blank and generate no tags.
- Use 策略 instead of 抓手 or 谈判规划; name 04 供应商返利清单. Hide the global filter bar on 00/01/04 and ignore saved global filters there. Retain global filters on 02/03. Do not restore the top-right data-method button.
- Format monetary amounts with zero decimals and percentages with one decimal; calculate using unrounded source values.
- Hide Excel letter prefixes in visible supplier column headings; retain source locators in details. Use 返利目标 for the source F-column business label. Remove the selected-owner banner and personal KPI cards; retain the achievement-rate link in the owner table.
- Keep numeric master-table values right-aligned. Wide tables have synchronized top horizontal scrolling and left/right controls; avoid scroll synchronization closing an unchanged sort-menu anchor.
- Provide the global Browser/Mobile presentation switch. Browser uses the approved 67% zoom; Mobile uses normal zoom, readable touch-friendly cards and expandable supplier fields. Both modes share data, sorting, pagination, exports and current selections. Do not reset filters or dialogs when toggling. Auto-select Mobile at <=767px only when there is no manual preference; optional local storage must never be required to use the page.
- At 390px, use readable horizontal bar rows and local table scrolling. Do not shrink chart labels until unreadable.

## Validation

Run `python tools/build.py`, `python tools/validate.py`, `node --check src/dashboard.js`, and `node --check src/auth.js` after relevant changes.

For UI changes, verify 1440px, 1920px, and 390px: no page-level overflow; tables scroll locally; all navigation destinations are accessible; filters, owner drilldown, week windows, search, sorting, pagination, detail dialogs, and CSV export work. Check displayed totals against the normalized data and investigate differences against the source.

## Publishing

- User authorization applies to the requested publication scope. Do not silently expand the dataset or publish additional originals.
- Verify repository visibility and publication scope before publishing newly introduced business data. Do not modify visibility or enable Pages unless authorized.
- Repository push, Pages deployment, and live website validation are distinct states. Report only verified outcomes.
- Keep tokens and authentication material outside tracked files and console output.
- Do not add a permissive license without an explicit licensing decision.

## Traffic lights

- Owner compliance: denominator is suppliers with planned completion on/before the snapshot date. Numerator has an actual completion date on/before both the deadline and snapshot. Green exactly 100%, yellow >=60% and <100%, red <60%; no eligible suppliers gray. Never round before threshold comparison.
- Supplier achievement: known U/F >=100% green, >=60% and <100% yellow, <60% red. No negotiation evidence or missing amount/positive target is gray. Source zero remains zero for lights even when X says pending reply; that same pending zero belongs to the pending monetary bucket, not shortfall.
- Use a second column and full-row tint, including sticky cells and Mobile cards. Keep textual labels, reason, typed sorting, and alternate shades. Empty project match shows only 无 in project content.

## Typography update

Browser presentation matches the former page viewed at 67% browser zoom. Keep its existing base type scale and root CSS zoom .67; review at 100% browser zoom. Mobile overrides root zoom to 1 with 16px body/controls, smaller secondary labels and 44px touch targets. Preserve responsive layout, keyboard controls, correctly positioned menus and equivalent data access in both modes.

## Approved 2026-10-28 update

The four-card overview and contribution-dialog repair were approved. The current remote source has subsequently been refreshed to the 2026-10-28 main-sheet snapshot; preserve it during the login change and do not revert to the older 2026-10-27 local package. Contribution dialog dimensions compensate for Browser root zoom .67; keep the title and close control visible while its body scrolls.

## Approved account display routing

- User chose GitHub Pages with client-side display routing after acknowledging that all embedded/public data remains obtainable. Do not claim real server-enforced authorization or data secrecy. Do not migrate to Vercel or change repository visibility without a new user request.
- Maintain 17 accounts for the current snapshot: 14 named owners and three administrator roles: overall-admin, mold-admin, operations-admin. Individual role is owner; match the exact full owner name, never surname.
- Overall admin sees all data. Mold admin sees only non-BOM mold. Operations admin sees only non-BOM tooling/equipment/logistics, never mold. Owner accounts see their workstream aggregates in 01, and only their own records in 02/03/04.
- For personal accounts, overview numbers open aggregate calculation/category tables, not other owners' supplier details. This is the explicit scope exception to the older all-supplier numeric-drilldown rule. Never pass personal rows off as reconciliation of a whole-workstream total.
- Enforce display scopes consistently in dropdown options, search, supplier/owner links, dialogs, sort/pagination and exports. Period-plan denominator is the personal/admin detail scope, not the global snapshot summary. Changing a filter must not expand the account scope.
- Clear rendered content, dialogs, filtering, search, table states and drilldown maps on logout or identity changes. Keep sign-in state in per-tab sessionStorage for at most 12 hours, invalidate on configuration version change, and tolerate denied browser storage. localStorage is only for presentation preference.
- Keep plaintext passwords only in the local private delivery directory outside this repository. Public data/access.json contains account mappings and password-derived hashes only; never include plaintext in Git, docs, logs, screenshots, test artifacts or caseOS.
- Account generation/rotation must preserve passwords not intentionally changed. A supplier/owner refresh requires explicit mapping review, not automatic unreviewed scope expansion.
- Before publishing, execute meaningful local scope/stress checks for every account, at least five simultaneous independent sessions, desktop/mobile, repeated actions, wrong passwords, logout/refresh and denied storage. Do not load-test the public GitHub Pages host. Report actual results; a test plan is not proof of execution.
- Preserve current source values, fingerprints and snapshot date. Historical displayed targets must never become hardcoded live targets.

## 2026-10-29 first negotiation semantics

The user requested a new local HTML refresh. The current T header is 第一次谈判时间; metadata.actualDateMeaning records this change. Do not label every T-filled record fully completed. When I is later than T and results are below target or provisional, keep that supplier in its I-date daily/weekly plan and show the reviewed reason for further negotiation/follow-up. Do not invent second-round appointments. Keep one supplier record and count each ID once. Owner date-compliance labels now refer to on-time first negotiation, not final completion. 明曜's CNY 300,000 stays in source totals but is explicitly provisional per the user's confirmation. Preserve this disclosure until updated evidence confirms its status.

## 2026-10-30 progress buckets and explicit exceptions

- Read I as the original target deadline, T as first negotiation, U as recorded rebate, W as next follow-up and X as agreement/reply status. Keep X distinct from whether an amount exists. Positive U is won even with X pending. U=0 with pending X belongs to pending amount (F); explicit refusal belongs to shortfall. Plain 否 with expected reply is not refusal. Shortfall for a positive result is max(F-U,0). Never overlap pending and shortfall for the same target balance.
- Source-positive amounts do not imply agreement signature or finance realization. Use current X in summaries and preserve prior dated narrative history.
- The user's explicit 10/30 exception adds 康涵 F=500000 to shortfall and 绅陆 F=500000 to pending. Keep their T/U null and confirmed-negotiated counts unchanged. Record the dated exception in rebateProgressOverride for audit, with no visible temporary-classification labels. Clear it on the next workbook import so it cannot silently become a general rule.
- Include both I and W dates in period plans; deduplicate supplier IDs within each date/week. W alone is not proof of an actual negotiation and never moves the owner's deadline denominator.
- Three monetary buckets need not cover the whole department target; unnegotiated rows remain excluded except for explicit dated exceptions. Keep personal overview drilldowns aggregated by category.

## 2026-11-02 source layout

The latest source has W=未达成金额, X=下次跟进日期, Y=agreement/reply status, Z=timing annotation, AA=notes. Resolve columns by the validated layout; never treat W money as a date. Preserve sourceShortfallAmount/sourceTiming/negotiationNotes and metadata.sourceColumns. W is MAX(F-U,0) for all suppliers, including pending and unnegotiated, so do not sum W as the overview shortfall bucket. Continue the reviewed per-status bucketing. The two 10/30 overrides have expired; 绅陆 now has T=10/30, while 康涵 has no actual record. Do not silently restore those old overrides. The filename's 11/2 data version does not advance the online Beijing calendar date.
