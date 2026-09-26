# DESIGN.md
# Business Systems Factory — Visual & Interaction Design Constitution

> **Primary visual reference:** the supplied Paradigm/Godly screenshot.
> This document captures its visual language and translates it into a reusable enterprise-product design system.
> Copy the design language, hierarchy, spacing logic, restraint, editorial character, and interaction philosophy. Do **not** copy Paradigm branding, copywriting, trademarks, logos, or proprietary assets.

---

## 0. Non-Negotiable Design Goal

The product must feel like a premium 2026 enterprise operating system, not a generic admin dashboard.

The target visual character is:

- editorial, architectural, calm, precise, premium;
- mostly monochrome;
- extremely disciplined spacing;
- thin structural lines instead of heavy cards;
- typography-driven hierarchy;
- data-dense where needed, but never visually noisy;
- large confident serif display typography combined with a neutral sans-serif UI face;
- strong contrast between large marketing/editorial moments and compact operational interfaces;
- subtle blue used only as a functional accent;
- almost no decorative gradients;
- almost no rounded “bubble UI”;
- motion should be quiet, fast, and purposeful;
- every screen should look designed as part of one product family.

The interface must communicate:
**clarity, trust, control, intelligence, and operational seriousness.**

---

# 1. Core Visual DNA

## 1.1 Overall composition

Use a rigid editorial grid.

The screenshot’s core behavior is:
- large white/off-white canvas;
- very thin gray dividers;
- generous empty space;
- vertical column boundaries visible in many sections;
- content arranged as asymmetric editorial blocks;
- visual rhythm created by alternating:
  - large text areas,
  - screenshots/product surfaces,
  - quiet whitespace,
  - dark full-width sections.

Translate that into the application UI:
- persistent sidebar or compact rail;
- top utility bar;
- large central work canvas;
- optional right contextual panel;
- thin borders, not floating card piles;
- high information density inside tables, lower density around them.

## 1.2 Shape language

Default radius should be small and restrained.

Use:
- `0px` for large layout boundaries and data tables;
- `4px` for compact controls;
- `6px` for inputs/buttons;
- `8px` maximum for overlays or special contained surfaces.

Avoid:
- 16–24px rounded cards everywhere;
- pill-shaped containers unless they represent status/tags;
- glassmorphism;
- thick shadows;
- overly soft consumer-app styling.

## 1.3 Borders

Borders are a major visual tool.

Base:
- 1px neutral border;
- very low contrast;
- visible enough to reveal layout geometry.

Use borders to:
- define columns;
- divide table rows;
- separate panels;
- frame screenshots/data views;
- create section rhythm.

Do not use borders merely as decoration.

---

# 2. Color System

The product is predominantly neutral.

## 2.1 Light mode

```css
--bg: #F6F6F4;
--canvas: #FBFBF9;
--surface: #FFFFFF;
--surface-subtle: #F2F2EF;

--text: #111111;
--text-secondary: #555555;
--text-muted: #858585;
--text-faint: #A8A8A8;

--border: #E6E6E2;
--border-strong: #D8D8D2;

--accent: #2F5BFF;
--accent-hover: #244CE0;
--accent-soft: #EEF2FF;

--positive: #137A4B;
--positive-soft: #EDF8F1;
--warning: #8A6500;
--warning-soft: #FFF8DF;
--danger: #B3261E;
--danger-soft: #FFF0EE;
--info: #3157C8;
--info-soft: #EFF3FF;
```

## 2.2 Dark mode

Dark mode must resemble the black sections in the visual reference:
deep black, crisp white, restrained gray, very little chromatic noise.

```css
--bg: #090A0C;
--canvas: #0D0E11;
--surface: #111216;
--surface-subtle: #17181D;

--text: #F5F5F2;
--text-secondary: #B7B7B2;
--text-muted: #7E7F84;

--border: #24262C;
--border-strong: #34363D;

--accent: #6E8BFF;
--accent-hover: #8CA1FF;
```

## 2.3 Color rules

- Blue is functional, not decorative.
- Red is reserved for destructive/error states.
- Green is reserved for success/positive operational state.
- Do not color every metric.
- Most charts should begin neutral and use accent only to emphasize the selected/important series.
- Status colors should remain muted and professional.
- Never use rainbow dashboards.

---

# 3. Typography

Typography carries the personality of the product.

## 3.1 Two-family system

Use two distinct typographic voices:

### Display / editorial
For:
- page hero titles;
- major section headings;
- selected KPI storytelling;
- landing/product narrative;
- executive summary statements.

Preferred characteristics:
- high-contrast serif;
- elegant;
- slightly editorial;
- strong at very large sizes.

Recommended:
- `Instrument Serif`
- fallback: `Georgia`, `Times New Roman`, serif

### UI / operational
For:
- navigation;
- forms;
- tables;
- buttons;
- labels;
- filters;
- small metrics.

Recommended:
- `Inter`
- fallback: `Segoe UI`, `Arial`, sans-serif

Arabic:
- use a clean Arabic sans for UI;
- use an elegant Arabic display family only for large editorial headings;
- RTL layouts must preserve the same density and alignment discipline.

## 3.2 Type scale

```css
--display-xl: clamp(54px, 7vw, 112px);
--display-lg: clamp(44px, 5.5vw, 88px);
--display-md: clamp(36px, 4vw, 64px);

--h1: 36px;
--h2: 28px;
--h3: 22px;
--h4: 18px;

--body-lg: 17px;
--body: 14px;
--body-sm: 13px;
--caption: 11px;
--micro: 10px;
```

Operational screens should remain compact:
- tables: 12–13px;
- form labels: 11–12px;
- navigation: 12–13px;
- buttons: 12–13px.

## 3.3 Typography behavior

- Display serif: normal weight, tight line-height, confident whitespace.
- UI sans: medium/regular weights, never excessively bold.
- Uppercase can be used sparingly for micro labels.
- Avoid giant bold sans-serif SaaS headlines.
- Avoid overusing font weight to create hierarchy; use size, spacing and contrast instead.

---

# 4. Spacing System

Use an 8px base rhythm with smaller 4px subdivisions.

```txt
4   micro
8   tight
12  compact
16  standard
24  comfortable
32  section-inner
48  section
64  major
96  editorial
128 hero
```

Rules:
- operational screens: compact;
- dashboards: balanced;
- executive/editorial areas: generous;
- no random spacing values;
- vertical rhythm must remain consistent across all modules.

---

# 5. Global Application Shell

## 5.1 Desktop structure

Preferred shell:

```txt
┌────────────┬───────────────────────────────────────────┬───────────────┐
│ Sidebar    │ Top utility bar                           │ Context panel │
│ 64/220px   ├───────────────────────────────────────────┤ optional      │
│            │ Main work canvas                          │ 320–420px     │
│            │                                           │               │
└────────────┴───────────────────────────────────────────┴───────────────┘
```

Sidebar:
- collapsible;
- narrow icon rail when collapsed;
- white/off-white;
- subtle right border;
- no heavy background color;
- icons small and geometric;
- labels quiet;
- current item indicated by subtle background/border, not a giant colored pill.

Top bar:
- 48–56px;
- thin bottom border;
- contains page title/context, global search, command launcher, notifications, profile/company switcher.

Main canvas:
- max width should depend on task;
- data pages can use full width;
- record pages can use split panels;
- reports can use controlled centered width.

## 5.2 Mobile shell

- sidebar becomes drawer;
- top bar stays compact;
- contextual panel becomes full-screen sheet;
- tables switch to responsive rows or horizontal scrolling;
- critical actions remain reachable near the bottom or top-right;
- never simply shrink the desktop layout.

---

# 6. Page Architecture

Every product page should belong to one of these patterns.

## 6.1 Index / data page

Structure:
1. eyebrow/context;
2. page title;
3. compact description or summary;
4. action row;
5. filter/view controls;
6. primary table/list/kanban;
7. optional secondary insight area.

The table is the hero. Avoid wrapping the entire table in a giant rounded card.

## 6.2 Record page

Prefer:
- side drawer for fast inspection;
- full page only for complex editing.

Record structure:
- compact header with title, status, actions;
- metadata row;
- tab strip;
- main content;
- activity/timeline;
- related records;
- attachments;
- audit trail.

## 6.3 Dashboard

The screenshot uses editorial rhythm instead of “12 colorful cards”.

Dashboard rules:
- one clear primary KPI;
- 2–4 supporting metrics;
- charts aligned to a grid;
- thin dividers;
- textual insight beside visualization;
- one or two accent colors;
- generous whitespace around executive summaries;
- user-configurable layout.

## 6.4 Setup page

Use:
- left navigation/list;
- right editor/detail;
- clear grouping;
- inline help;
- minimal modal usage.

---

# 7. Data Table System

The table is one of the most important components in the whole platform.

## 7.1 Appearance

- no outer rounded card by default;
- 1px row separators;
- header background almost identical to canvas;
- sticky header;
- 44–48px row height;
- dense variant: 36–40px;
- subtle hover;
- selected row: light accent wash;
- typography compact and neutral.

## 7.2 Capabilities

All major tables should support:
- sorting;
- filtering;
- global search;
- column visibility;
- column reorder;
- column resize;
- pinning;
- saved views;
- grouping;
- row selection;
- bulk actions;
- export;
- pagination;
- virtualization for large datasets;
- keyboard navigation;
- server-side filters for large data;
- permission-aware actions.

## 7.3 Cell behavior

Use specialized cell renderers:
- status;
- money;
- quantity;
- date/time;
- user;
- relation;
- progress;
- warning;
- attachment;
- editable value.

Do not render every value as plain text.

---

# 8. Universal View Engine

Every business object should be able to render through shared view definitions rather than a custom page.

Supported view types:
- table;
- compact list;
- kanban;
- calendar;
- timeline;
- dashboard;
- record/detail;
- board;
- metric summary.

Saved view definition should include:
- fields;
- field order;
- filters;
- sorting;
- grouping;
- density;
- visualization type;
- permissions;
- personal/shared visibility.

---

# 9. Cards and Panels

Cards are used sparingly.

Use a card only when:
- information has a strong conceptual boundary;
- it needs its own action set;
- it needs to move independently in a dashboard.

Default card:
- white background;
- 1px border;
- radius 6px;
- no or extremely subtle shadow;
- 16–24px padding.

Avoid:
- dozens of floating cards;
- every section in a card;
- heavy shadows;
- pastel backgrounds everywhere.

---

# 10. Buttons

## Primary
- near-black or accent blue depending on importance;
- compact;
- 32–36px height;
- radius 4–6px.

## Secondary
- white/transparent;
- thin border.

## Tertiary
- text only.

## Destructive
- neutral until hover when possible;
- red for confirmation/destructive emphasis.

Rules:
- one primary action per local context;
- do not fill screens with blue buttons;
- icons can precede labels;
- icon-only actions must have tooltips.

---

# 11. Forms

Forms should feel like editorial documents, not giant boxed settings pages.

Rules:
- labels above controls;
- help text below;
- compact fields;
- logical sections separated by whitespace/dividers;
- inline validation;
- destructive warnings only where needed;
- 1–2 column layout on desktop;
- single column on mobile.

Input:
- 36–40px height;
- subtle border;
- white background;
- focus ring 2px accent with low-opacity outer glow.

---

# 12. Drawers, Dialogs and Overlays

## Drawer
Primary pattern for record inspection/editing.

Desktop:
- right side;
- 380–560px normal;
- 700–900px for complex records.

Use:
- sticky header;
- tabs;
- scrollable content;
- fixed footer actions only when editing.

## Dialog
Use only for:
- confirmation;
- compact creation;
- sensitive actions;
- short decision flows.

Never put an entire application screen in a modal.

---

# 13. Navigation

Sidebar groups should be business-oriented, not technical.

Example:
- Home
- Work
- Customers
- Orders
- Inventory
- Service
- Finance
- Reports
- Automation
- Administration

Navigation must be:
- recipe-driven;
- permission-driven;
- searchable;
- reorderable later;
- able to support favorites.

Secondary navigation:
- tabs;
- local sidebar;
- breadcrumbs where hierarchy matters.

---

# 14. Global Search and Command Palette

Keyboard-first.

Open with:
- `Ctrl/Cmd + K`

Supports:
- search all permitted records;
- open screens;
- run commands;
- create records;
- switch company/branch;
- jump to reports;
- launch workflows.

Results:
- grouped by type;
- compact;
- keyboard navigable;
- show minimal metadata;
- respect authorization completely.

---

# 15. Dashboards

Dashboard builder should use a restrained grid.

Widget types:
- KPI;
- trend;
- bar;
- stacked bar;
- line;
- area;
- donut only when truly useful;
- table;
- list;
- text insight;
- activity;
- exceptions;
- alerts.

Rules:
- data labels only when helpful;
- no 3D charts;
- no chartjunk;
- no unnecessary legends;
- use direct labels where possible;
- baseline and units must be clear;
- tooltip must provide exact value and context.

Dashboard editing:
- drag and drop;
- resize;
- save personal/shared layouts;
- undo/reset;
- permission-aware data sources.

---

# 16. Status Language

Status chips should be compact and quiet.

Examples:
- Draft
- Pending
- Approved
- Posted
- Reversed
- Cancelled
- Warning
- Failed

Appearance:
- 22–24px height;
- radius 999px allowed here;
- subtle background;
- strong readable label;
- optional 6px dot.

Do not use saturated status pills.

---

# 17. Activity and Timeline

Timeline resembles the visual reference:
- thin vertical line;
- compact event dots;
- generous text spacing;
- date/user metadata muted;
- expandable details.

Events:
- creation;
- updates;
- approvals;
- comments;
- file versions;
- automated actions;
- workflow steps;
- failures;
- reversals.

Audit events should remain visually distinguishable from user discussion.

---

# 18. Empty, Loading and Error States

## Empty
- quiet;
- small icon/illustration;
- one clear explanation;
- one primary next action;
- never huge decorative artwork in business screens.

## Loading
- skeletons matching actual layout;
- avoid full-page spinners.

## Error
- explain what happened;
- state whether data was saved;
- show a recovery action;
- include request/reference ID for technical support when relevant.

---

# 19. Motion

Motion should feel expensive because it is restrained.

Timing:
```css
--motion-fast: 120ms;
--motion-standard: 180ms;
--motion-slow: 260ms;
```

Easing:
```css
cubic-bezier(0.2, 0.8, 0.2, 1)
```

Use motion for:
- drawer open/close;
- menu appearance;
- hover feedback;
- row expansion;
- tab content;
- loading transitions;
- drag/drop.

Avoid:
- bouncing;
- overshoot;
- long fades;
- decorative parallax in operational screens;
- animation that blocks interaction.

Respect `prefers-reduced-motion`.

---

# 20. Marketing / Product Presentation Pages

When the platform needs a public product page, reproduce the visual grammar of the reference image.

## Hero
- white background;
- oversized serif headline;
- narrow supporting copy;
- small rectangular CTA;
- product screenshot directly below;
- strong black/white contrast.

## Editorial section pattern
Alternate:
- text left / visual right;
- visual left / text right;
- full-width dark section;
- white section with grid;
- large numeric/statistic statement;
- FAQ list;
- dark footer.

## Grid
Visible vertical and horizontal guide lines are encouraged.

## Screenshots
Place product screenshots inside clean framed browser/app surfaces.
Avoid device mockups unless the device itself adds meaning.

## Dark section
- near-black background;
- white serif headline;
- compact white buttons;
- subtle grid lines;
- product UI floating inside.

---

# 21. Responsive Design

Breakpoints:
```txt
mobile: < 640
tablet: 640–1023
desktop: 1024–1439
wide: >= 1440
```

Rules:
- preserve hierarchy, not pixel dimensions;
- reduce columns progressively;
- drawers become full screens on small devices;
- data tables can horizontally scroll;
- primary actions stay visible;
- avoid tiny text below 12px;
- tap targets at least 40px.

---

# 22. RTL / LTR

RTL is a first-class mode.

Requirements:
- no hard-coded `left/right` where logical CSS works;
- use `margin-inline`, `padding-inline`, `border-inline`, `inset-inline`;
- icons that imply direction must flip;
- tables preserve numeric alignment;
- timeline and drawer placement should adapt logically;
- Arabic typography must not be squeezed into English line-height rules.

---

# 23. Accessibility

Target WCAG 2.2 AA.

Must include:
- full keyboard support;
- visible focus states;
- semantic landmarks;
- proper labels;
- screen-reader names;
- contrast compliance;
- reduced motion;
- no color-only status meaning;
- accessible table headers;
- predictable tab order;
- escape closes overlays;
- focus trapped/restored correctly for dialogs/drawers.

---

# 24. Design-System Component Library

Build reusable components before page-specific styling.

Required foundation:

```txt
AppShell
Sidebar
Topbar
CommandPalette
PageHeader
SectionHeader
Breadcrumb
Tabs
Toolbar
Button
IconButton
Input
Textarea
Select
Combobox
Checkbox
Radio
Switch
DatePicker
FilterBuilder
StatusChip
Badge
Tooltip
Popover
DropdownMenu
Dialog
Drawer
Toast
InlineNotice
EmptyState
Skeleton
DataTable
DataGridToolbar
Pagination
Kanban
Calendar
Timeline
ActivityFeed
Kpi
ChartFrame
DashboardGrid
FileUploader
AttachmentListAuditViewer
PermissionGuard
```

Pages must compose these primitives instead of inventing local versions.

---

# 25. Design Tokens

Create shared tokens, never page-local magic values.

Tokens must cover:
- color;
- spacing;
- typography;
- radius;
- border;
- shadow;
- motion;
- z-index;
- density;
- chart colors.

Use CSS variables or a typed token layer.

---

# 26. Iconography

Use one icon family across the platform.

Style:
- simple outline;
- 1.5–2px stroke;
- geometric;
- no filled cartoon icons.

Size:
- 14px compact;
- 16px default;
- 18–20px primary action.

---

# 27. Density Modes

Support:
- Comfortable
- Compact

Compact mode is important for:
- inventory;
- finance;
- operations;
- large data tables.

User preference should persist.

---

# 28. Personalization

Allow users to personalize without breaking system consistency.

Possible settings:
- saved views;
- dashboard layout;
- column visibility/order;
- density;
- theme;
- default landing page;
- favorites.

Company administrators may define default views.

---

# 29. Permission-Aware UI

The UI mirrors permissions, but never replaces server enforcement.

Rules:
- hide impossible actions;
- disable temporarily unavailable actions with explanation;
- do not expose inaccessible object names/data;
- drawers, search, dashboards and AI must use the same capability model;
- stale permission policy must trigger refresh before sensitive action.

---

# 30. AI Experience

AI must feel like part of the operating system, not a separate chatbot island.

Entry points:
- command palette;
- contextual action in record;
- report/dashboard builder;
- workflow builder;
- global assistant panel.

AI may:
- summarize;
- analyze;
- propose views;
- generate filters;
- build reports;
- draft workflow definitions;
- explain exceptions;
- prepare commands for user confirmation.

AI may not:
- bypass permissions;
- write directly to database;
- silently execute sensitive operations;
- expose inaccessible records.

All actions must pass through the platform command gateway.

---

# 31. Performance UX

The product should feel instant.

Targets:
- immediate interaction feedback <100ms;
- common navigation visibly responds <200ms;
- list loading shows skeleton instantly;
- drawers may optimistically open while details load;
- virtualization for large tables;
- lazy load heavy secondary content;
- cache safe read queries;
- never freeze UI during import/export.

---

# 32. Content Style

UI copy should be:
- short;
- factual;
- calm;
- human;
- explicit when an action is irreversible.

Avoid:
- marketing language inside operational screens;
- technical database terminology;
- unexplained abbreviations;
- vague error messages.

---

# 33. What Must Never Happen

Do not:
- turn every section into a rounded card;
- use 5+ accent colors on one screen;
- use gradients for decoration;
- add excessive shadows;
- use giant icons;
- introduce a different visual style per module;
- allow a page to define its own colors/radii/spacing;
- copy another product’s brand identity;
- prioritize visual novelty over operational clarity;
- hide critical data behind unnecessary animation;
- break RTL;
- reduce accessibility for aesthetics.

---

# 34. Reference Screen Behavior

The supplied screenshot should be interpreted as these reusable principles:

1. **Top-level calm**  
   White space first, content second.

2. **Typography as architecture**  
   Large serif statements define major moments.

3. **Thin grid lines**  
   The page feels constructed, not decorated.

4. **Black sections as punctuation**  
   Dark areas create controlled contrast.

5. **Product screenshots are central**  
   Real UI is the visual proof.

6. **Small functional blue accents**  
   Blue guides attention without dominating.

7. **Asymmetrical editorial layouts**  
   Alternating text/image columns prevent monotony.

8. **Minimal rounded containers**  
   Structure comes from alignment and borders.

9. **Strong mobile interpretation**  
   Mobile maintains the same identity, not a different theme.

10. **Premium restraint**  
    Fewer visual ingredients, used consistently.

---

# 35. Implementation Rules for Agents

Before changing UI:
1. read this `DESIGN.md`;
2. identify an existing reusable component;
3. extend the component if needed;
4. do not create local CSS if a token/component can solve it;
5. preserve all existing business behavior;
6. test desktop + tablet + mobile;
7. test light + dark;
8. test RTL + LTR;
9. test keyboard interaction;
10. run typecheck and automated tests.

Any design deviation must be documented.

---

# 36. Visual QA Checklist

A screen is not complete until all answers are “yes”:

- Does it look like the same product as every other module?
- Is the main task obvious within 3 seconds?
- Is there only one dominant action?
- Is the table/list the visual hero when the task is data-heavy?
- Are borders and spacing doing more work than decoration?
- Is typography creating hierarchy?
- Are colors restrained?
- Are empty/loading/error states designed?
- Does keyboard navigation work?
- Does the layout work in RTL?
- Does it work at 360px width?
- Does it work on a wide desktop?
- Are permissions reflected correctly?
- Does dark mode remain calm and legible?
- Are all values aligned and formatted consistently?
- Are hover/focus/selected/disabled states covered?
- Is motion subtle and under ~260ms?
- Are destructive actions clearly protected?
- Is there any page-specific styling that belongs in the design system instead?
- Does the screen feel premium, quiet and operational?

---

# 37. Final Design Principle

**The system should not look like many business modules sharing a database.  
It should look like one coherent operating system that happens to understand many businesses.**