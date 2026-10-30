# Academic Tracker

A personal, offline-first academic accountability Progressive Web App (PWA).

## Features
- Dashboard for current term progress and missing scores.
- Manage academic years, terms, and subjects.
- Record CA1, CA2, CA3, and exam scores with configurable maximum marks.
- Keep target marks separate from actual marks.
- Subject and term summaries with totals and percentages.
- IndexedDB local storage and JSON backup/restore.
- Responsive layout with mobile bottom navigation.
- PWA manifest and service worker for offline use.

## Run locally
Open `index.html` in a local web server. For PWA installation and service-worker support, serve the folder over HTTPS or localhost.

## Data and privacy
Academic records are stored locally in the browser on the device. Export a JSON backup regularly; clearing browser data may remove local records. No server or account is required.

## Tech
HTML, CSS, vanilla JavaScript, IndexedDB, Web App Manifest, Service Worker.

## Current scope
This is a personal tracker, not a school-management system. Scores are editable and reports are calculated from the current saved records.


## Focus Field push notifications

The dashboard can request browser notification permission and register a Web Push subscription for the signed-in account. The API stores subscriptions per user in PostgreSQL and a server-side scheduler checks active focus-session deadlines and sends a push notification through the registered service worker.

Configure these environment variables on the API host before enabling external push delivery:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (a mailto: contact, for example `mailto:admin@example.com`)

Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Keep the private key secret; only the public key is sent to browsers. After setting the variables, redeploy the API. The scheduler runs inside the API process, so the API host must keep that process running for near-real-time delivery. If the host sleeps or is unavailable, delivery is delayed until it resumes. Browser/device notification permission, connectivity, and power/battery settings also affect delivery.
