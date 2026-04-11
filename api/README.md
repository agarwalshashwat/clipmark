# API Documentation

This directory contains documentation for the Clipmark HTTP API endpoints exposed by the Next.js webapp (`webapp/app/api/`).

## Contents

| File | Description |
|---|---|
| `template.md` | Blank API endpoint documentation template |

## Base URL

| Environment | Base URL |
|---|---|
| Production | `https://clipmark.mithahara.com` |
| Local development | `http://localhost:3000` |

## Authentication

Most API routes require a valid Supabase JWT access token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

The token is obtained via Google OAuth and stored in `chrome.storage.sync` under the `bmUser` key by the Chrome Extension. The webapp refreshes it automatically via `POST /api/refresh`.

## Endpoint Index

| Method | Path | Description | Auth required |
|---|---|---|---|
| `POST` | `/api/bookmarks` | Cloud sync (upsert bookmarks for a video) | ✅ |
| `POST` | `/api/share` | Create a public shared collection | ✅ |
| `POST` | `/api/summarize` | AI summary of a video's bookmarks (Pro) | ✅ |
| `POST` | `/api/suggest-tags` | AI tag suggestions (Pro) | ✅ |
| `POST` | `/api/generate-post` | AI social post generation (Pro) | ✅ |
| `POST` | `/api/refresh` | Refresh Supabase access token | ✅ |
| `GET`  | `/api/reminders` | Fetch revisit reminders | ✅ |
| `POST` | `/api/reminders` | Create / update revisit reminder | ✅ |
| `POST` | `/api/webhooks/dodo` | Dodo Payments webhook (Pro upgrade) | Signature |

## Adding documentation for a new endpoint

1. Copy `template.md` to `<endpoint-name>.md`.
2. Fill in all sections (request schema, response schema, error codes, example).
3. Update the index table above.
4. Open a pull request.
