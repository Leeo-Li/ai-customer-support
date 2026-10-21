# API Key Authentication

- Store API keys in a server-side environment variable. Never embed them in browser code, mobile applications, public repositories, screenshots, or support messages.
- Send the key as `Authorization: Bearer YOUR_API_KEY` unless the product documentation says otherwise.
- For a 401 response, check for missing spaces, quotation marks copied into the value, revoked keys, the wrong project, and the wrong Base URL.
- Support staff should request only the HTTP status, request ID, timestamp, and a masked key prefix. A full key is never required.
- If a key may be exposed, revoke or rotate it immediately and review recent usage.
