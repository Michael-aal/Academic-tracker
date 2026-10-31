# Academic Tracker Learning System
This increment adds the English Learning Studio, server-validated English practice, browser speech pronunciation where supported, account-scoped XP and level progression, achievements, and an English tutor AI action. XP is server-calculated, idempotent per source activity and capped at 100 XP per UTC day. Every 100 XP advances one level. XP measures learning engagement, not grades or proven mastery.

The profile is stored in the existing account-scoped user data table as kind learning-progress and record ID main. No destructive migration is needed. Correct answers are omitted from the English activity-list response.

API:
- GET /api/learning/progress
- POST /api/learning/progress/award
- GET /api/learning/english/activities?category=all
- POST /api/learning/english/activities/:activityId/answer

English AI explanations use the existing AI provider adapter and credit reservation system at 1 credit per request. Static lessons and answer marking do not use AI credits. AI requires an existing server-side provider key. Browser pronunciation depends on device/browser speech voice support.
