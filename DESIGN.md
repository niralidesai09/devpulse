---
name: Groundswell
description: Catch developer pain before it peaks. An archive's finding aid for weekly developer-pain intelligence.
colors:
  catalogue-paper: "#f6f4ee"
  record-sheet: "#fbfaf6"
  sheet-fill: "#efece4"
  binding-stock: "#ece8df"
  charcoal-ink: "#1f201c"
  ink-secondary: "#45463f"
  ink-muted: "#66665d"
  hairline: "#dcd7cb"
  hairline-strong: "#c8c2b3"
  binding-green: "#24603f"
  binding-green-ink: "#ffffff"
  binding-green-soft: "#e2ebe3"
  good: "#24603f"
  warn: "#8a5a00"
  warn-soft: "#f6ead2"
  bad: "#a3372a"
  bad-soft: "#f5e1dd"
  series-forest: "#1d7a4f"
  series-ochre: "#c4761b"
  chart-grid: "#e6e1d6"
  dark-catalogue-paper: "#161714"
  dark-record-sheet: "#1d1e1b"
  dark-sheet-fill: "#262722"
  dark-binding-stock: "#121310"
  dark-charcoal-ink: "#eeece5"
  dark-ink-secondary: "#c9c6bb"
  dark-ink-muted: "#a19e93"
  dark-hairline: "#34352f"
  dark-hairline-strong: "#46473f"
  dark-binding-green: "#6fbf8f"
  dark-binding-green-ink: "#0d1a12"
  dark-binding-green-soft: "#1f3327"
  dark-warn: "#e0ad4f"
  dark-warn-soft: "#3a2f19"
  dark-bad: "#ee8a7b"
  dark-bad-soft: "#3d2420"
  dark-series-forest: "#2fa56b"
  dark-series-ochre: "#c97a25"
  dark-chart-grid: "#2b2c27"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  display-compact:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  subhead:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  entry:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  statement:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.625
  figure:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum, lnum"
  title:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  control:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  record-id:
    fontFamily: "Source Code Pro, ui-monospace, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum, lnum"
rounded:
  hairline: "2px"
  sm: "4px"
  md: "6px"
  full: "9999px"
spacing:
  row-compact: "10px"
  row: "12px"
  column-gutter: "16px"
  section: "32px"
  armature-split: "40px"
  page-x-mobile: "20px"
  page-x-desktop: "40px"
components:
  button-primary:
    backgroundColor: "{colors.binding-green}"
    textColor: "{colors.binding-green-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "36px"
  button-quiet-hover:
    backgroundColor: "{colors.sheet-fill}"
    textColor: "{colors.charcoal-ink}"
  chip-query:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  chip-keyword:
    backgroundColor: "{colors.sheet-fill}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.record-id}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  input-field:
    backgroundColor: "{colors.record-sheet}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  sheet:
    backgroundColor: "{colors.record-sheet}"
    rounded: "{rounded.md}"
    padding: "16px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.record-sheet}"
    textColor: "{colors.charcoal-ink}"
  sidebar:
    backgroundColor: "{colors.binding-stock}"
    width: "232px"
  ai-tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
---

# Design System: Groundswell

## Overview

**Creative North Star: "The Finding Aid"**

Groundswell reads like an archive's finding aid for developer pain. Every claim is a catalogued record with an accession id and provenance. The cataloguer's note (AI interpretation) is tagged and sits visibly apart from the original document. The page is warm catalogue paper with a cooler binding stock for the sidebar and charcoal ink. Archival binding green is the only accent, and it marks the active, primary, and positive states.

Structure comes from rules, not containers. One visible hairline grid holds the page: a ruled four-column ledger of figures, then a three-plus-one split where the side column sits under the ledger's fourth column rule. Records are rows divided by hairlines. They are not cards. The density is that of a working reference: compact rows, tabular figures in fixed columns, a serif voice kept for the few statements that matter, and grotesque type for everything operational.

The system rejects the KPI-tile SaaS dashboard of equal rounded, shadowed cards. Figures go in a ruled ledger and evidence goes in catalogued rows.

**Key Characteristics:**
- Warm paper page, cooler binding-stock sidebar, charcoal ink, one forest-green accent.
- Hairline rules for every division. No shadows on content.
- Corners stay square-ish, with 6px as the ceiling.
- Serif type only for page titles, the lead statement, and AI or editorial statements. Grotesque type for the interface. Monospace only for record ids and figures that must align.
- Lifecycle states use one fixed vocabulary: new, rising, steady, falling, too few to compare.
- Light and dark themes switch in one place through CSS variables.

## Colors

The palette is a restrained warm neutral set with a single archival green. Status colors are reserved for state, and a validated forest/ochre pair is kept for charts.

### Primary
- **Archival Binding Green** (binding-green; dark: dark-binding-green): the only accent. It marks the active nav icon, primary buttons (Run now, Ask, Apply), text links, share bars, focus rings, caret, and native `accent-color`. Resolved status and fresh data reuse it as `good`. Its soft tint (binding-green-soft) is used only for text selection.

### Secondary
- **Chart Ochre** (series-ochre; dark: dark-series-ochre): the second chart series only. It is never an interface accent.
- **Chart Forest** (series-forest; dark: dark-series-forest): the first chart series. It is a lighter, more saturated relative of the binding green, tuned for marks rather than text.

### Neutral
- **Catalogue Paper** (catalogue-paper): the page ground, also applied to `html` so overscroll matches.
- **Record Sheet** (record-sheet): the content panels (Sheet), inputs, the active nav row, and chart tooltips.
- **Sheet Fill** (sheet-fill): table heads, keyword chips, the score formula block, the share-bar track, and quiet hover fills.
- **Binding Stock** (binding-stock): the sidebar, mobile top bar, and drawer. It is cooler and darker than the paper so navigation reads as the binding, not the page.
- **Charcoal Ink / Secondary Ink / Muted Ink** (charcoal-ink, ink-secondary, ink-muted): primary text, supporting text, then metadata and record ids. Muted ink keeps AA contrast on both paper and sheet.
- **Hairline / Strong Hairline** (hairline, hairline-strong): every rule, border, and divider. Strong hairlines go on form controls, the AI tag, dashed empty states, link underlines, and the scrollbar.
- **Chart Grid** (chart-grid): horizontal chart gridlines only.

### Status
- **Warn** (warn, warn-soft): "Unresolved", partial source health, and stale-data notices.
- **Bad** (bad, bad-soft): failed sources and failed runs.

### Named Rules
**The One Binding Rule.** Binding green is the only interface accent. Anything active, primary, or positive is green, and nothing decorative is.

**The Chart Pair Rule.** Charts use the validated forest/ochre pair and nothing else. Forest marks the primary measure (kept, resolved, relevant). Ochre marks its counterpart (unresolved, collected).

**The One Switch Rule.** Every color comes from the CSS variables in `app/globals.css`. Components never carry literal hex values, so light and dark change in one place.

## Typography

**Interface Font:** Libre Franklin (with system-ui, sans-serif), weights 400/500/600/700
**Editorial Font:** Source Serif 4 (with Georgia, serif), weights 400/600
**Record Font:** Source Code Pro (with ui-monospace), weights 400/500

**Character:** Libre Franklin is a workhorse catalogue grotesque that carries every operational word. Source Serif 4 is the cataloguer's voice, used for titles and judgements. Source Code Pro is the accession stamp.

### Hierarchy
- **Display** (Source Serif 4 600, 26px rising to 30px from sm, 1.2, -0.015em): the Overview lead problem statement only.
- **Headline** (Source Serif 4 600, 28px, tight leading, -0.015em, balanced wrap): page titles in PageHeader. The brand wordmark is the same face at 18px.
- **Subhead** (Source Serif 4 600, 22px): opportunity names on Opportunities, the brief's h1, and the opportunity score figure.
- **Entry** (Source Serif 4 600, 18px): Ask questions, the brief's h2, and the brand wordmark.
- **Statement** (Source Serif 4 400, 17px, relaxed leading, max 68ch): AI interpretation and insight statements, set apart from source records.
- **Figure** (Libre Franklin 600, 32px, leading 1, -0.02em, tabular lining numerals): ledger KPI values, with the unit at 14px in muted ink.
- **Title** (Libre Franklin 600, 15px): Section headings and opportunity names.
- **Body** (Libre Franklin 400, 15px, 1.55): base text. Brief prose is 15px/1.65 at max 72ch, with serif h1 (22px) and h2 (18px) above a hairline rule.
- **Control** (Libre Franklin 400, 14px): sidebar navigation, buttons, filters, and compact supporting rows.
- **Meta** (Libre Franklin 400, 12.5–13px, muted ink): record source, date, status, and notes under figures.
- **Label** (Libre Franklin 500, 13px, secondary ink): ledger term labels (`dt`), sentence case.
- **Record id** (Source Code Pro 400, 11.5px, tabular): accession ids such as "GH 5816317078", ranks, and Opportunity Scores in fixed columns.

### Named Rules
**The Accession Rule.** Monospace is reserved for record ids, ranks, scores, keywords, and figures that must align in a column. It is never used for prose, headings, or decoration.

**The Tabular Rule.** Every number that can be compared vertically carries `tabular-nums lining-nums` (the `.tabular` utility).

**The Sentence Case Rule.** Labels are sentence case at normal tracking. There are no uppercase tracked micro-labels.

## Layout

The desktop shell is a sticky 232px binding-stock sidebar with a hairline right rule beside a main column capped at 1200px (padding 20px mobile, 40px from lg). Below lg the sidebar becomes a 56px sticky top bar whose menu button opens the same nav as a left drawer (min(280px, 85vw)) over a 25% ink scrim. Escape closes the drawer and page scroll is locked while it is open.

The armature is a four-column hairline grid. The Overview ledger is a `dl` ruled top and bottom (two columns, four from lg), with hairline left rules between cells. Below it, from xl, content spans three columns (40px right padding) and the side column sits under a hairline left rule that lines up with the ledger's fourth-column rule (16px left padding). Below xl everything collapses to one column with 40px vertical gaps.

Records follow a fixed two-column row: a 7.5rem accession-id column and a flexible title/meta column, collapsing to one column below sm. Rows are 12px vertical padding (10px compact) and are separated by hairline dividers inside a ruled block. Sections stack 32px apart. Section headings sit 12px above their content.

## Elevation & Depth

The system is flat. Content never casts a shadow. Depth comes from paper tones (catalogue paper, record sheet, binding stock) and hairline rules. Two shadows exist, and both belong to the shell, not to content.

### Shadow Vocabulary
- **Active nav underline** (`box-shadow: 0 1px 0 var(--line)`): a one-pixel hairline under the active nav row. It reads as a rule, not as lift.
- **Drawer edge** (`box-shadow: 8px 0 24px -12px rgb(0 0 0 / 0.25)`): only on the mobile drawer, which genuinely overlays the page.

### Named Rules
**The Flat Sheet Rule.** Sheets, records, ledgers, charts, and empty states have no shadow. Separation comes from a hairline border or a tonal step, never from elevation.

## Shapes

Corners are square-ish and capped at 6px: md for sheets, buttons, inputs, nav rows, and tooltips; sm for the AI tag, query chips, and keyword chips; 2px for legend swatches. Fully rounded shapes appear only on the 4px share bar and the freshness dot. Chart bars round only their outer end (3px). Borders are 1px hairlines. Dashed strong hairlines mark empty states.

## Components

### Buttons
- **Shape:** gently squared (6px), 36px tall (44px for the Ask field's submit).
- **Primary:** binding green with white ink, 13.5–14px medium, 16px horizontal padding. Used once per view for the main action (Run now, Ask, Apply filters, Save).
- **Hover / Focus:** hover drops opacity to 90%. Focus is the global 2px binding-green outline at 2px offset. Disabled is 50–70% opacity.
- **Quiet:** transparent, secondary ink, 8px padding. Hover fills with sheet fill and darkens to charcoal (Lock, row actions).

### Chips
- **Query chip:** 4px corners, strong hairline border, secondary ink, 13px. Hover moves the border to muted ink and fills with record sheet. Used for Ask's example questions.
- **Keyword chip:** sheet-fill ground, Source Code Pro 12px, secondary ink, no border.

### Cards / Containers
- **Sheet:** record sheet on paper, 1px hairline, 6px corners, no shadow, padding 16px (briefs: 24–32px). Used for the brief, charts, and grouped panels, not for single figures.
- **Ledger:** the ruled figures `dl` described in Layout. KPIs never go in individual tiles.
- **Empty state:** dashed strong hairline, record sheet at 60%, a dashed-circle icon, a medium title, and an optional action.

### Inputs / Fields
- **Style:** record sheet ground, 1px strong hairline, 6px corners, 36px tall (44px for Ask), 13.5–15px, muted-ink placeholder.
- **Focus:** the global binding-green 2px outline. Checkboxes take `accent-color` binding green.

### Navigation
- **Style:** 36px rows, 14px Libre Franklin, a 16px Lucide icon at 1.75 stroke. Rows are grouped into Analysis (Overview, Trends, Opportunities, Evidence, Ask) and Setup (Topics, Runs, How it works), separated by a hairline.
- **States:** the default is secondary ink with a muted icon. Hover fills with record sheet at 60%. Active (`aria-current="page"`) uses a record-sheet fill, medium charcoal text, a binding-green icon, and the hairline underline.
- **Footer:** data freshness at 12px muted ink under a hairline, with a 6px dot (good when fresh, warn when stale).

### Record Row (signature)
This is the evidence unit on every page. A muted Source Code Pro accession id (source code plus id, long ids truncated to the last 8) sits in a fixed left column. Beside it is a 14px medium title linking to the original thread, with an up-right arrow that turns green on hover and a "(link unavailable)" fallback for invalid URLs. Below that is a 12.5px meta line: source, date, Unresolved (warn) / Resolved (good), and severity n/5.

### Provenance Label (signature)
Measured facts carry a plain 12px muted "Observed in discussions" field label. AI output carries a bordered "AI interpretation" tag (4px, strong hairline, 11.5px medium) and is set in the serif statement style, so the cataloguer's note never reads as source.

### Lifecycle State (signature)
This is one fixed scale: new, rising, steady, falling, too few to compare. The count pair "last → this" comes first in secondary ink. The word carries the meaning and a 13px icon echoes it. New, rising, and falling are medium charcoal. Steady and too few are muted. The percentage appears only when comparable.

### Charts
Recharts on a sheet. Horizontal gridlines use chart-grid, axes are 12px muted, and there are no vertical gridlines. Bars are at most 14–16px thick with rounded outer ends. Stacked segments are separated by a 2px record-sheet stroke. Lines are linear, 2px, with dots. There is no animation. Every chart pairs a swatch legend with a "Show as table" disclosure.

## Do's and Don'ts

### Do:
- **Do** take every color from the CSS variables in `app/globals.css` so light and dark switch together.
- **Do** put KPIs in a ruled ledger with hairline column rules and tabular 32px figures, with units and notes in muted ink.
- **Do** render evidence as Record Rows with a monospace accession id, a link to the original, and source/date/status meta.
- **Do** tag AI output with the "AI interpretation" label and set it apart in serif; label measured facts "Observed in discussions".
- **Do** express trend direction only with the lifecycle vocabulary (new, rising, steady, falling, too few to compare), always with its counts.
- **Do** keep corners at or below 6px and separate everything with 1px hairlines.
- **Do** pair every chart with a legend and a "Show as table" fallback, using only the forest/ochre series pair.

### Don't:
- **Don't** build KPI-tile dashboards of equal rounded, shadowed cards.
- **Don't** put shadows on content. The only shadows are the active-nav hairline and the mobile drawer edge.
- **Don't** introduce a second interface accent. Ochre belongs to charts; warn and bad belong to state.
- **Don't** use monospace for prose or headings, or serif for operational labels and controls.
- **Don't** set labels in uppercase with wide tracking.
- **Don't** let AI interpretation share the styling of source records.
