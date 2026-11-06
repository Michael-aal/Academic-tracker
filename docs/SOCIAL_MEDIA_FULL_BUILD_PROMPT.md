# Academic Tracker Social Media — Full Build and Quality Prompt

You are a senior full-stack engineer working in the existing `Michael-aal/Academic-tracker` repository. Improve the existing Social Media / Preproom product; do not create a disconnected demo or replace working systems.

## Non-negotiable workflow
1. Inspect the current repository, recent commits, existing PRs, architecture, route contracts, Prisma schema/migrations, deployment configuration, and every existing Social Media page before editing.
2. Treat the supplied mobile reference image as the visual source of truth. Match its layout, spacing, hierarchy, proportions, icon placement, card density, and bottom navigation as closely as possible. If the image is not available in the working context, do not invent that it was inspected; use the established requirements below and request the image only if exact pixel matching is impossible.
3. Preserve the existing plain HTML/CSS/JavaScript frontend, Express backend, Prisma/PostgreSQL data model, authentication, Cloudinary upload integration, and existing API contracts unless a verified defect requires a compatible change.
4. Make architecture and data-flow decisions before coding. Never claim something is fixed, deployed, tested, or merged unless the corresponding action and verification actually succeeded.
5. Work on a feature branch, make focused commits, run tests and static checks, inspect the final diff, open a PR, and report its exact status. Do not merge unless explicitly asked.

## Product and visual direction
- This is an academic-focused social network called Social Media / Preproom, not a generic “Community” landing page.
- Open directly into a real feed. Do not add promotional hero copy such as “share, connect, discover” or introductory marketing paragraphs.
- Facebook-like familiar feed behavior with a clean, premium, modern student-network aesthetic.
- Responsive mobile-first design. On phones use a single-column feed, compact top bar, generous but efficient spacing, readable typography, full-width media, touch-friendly controls, and a fixed bottom navigation with exactly: Home, Explore/Friends, Create, Messages, Profile.
- The social area has its own navigation. Do not show the Academic Tracker dashboard navbar inside Social Media. Provide a clear return-to-Academic-Tracker action, and preserve the originating secondary or university dashboard when returning.
- No Stories row, circular story avatars, or Stories feature.
- Use a consistent icon system (Lucide-style SVG or the repository's icon system); avoid emoji icons, decorative blue arrows, and inconsistent icon styles.
- Respect theme settings: light mode predominantly white with dark readable text and purple accents; dark mode must have no white surfaces, using black/deep-purple surfaces and legible white/light-purple text. Maintain contrast in every component.
- Do not add green as a brand color. Green may be used only for a small semantic online-status indicator.
- Keep cards, typography, controls, and spacing consistent across feed, explore, profile, messages, and create views.

## Required screens and behavior
### 1. Home feed
- Real authenticated posts from the backend, ordered consistently and paginated.
- Composer with text, optional subject, photo/video upload from device, media preview, visibility, and a review-before-publish step.
- Post cards with author avatar/name/username, timestamp, text, media, subject, like/reaction, comments/replies, save, share, and delete/edit only for authorized owners.
- Correct loading, empty, error, and retry states. Never show fake activity or fabricated user data outside explicitly labeled demo content.

### 2. Explore people and friend discovery
- Browse all active public Social Media profiles across the platform, not only search matches.
- Exclude the current user, private/suspended profiles, and users blocked by or blocking the current user.
- Search by display name, username (including @username), institution, and programme.
- Show avatar, display name, username, education track, institution/programme, best subject, and online/offline presence.
- Sort currently online users first, then most recently active, then newest profiles.
- Online presence must be real: authenticated heartbeat updates persisted server-side; show online only while heartbeat is fresh (for example, within two minutes); otherwise show offline. Never fabricate online status from page loads or profile edits.
- Add friend sends one request; show pending, received, accepted, and remove states; prevent duplicates and self-requests; accept/decline/cancel must persist.
- Block and unblock behavior must respect privacy and prevent interaction.
- Provide pagination or load-more for large user counts; do not attempt to render thousands of users at once.
- Profile cards must be responsive and usable with keyboard and touch.

### 3. Profiles
- Clean, well-spaced profile header with avatar, cover, name, unique username, bio, best subject, interests, and meaningful stats.
- Posts/media/about/friends sections with consistent tabs.
- Edit profile in a clear, accessible flow; upload profile and cover images from the phone through the configured secure upload flow.
- Display other users' profiles with the correct friendship actions and privacy rules.
- Never expose email, private academic records, account IDs, or other private information.

### 4. Create post
- Dedicated, uncluttered composer with photo/video selection from phone, preview, caption, optional subject, and visibility.
- Validate type and size on both client and server; show upload progress and actionable errors.
- Upload media securely using backend-generated signatures; never expose Cloudinary API secret in frontend code.
- Prevent duplicate publishing while upload is in progress.

### 5. Messages
- Conversations and messages must be backed by PostgreSQL and authorized on every request.
- Only accepted friends may start direct conversations unless an existing explicit product rule says otherwise.
- Responsive conversation list and chat window; support text and the currently implemented media/voice/call capabilities without breaking existing flows.
- Correct unread indicators, loading, empty and failure states.

### 6. Notifications
- Real backend-backed notifications for friend requests, accepted requests, reactions, comments, replies, and messages.
- Accurate unread counts and navigation to the relevant record.

### 7. Navigation and routing
- Mobile fixed bottom navigation: Home, Explore, Create, Messages, Profile.
- Desktop navigation should remain clear and consistent with the supplied reference.
- Preserve deep links, browser back behavior, active tab state, and dashboard-origin context (secondary returns to secondary; university returns to university).
- Social Media must remain separate from the academic dashboard navigation.

## Backend and data integrity
- Reuse existing models and route contracts where possible; avoid duplicate models/endpoints.
- Enforce authentication, authorization, ownership, visibility, block rules, and same-academic-environment connection restrictions on the server.
- Validate and normalize all input; use parameterized Prisma queries.
- Add migrations for schema changes and ensure deploy order is safe.
- Add indexes for discovery, presence, friendships, feed pagination, and messages where justified.
- Use rate limits that allow legitimate heartbeats and browsing without triggering false “Too many community actions” errors. Separate read/presence limits from write/action limits.
- Never return private fields in public profile/discovery APIs.
- Avoid N+1 database queries and unbounded list responses.

## Quality assurance — mandatory
- Run Prisma format/validate/generate and migration checks.
- Run all backend tests and add tests for people discovery, private-profile exclusion, blocked users, cross-track discovery visibility, friend request lifecycle, presence freshness/expiry, and unauthorized access.
- Test frontend at 320px, 360px, 390px, 430px, tablet, and desktop widths.
- Verify no horizontal overflow, clipped cards, overlapping fixed navigation, inaccessible dialogs, tiny tap targets, or unreadable theme contrast.
- Test both light and dark modes.
- Test actual image/video upload from a phone-sized viewport and confirm saved records reload from the API.
- Verify all buttons work; no decorative or dead controls.
- Inspect browser console and API logs for runtime errors and failed requests.
- Verify returning to Academic Tracker restores the correct dashboard type.
- Check accessibility: semantic landmarks, labels, focus states, keyboard navigation, and useful alt text.
- Do not use hardcoded mock users or pretend online users.

## Final deliverables
1. Implemented code and database migrations.
2. Tests added and test results.
3. A concise list of files changed and behavior delivered.
4. Any environment variables or deployment steps required (never request secrets in chat).
5. A PR with a clear summary and test checklist.
6. Explicitly state anything not completed or not verified. Never claim the production deployment is live merely because a PR was opened.
