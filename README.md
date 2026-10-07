# FlowBoard

Production-oriented Trello-style project management (Next.js 14, Prisma, PostgreSQL, Auth.js).

## Phase 3 — Drag and drop

Lists can be reordered horizontally. Cards can be reordered in a list and
moved to another list, including empty lists. Dragging supports mouse, touch,
and keyboard input, screen-reader announcements, overlays, drop indicators,
and horizontal edge auto-scroll. Move requests update the board cache
optimistically and restore it with an error toast if the server rejects them.

Moves use fractional positions from `src/lib/position.ts`; invalid, duplicate,
or overlong legacy ranks are rebalanced. Card moves enforce target-list WIP
limits and create a `CARD_MOVED` Activity record. Run `npm.cmd test` for the
position helper tests.

## Phase 2 — Workspaces, boards, lists, and cards

Phase 2 adds workspace membership and invitation links, workspace/board
management, favorites, horizontal board columns, lists, and cards. Invitations
are logged in the development server console and can be accepted by the invited
email after signing in. User roles are Owner, Admin, Member, and Viewer;
Viewers have read-only access.

Board/list/card content is loaded through TanStack Query.

## Phase 1 — Setup, schema, auth

## Phase 5 Lite — Notifications

The app header polls unread notifications every 30 seconds. Notification
preferences are available at **Settings → Notifications**. Email delivery is
optional and uses Resend; without `RESEND_API_KEY`, enabled email notifications
are logged by the development server. Configure `RESEND_FROM_EMAIL` alongside
the key in production. Set a strong `CRON_SECRET` for the hourly Vercel Cron
endpoint at `/api/cron/due-soon`; requests must include
`Authorization: Bearer <CRON_SECRET>`.

To apply the additive notification schema migration on Windows, from the
project directory run:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm.cmd run build
```

Do not use `prisma migrate dev` or `prisma migrate reset` against the Neon
database. If Prisma Client generation reports files in use, stop only the
project's verified Node process by PID, run `npx.cmd prisma generate`, then
restart the app.

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local Docker, Neon, or Supabase)

### Install

```bash
cd flowboard
cp .env.example .env
# Edit DATABASE_URL and AUTH_SECRET
npm install
npx prisma migrate dev --name init
npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected to `/login`.

### Test Phase 1

1. **Sign up** at `/signup` with email + password.
2. **Home** loads with welcome message and profile link.
3. **Profile** — update name, bio, accent color, theme.
4. **Forgot password** — submit email; in development the reset URL is printed in the terminal running `npm run dev`.
5. **Google sign-in** — only if `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
6. **Sign out** from the header, then sign in again.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Position logic unit tests |
| `npx prisma studio` | Browse database |

## Project structure

```
src/
  app/(auth)/     # Login, signup, password reset
  app/(app)/      # Authenticated shell (home, profile)
  app/api/auth/   # Register, reset, NextAuth handler
  actions/        # Server actions
  components/     # UI + auth + layout
  lib/            # Prisma, validations, auth helpers
  auth.ts         # Auth.js configuration
prisma/schema.prisma
```

## Test Phase 2

1. Sign up with a new name and email; a default owner workspace is created automatically.
2. Use **+** beside Workspaces to create another workspace. Use **Create board** in a workspace to choose a title and background color.
3. Open the board, add lists, cards, and WIP limits. Rename, copy, archive, and delete lists/cards using their action menus.
4. Star a board, change its visibility, rename it, and archive it from the board header.
5. Invite another account from the workspace sidebar. In development, open the invitation URL printed in the `npm run dev` console while signed in as the invited email, then accept.
6. Sign in as a Viewer and verify board data is visible but mutations are forbidden.

## Test Phase 3

1. Run `npm.cmd run dev` and open an existing board containing multiple lists and cards.
2. Drag a list by its grip handle to reorder it horizontally; reload and verify the order persists.
3. Drag a card by its grip handle within a list and between lists. Try an empty list and confirm the card appears there after reload.
4. Use a keyboard to focus a list or card grip handle. Press Space to pick it up, arrow keys to move it, and Space to drop it; listen for screen-reader announcements.
5. On a touch device or browser device emulation, press and hold a handle to drag. Verify scrolling works when not dragging and the board auto-scrolls when dragging near either horizontal edge.
6. Set a target list WIP limit, fill it, then attempt to move another card into it. Confirm the move is rejected and the card stays in its source list.
7. Run `npm.cmd test` and confirm all position tests pass.

## Settings and UI polish

Open **Settings** from the sidebar for Profile, Security, Preferences, and
Workspace members and roles. Profile photos accept JPEG, PNG, and WebP up to
2 MB and are stored in the local `uploads/avatars` directory by default. Set
`FLOWBOARD_AVATAR_DIR` to a persistent writable directory when deploying to a
host with ephemeral application filesystems. Avatar images are served through
the `/api/avatars/{fileName}` route.

The migration `20261007120000_settings_preferences` adds token-version
invalidation for sign-out-everywhere and a per-user default-workspace setting.
After configuring `DATABASE_URL`, apply it with:

```powershell
.\node_modules\.bin\prisma.cmd migrate deploy
.\node_modules\.bin\prisma.cmd generate
```

For local development, `npx.cmd prisma migrate dev` applies pending migrations.
The application does not apply this migration automatically.

Workspace Owners and Admins can manage members and invitations. Owners can
assign workspace Owners; Admins can manage Members and Viewers. The final
workspace Owner cannot be demoted or removed. Board settings allow Owners and
Admins to override Member/Viewer board access for individual workspace
members. Account deletion permanently removes workspaces owned by that account.

## Phase 4A — Card details

Click a card to open its accessible detail dialog; double-click its title (or
use the pencil) to rename it. The card URL includes `?card=<cardId>` so the
dialog can be bookmarked, refreshed, and opened/closed with browser history.
Card detail supports Markdown descriptions, priorities, board labels and member
assignments, dates/reminders/completion, checklists, subtasks, time estimates,
following, copying, moving between boards/lists, and an activity history.
Checklist items can be reordered with the up/down controls or converted into
cards. Viewers can open details but cannot make changes.

Apply the priority enum migration before running the app against a database
with the old priority values:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
```

The migration is `20261007130000_card_detail_phase_4a`; it renames the existing
`MEDIUM` and `CRITICAL` enum values to `NORMAL` and `URGENT`, preserving card
priority data.

Card watchers and time estimates are added by
`20261007142000_card_watchers_and_estimates`. Apply pending migrations safely
from PowerShell (do not use `migrate dev` or reset the database):

```powershell
Set-Location 'C:\Bhautik\Flow Board\flowboard'
npx.cmd prisma migrate deploy
npx.cmd prisma generate
```

Board Owners/Admins and board Admin overrides can change backgrounds from
**Board menu → Change background**. Available options include preset colors,
gradients, HTTPS image URLs, and JPEG/PNG/WebP uploads (up to 5 MB). Card
attachments, comments, reactions, and mentions are available in Phase 4B.

To test on Windows:

1. Run `npm.cmd run dev`, sign in, and open a board with a card.
2. Click the card title. Confirm the URL becomes
   `/boards/<boardId>?card=<cardId>`. Refresh; the same card dialog should open.
   Use browser Back to close it and Forward to reopen it; Escape should close
   it and focus should remain accessible.
3. Double-click the card title to rename it; Enter saves, Escape cancels, and
   blur saves. Use the Write/Preview description tabs with bold, links, lists,
   and code, and verify the description badge appears on the card.
4. Set each priority in the dialog and the card `...` menu. Confirm the face
   badge uses the Low/Normal/High/Urgent colors.
5. Create labels with different colors, assign them, edit and delete labels.
   Confirm card faces display the assigned labels.
6. Assign/unassign board members and verify their avatars on the card face.
7. Set start/due/reminder dates and complete/reopen the card. Verify overdue,
   due-soon, and completed due-date badge colors.
8. Create two checklists, add and rename items, check/uncheck, reorder, delete,
   and convert an item to a card. Confirm progress updates on the card face.
9. Add and complete subtasks; confirm progress updates. Set/clear a time
   estimate, follow/unfollow, copy, archive, and delete a test card. Use Move
   card to move a card within the board and to another board in the workspace.
10. Copy the share link and open it in another tab. Confirm Created by and
    Activity appear at the bottom of the dialog.
11. As an Owner/Admin, use **Board menu → Change background** to apply a preset,
    gradient, HTTPS URL, and upload. As a Member/Viewer, verify the menu option
    is absent and a direct background change request returns 403.
12. Add an attachment using drag/drop and the picker. Verify image previews,
    PDF name/size and new-tab opening, deletion, and Make cover. Add an HTTPS
    link. Try a file over 10 MB, an unsupported type, and a renamed/non-matching
    file signature; each must be rejected with an error.
13. Add, edit, and delete comments. Test emoji reactions and mention a workspace
    member in a comment and the card description; verify the mentioner is not
    notified and each newly mentioned member gets a Notification. Confirm the
    Activity section records attachment, cover, comment, and reaction events.
14. Verify attachment and comment counts update on the card face and an image
    cover is shown. Sign in as a Viewer and confirm uploads, link creation,
    comments, reactions, and attachment changes are rejected; verify ordinary
    members can only edit/delete their own comments while Owners/Admins can
    delete any comment.
15. Without S3 settings, confirm local development files are saved under
    `public/uploads` (ignored by Git). For production, configure all of
    `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and
    `S3_SECRET_ACCESS_KEY`; optionally set `S3_PUBLIC_URL`.
16. Drag lists and cards (including into an empty list) to confirm Phase 3
    still works. Run `npm.cmd test`, `npm.cmd run lint`, and
    `.\node_modules\.bin\tsc.cmd --noEmit`.

Phase 4B does not change the Prisma schema, so it has no new migration. To
safely apply any previously pending migrations on Windows (without reset or
`migrate dev`), run:

```powershell
Set-Location 'C:\Bhautik\Flow Board\flowboard'
npx.cmd prisma migrate deploy
npx.cmd prisma generate
```

## Phase 4C — Agency client review

Phase 4C adds the `CLIENT` workspace/board role, internal versus client-visible
cards and comments, approval and revision rounds, token-based client share
links, image feedback pins and attachment versions, and four agency board
templates (Logo Design, Social Media Campaign, Website Design, and Branding
Package). Client access is limited to explicitly shared boards and
`CLIENT_VISIBLE` cards; internal comments and team-only card details are not
returned. Share links are bearer credentials: anyone who has an active link
can view the client portal, so revoke links that should no longer work.

Creating a share link returns a copyable URL; email delivery is not configured.
Links can be given an optional expiration and revoked from the board's client
sharing controls.

The safe migration is `20261007150622_agency_client_portal`. Do not use
`prisma migrate dev`, `db push`, or reset against the persistent Neon database.
Apply the migration and regenerate Prisma Client from PowerShell:

```powershell
Set-Location 'C:\Bhautik\Flow Board\flowboard'
npx.cmd prisma migrate deploy
npx.cmd prisma generate
```

To test on Windows:

1. Apply the migration commands above, then run `npm.cmd run dev` and sign in
   as a workspace Owner/Admin.
2. Open a board, apply each of the four templates from the board controls, and
   verify it creates the Brief, In Progress, Internal Review, Client Review,
   Revisions, Approved, and Delivered lists with sample cards/checklists.
3. On a test card, set visibility to **Client visible** and send it for
   approval. Leave another card internal and add both team-only and
   client-visible comments to the shared card.
4. Create a client share link, copy it, and open it in a private/incognito
   window. Confirm only client-visible cards and client-visible comments are
   shown. Add a comment, upload a supported file, approve a card, and request
   changes with a note; verify missing notes are rejected and revision rounds
   increase.
5. Revoke the link and verify the same portal URL and its attachment links no
   longer work. Create a link with an expiry and verify expired links are
   rejected.
6. Sign in as an account with the board-level Client role and confirm the
   client view omits internal cards/comments, member identities, and time
   estimates, while allowing client comments, uploads, and approval actions.
   Confirm the client cannot access workspace settings or mutate team-only
   content.
7. Open an image attachment and add pins at multiple points. Resolve and
   reopen a pin. Upload another image version, switch versions, and confirm
   the selected version/cover is displayed. Verify pins are scoped to the
   selected attachment image.
8. Test portal and authenticated client links after changing a card back to
   internal visibility; it must disappear and attachment/pin APIs must deny
   access.
9. Run `npm.cmd test`, `npm.cmd run lint`, `npx.cmd tsc --noEmit`, and
   `npm.cmd run build`.
#   f l o w b o a r d  
 