# SDK and API Integration

- Start with one minimal request before adding application logic.
- Verify the Base URL, endpoint path, model ID, `Content-Type: application/json`, and Bearer authorization header.
- Use the official SDK for the customer's language when available. Pin a tested SDK version in production.
- Set explicit connection and response timeouts. Log request IDs and status codes, but redact credentials and customer content.
- When asking for help, provide the language, SDK and version, endpoint, status code, and sanitized error body.
