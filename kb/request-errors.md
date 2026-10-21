# Request Errors

- `400` usually indicates invalid JSON, a missing field, or an unsupported parameter.
- `403` indicates that the authenticated project lacks permission for the requested resource.
- `404` commonly means an incorrect endpoint or model ID.
- `408` and client timeouts require timeout review and possibly a smaller request.
- For transient `500`, `502`, or `503` responses, retry a limited number of times with exponential backoff and jitter.
- Preserve the request ID, timestamp, status code, and sanitized error body for diagnosis.
