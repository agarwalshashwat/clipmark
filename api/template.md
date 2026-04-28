# [Endpoint Name] — API Documentation

> **Route:** `[METHOD] /api/<path>`  
> **Auth required:** Yes / No  
> **Pro required:** Yes / No  
> **Added:** YYYY-MM-DD  
> **Source file:** `webapp/app/api/<path>/route.ts`

---

## Description

*One paragraph describing what this endpoint does and when to call it.*

---

## Authentication

*Describe the auth mechanism for this endpoint (JWT Bearer token, webhook signature, etc.).*

```
Authorization: Bearer <supabase_access_token>
```

---

## Request

### Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | ✅ | Bearer JWT from Supabase |
| `Content-Type` | ✅ | `application/json` |

### Body

```jsonc
{
  "field1": "string",   // required — description
  "field2": 123,        // optional — description
  "field3": ["a", "b"]  // optional — description
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `field1` | `string` | ✅ | Description |
| `field2` | `number` | ❌ | Description |

---

## Response

### Success — `200 OK`

```jsonc
{
  "field": "value"
}
```

| Field | Type | Description |
|---|---|---|
| `field` | `string` | Description |

### Error Responses

| Status | Code | Description |
|---|---|---|
| `400` | `MISSING_FIELDS` | Required fields not provided |
| `401` | `UNAUTHORIZED` | Missing or invalid token |
| `403` | `PRO_REQUIRED` | Feature requires Pro subscription |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

---

## Example

### Request

```bash
curl -X POST https://clipmark.mithahara.com/api/<path> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "field1": "value"
  }'
```

### Response

```json
{
  "field": "value"
}
```

---

## Notes

*Any additional notes, rate limits, or edge cases.*
