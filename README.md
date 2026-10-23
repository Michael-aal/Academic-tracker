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
