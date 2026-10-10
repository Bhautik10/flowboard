# FlowBoard: Project Context and Working Rules (READ THIS FIRST)

## 10. FIX PASS PROGRESS

- [x] 1. Filter bar and dropdowns
- [x] 2. Card modal buttons
- [x] 3. Online and uploaded board backgrounds
- [x] 4. Change email in Settings
- [ ] 5. Card-level client sharing and access
- [ ] 6. Editable role permissions
- [ ] 7. Notification sound, push, and email
- [ ] 8. Activity log with roles and change descriptions
- [ ] 9. Alignment, buttons, speed, and deployment notes

Items 1-4 are complete and verified. Item 5 is in progress: additive CardClient schema/migration, existing-client sharing API, shared-card API/page, and card-level access checks have been added. Still needed: invited-client linking, removal of board-level client-link UI and the old token portal, all-route/notification/direct-board authorization checks, and client browser QA. Items 6-9 are untouched. Resume by completing item 5; the migration has not been applied.

## 9. PHASE 7-9 PROGRESS

- [x] 7.1 Custom fields
- [ ] 7.2 Time tracking and reports
- [ ] 7.3 Card dependencies
- [ ] 7.4 Automation rules and scheduler
- [ ] 8.1 AI assistant
- [ ] 8.2 Analytics dashboards
- [ ] 8.3 Templates
- [ ] 8.4 Trello import and export
- [ ] 9.1 Product polish and accessibility
- [ ] 9.2 PWA
- [ ] 9.3 Unit and Playwright tests
- [ ] 9.4 Security review and fixes
- [ ] 9.5 Deployment readiness and legal pages

This file is for any AI coding assistant (Cursor, Codex, Claude Code, Copilot).
Read it fully before touching the project. It says what is already built, how the
project is set up, what must never be done, and how new work must be done.

Owner: Bhautik (beginner-to-intermediate, works on Windows, replies in Gujarati/English).
Product: "FlowBoard", a Trello-style project management app, being positioned as
"Trello for Agencies and Design Studios" (client approvals, design file review).

---

## 1. THE MOST IMPORTANT RULES (do not break these)

1. **Do ONLY the task in the current prompt.** Do not start the next phase, do not
   refactor unrelated code, do not rename files, do not "improve" things nobody asked for.
2. **Never delete or reset data.** The database is a real Neon Postgres with real test data.
3. **Never run** `prisma migrate dev`, `prisma migrate reset`, or `prisma db push --force-reset`.
   Schema changes must be **safe, additive migrations** (add columns/tables with defaults,
   never drop). Apply with `npx prisma migrate deploy`, and ALWAYS tell the owner the
   exact Windows commands. If a migration is not essential, do not make one.
4. **Do not change `prisma/schema.prisma` unless the prompt requires it.** If code references
   a field that is not in the schema, fix the CODE, not the schema (see Known State below).
5. **Never commit or print secrets.** `.env` is git-ignored and must stay that way.
   Never put real keys in `.env.example`. Do not use any "allow secret" bypass URLs.
6. **Do not break existing features**: drag and drop (Phase 3), portal-based dropdown menus,
   card modal, notifications, client features, role checks.
7. **Before finishing every task**: run `npx tsc --noEmit` then `npm run build` and fix every
   error. Report what you changed (list of files). If you could not run it, say so plainly.
8. **If something is ambiguous or risky, ask the owner first** instead of guessing.
9. Keep answers/explanations to the owner short and simple. Give exact Windows (CMD) commands.

---

## 2. TECH STACK AND SETUP

- Next.js 14.2 (App Router) + TypeScript + Tailwind CSS + shadcn-style components
- Auth.js v5 (next-auth), JWT sessions, Credentials login (+ optional Google). Uses the
  edge-safe split: `src/auth.config.ts` (no Prisma) and `src/auth.ts` (Prisma). `middleware.ts`
  must NEVER import Prisma (edge runtime).
- Prisma 6.19.2 + PostgreSQL on **Neon** (Singapore). No Docker (virtualization not available).
  Do NOT upgrade Prisma to 7/8.
- dnd-kit (drag and drop), TanStack Query (data fetching, polling), Zustand, Zod, framer-motion
- Positions of lists/cards use **LexoRank-style strings** (`src/lib/position.ts`), not floats.
- Email: Resend (optional; if `RESEND_API_KEY` empty, emails are logged to the console).
- File storage: S3-compatible (`S3_*` env vars). If empty, local fallback `public/uploads`
  (dev only, git-ignored; does NOT work on Vercel or on another computer).
- Realtime: NOT websockets. "Live" updates use TanStack Query polling.
- Windows: PowerShell may block `npm` (execution policy). Use **CMD**, or
  `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

Env vars (in `.env`, never committed): `DATABASE_URL` (Neon, non-pooled), `AUTH_SECRET`,
`AUTH_TRUST_HOST=true`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL` (check the real name used in code), `CRON_SECRET`, `S3_*`, `ANTHROPIC_API_KEY`
(Phase 8, empty), `REALTIME_URL` (unused, leave empty). Push VAPID variables from fix-pass item 7 are not implemented and have not been added.

Phase 7.1 custom fields require no additional environment variables.

Run on Windows (CMD):
```
cd /d "<project folder>"
npm install
npx prisma generate        (run `taskkill /F /IM node.exe` first if you get EPERM)
npm run dev
```
Only one `npm run dev` at a time (port 3000, `NEXTAUTH_URL` expects 3000).

---

## 3. WHAT IS ALREADY BUILT (Phases 1 to 5 lite, plus extras)

**Phase 1: Setup, schema, auth**
Signup, login, logout, forgot password (reset link logged in dev), profile (name, bio, accent, theme).

**Phase 2: Workspaces, boards, lists, cards CRUD**
Default workspace on signup, sidebar (workspaces and boards), workspace/board create/rename/archive/delete,
board star (per user), visibility, workspace invites by email, roles, lists (add, rename, archive, copy,
WIP limit), cards (quick-add, inline rename, archive, delete). Zod validation, toasts, skeletons, empty states.

**Phase 3: Drag and drop**
dnd-kit for lists and cards (incl. empty list), LexoRank positions + rebalance helper, optimistic UI with
rollback, WIP limit check, activity log on card move, unit tests for position logic.

**UI polish and settings pass**
Portal-based dropdowns (never clipped), custom thin scrollbars, `/settings` with tabs: Profile, Security
(change password, sign out of all devices via `User.tokenVersion`, delete account), Preferences, Workspace
members and roles (role table, invites, permission matrix). Sidebar: Home, My cards, Starred, Recent,
Workspaces/boards, Archived, Settings; collapsible, mobile drawer. Board background is Owner/Admin only.
Card UI fixes: title wraps normally, single click opens modal, rename only on double-click.

**Phase 4A and 4B: Card detail modal**
Modal with URL `?card=<id>`, title, markdown description (sanitized), priority (Low/Normal/High/Urgent),
members, labels, dates (start/due/reminder/complete), checklists (progress, convert item to card), subtasks,
card face badges, attachments (images/PDF/links, 10 MB limit, server-side checks, lightbox, make cover),
comments (edit/delete, emoji reactions, @mentions), per-card activity log.

**Agency features**
CLIENT role, card visibility INTERNAL / CLIENT_VISIBLE, comment visibility (internal vs client), approval
workflow (NONE, PENDING, APPROVED, CHANGES_REQUESTED, revision rounds), client project links (token links
with expiry and revoke), an in-progress additive `CardClient` sharing model, design-file pins (numbered comments on images, resolve), image versions (v1, v2),
agency project templates (Logo Design, Social Media Campaign, Website Design, Branding Package).

**Phase 5 lite: Notifications**
Bell with unread count (polling ~30s), mark read / all read, events (assigned, mentioned, comment, due soon,
approval requested/approved/changes requested), Resend emails, Settings > Notifications toggles,
`/api/cron/due-soon` protected by `CRON_SECRET`. CLIENT users never get internal notifications.

**Phase 7.1: Custom fields**
Board Owner/Admins can create, edit, reorder, and archive text, number, dropdown, date, and checkbox
fields. Values are editable in card details, can appear on card faces, and are available in board filters
and Table columns. Archiving retains all saved values. CLIENT users do not receive field definitions or
values; Viewers can read but cannot change them. Existing schema models are used; no migration required.

**Phase 7.2: Time tracking (implementation and build verification complete)**
Card timers, manual entries, own-entry editing and archival, totals/estimates, and board weekly CSV reports
are implemented with the existing `TimeEntry` model. `npx tsc --noEmit` and `npm run build` pass.

---

## 4. KNOWN STATE AND OPEN PROBLEMS (update this section as things change)

- **Previous client-isolation attempt was reverted.** `clientKey`, `sharedWithAllClients`, and per-client
  approval remain absent. Fix-pass item 5 adds `CardClient` in `prisma/schema.prisma` and migration
  `20261010160000_card_client_sharing`; it is NOT applied to Neon and its app integration is incomplete.
  Do not deploy that migration before item 5 is complete and tested.
- **Permissions schema state:** `WorkspaceMember.permissions` has not been added yet; item 6 remains pending.
  Do not assume per-member saved permissions are enforced.
- **BUILD STATUS:** latest `npx tsc --noEmit` and `npm run build` pass after current changes. Existing
  Next/Auth.js and `<img>` warnings remain. A running FlowBoard `next dev` process can lock Prisma's DLL.
- Phase 7.1 uses existing `CustomField` and `CustomFieldValue` models. Removing a field archives its
  row and keeps its saved values. No schema edit or migration was made for this feature.
- Pending polish list (separate task): better Home dashboard, centered modal dialogs for
  create workspace/board (with color/gradient picker), change-own-email with verification,
  fix online background image URL not rendering (quote url(), CSP/remotePatterns), client "Send comment"
  box must allow a plain comment without choosing approval.
- Local uploads (`public/uploads`) break on other computers and Vercel. Cloud storage (R2/S3/Cloudinary)
  is needed before deploy.
- Migration history has one odd migration `..._npm_run_dev` that drops an index that never existed; that is
  why `migrate dev` fails on the shadow DB. Only ever use `migrate deploy`.
- Project exists on two computers (office and personal) sharing ONE Neon database. Sync code through
  GitHub (`git pull` / `git push`), not through Google Drive.

---

## 5. ROADMAP (only build the phase the owner asks for)

- Phase 6: Search + filters, multiple views (Table, Calendar, Timeline). Status: Board URL filters,
  saved filters, workspace-scoped global search, table/calendar/timeline views, inline and bulk
  table edits, calendar due-date dragging, and timeline date dragging/resizing are implemented.
  Remaining: dependency arrows are not displayed until existing dependency records are confirmed
  and exposed safely in board data; manual browser QA is still needed for role-specific results,
  small screens, keyboard interaction, and drag-and-drop across all view modes.
- Phase 7: Automation, custom fields, time tracking, dependencies. Progress: 7.1 custom fields done;
  7.2 implemented but build verification is pending; 7.3 dependencies and 7.4 automation remain.
- Phase 8: AI features (Anthropic API), analytics dashboard, templates, Trello import
- Phase 9: Polish (dark mode, shortcuts, PWA), tests, deployment (Vercel + Neon + cloud storage)
- Later: pricing and payments (Razorpay / Paddle / Lemon Squeezy), landing page, privacy/terms pages.

Current task: fix pass item 5. Complete the client-sharing flow before starting item 6.

## 8. CHANGELOG

- 2026-10-10: Fix-pass items 1-4 complete (portal filters, card action sizing, encoded/preloaded image backgrounds, email verification/resend/cancel). Item 5 started with CardClient migration/API and a Shared with me list. Latest TypeScript and production build pass; migration is unapplied. Resume at item 5.

- 2026-10-10: Implemented Phase 7.1 custom fields using existing Prisma models. Added board settings
  management, card field values, optional card-face display, Table columns, URL filters, access checks,
  and activity records. No schema or migration changes. `npx tsc --noEmit` and `npm run build` pass.
- 2026-10-10: Implemented Phase 7.2 time tracking using existing `TimeEntry` records. TypeScript passes;
  build verification is pending because Prisma generation cannot replace its Windows engine DLL (EPERM).
  No schema or migration changes.

---

## 6. HOW EVERY NEW TASK MUST BE DONE

1. Read this file, then read only the files relevant to the task.
2. List the files you will change BEFORE changing them.
3. Write complete working code (no TODOs, no placeholders).
4. Every API route: authentication, role check, Zod validation, clear JSON error messages,
   `console.error` on server failures. Roles: OWNER, ADMIN, MEMBER, VIEWER (read-only), CLIENT.
   CLIENT can only see CLIENT_VISIBLE cards and client-visible comments/files, never internal data,
   settings, members, time tracking. Prevent IDOR (changing an id in a URL must not leak data).
5. UI: works in light and dark mode, mobile friendly, loading and empty states, toasts, keyboard accessible,
   modals are centered shadcn Dialogs (portal), menus use portals.
6. Dates/times: store UTC, display in the viewer's local time zone (Asia/Kolkata for the owner).
7. Finish with: `npx tsc --noEmit`, `npm run build` (zero errors), a list of files changed,
   exact Windows test steps, and any commands the owner must run (taskkill node, migrate deploy, generate).
8. Suggest `git add .` and `git commit -m "<message>"` after each working step.

## 7. PROMPT TEMPLATE THE OWNER WILL USE

```
Read AGENTS.md first. Work ONLY on: <task>. Do not start any other phase or change unrelated code.
Do not delete/reset data; never run migrate dev/reset; do not edit schema.prisma unless required.
List files to change, write complete code, run npx tsc --noEmit and npm run build, then tell me how
to test on Windows.
```
