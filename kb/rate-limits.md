# Rate Limits

- `429 Too Many Requests` means that a request, token, or account limit was exceeded.
- Read available response headers and the error body to identify whether the limit concerns requests, tokens, concurrency, or remaining credit.
- Reduce concurrency, queue work, batch where appropriate, and use exponential backoff with random jitter.
- Do not retry every failed request immediately; synchronized retries make overload worse.
- Persistent limits require checking current usage and the product's published plan limits.
