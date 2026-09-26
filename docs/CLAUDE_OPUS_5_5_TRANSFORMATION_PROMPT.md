# Claude Opus 5.5 — Business Systems Factory Transformation Prompt

You are the lead architect, product designer and senior engineer for this repository.

Before changing anything, fully read:
- `docs/MASTER_PLAN.md`
- `CLAUDE.md`
- all phase reports
- `DESIGN.md`
- the complete current architecture, migrations, tests, engines, recipes, generator, authorization, audit, jobs, files and UI.

Treat `DESIGN.md` as the non-negotiable visual source of truth. The supplied Paradigm/Godly screenshot is the primary visual reference for the product language: editorial monochrome layout, thin structural grid lines, premium serif display typography + neutral sans-serif UI typography, large whitespace, restrained blue accents, dark contrast sections, compact enterprise tables, drawers, refined motion and strong responsive/mobile behavior. Reproduce its design language and quality, never its branding or copyrighted copy/assets.

Research current best practices and open-source patterns from Twenty, Frappe/ERPNext, Medusa, Vendure, TanStack Table, Radix UI, Carbon and other strong enterprise products. Learn architecture and interaction patterns, but do not copy incompatible licensed code.

Evolve this project from several applications on a shared core into a true **Business Systems Factory** while preserving our strongest foundations: tenant isolation, RLS, command gateway, authorization, auditability, append-only history, transactional integrity, idempotency, engines, recipes and tests.

Update the master plan and implement an incremental roadmap for:

1. **Business Metadata Layer**  
   Define entities, fields, relationships, statuses, actions and configurable business objects so new business areas do not require handwritten screens for every object.

2. **Universal View Engine**  
   Reusable table, list, Kanban, calendar, timeline, dashboard and record-detail views with saved views, filters, grouping, sorting, column controls, bulk actions, virtualization and permission awareness.

3. **Enterprise Design System**  
   Implement `DESIGN.md` through reusable tokens and components. Replace page-specific styling with one coherent product system. Support light/dark, RTL/LTR, mobile, accessibility and subtle motion.

4. **Record Workspace**  
   Fast side drawers, tabs, related records, attachments, timelines, audit history and contextual actions without losing the user’s place.

5. **Workflow Engine**  
   Reusable approvals, conditions, branches, delays, schedules, jobs, notifications, webhooks, compensation and resumable long-running flows.

6. **Stable Extension Contracts**  
   Engines, integrations and future plugins must extend the platform through documented contracts without modifying unrelated core modules.

7. **Global Search + Command Palette**  
   Search permitted records/actions across the system and execute commands quickly.

8. **Dashboard + Report Builder**  
   Configurable KPIs, charts, drill-downs, saved reports, widgets and personal/shared layouts.

9. **Activity + Notification Center**  
   Approvals, assignments, mentions, failures, alerts and work requiring attention.

10. **Production Security & Operations**  
    Invitations, password recovery, MFA/step-up auth, session/device management, rate limits, health checks, structured logs, metrics, tracing, backup verification and disaster-recovery tests.

11. **Permission-Aware AI Layer**  
    AI may search, explain, analyze, build views/reports/workflows and propose commands, but every data read/action must respect installed recipe capabilities and authorization. AI must never write directly to the database.

Create or strengthen these source-of-truth documents:
- `docs/MASTER_PLAN.md`
- `docs/ARCHITECTURE.md`
- `DESIGN.md`
- `docs/PRODUCT_SYSTEM.md`
- `docs/MODULE_CONTRACT.md`
- `docs/WORKFLOW_SYSTEM.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`
- `CLAUDE.md`

Documentation must include system diagrams, contracts, data flows, module boundaries, examples, migration rules, UX patterns, acceptance criteria, testing rules and explicit “must not break” constraints.

Then progressively redesign the current web application according to `DESIGN.md`. Build reusable components first, then migrate screens. Do not rewrite working foundations merely to use newer technology. Every change must preserve tenant isolation, authorization, auditability, transaction safety, compatibility and automated tests.

For every phase:
- explain the goal;
- list affected contracts/files;
- identify risks;
- implement the smallest coherent slice;
- add/update tests;
- verify responsive + RTL/LTR + keyboard accessibility;
- document decisions;
- show what is complete and what remains.

The final product must feel like one elegant enterprise operating system, not a collection of admin pages, and it must be capable of generating many customer business systems from the same safe core.