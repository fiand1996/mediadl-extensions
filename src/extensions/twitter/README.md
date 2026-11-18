# Twitter / X Extension

Media extraction extension for Twitter (`twitter.com` / `x.com`) posts, videos, GIFs, and images.

## Supported URL Patterns

- `https://twitter.com/<username>/status/<id>`
- `https://x.com/<username>/status/<id>`
- `https://x.com/i/web/status/<id>`
- `https://twitter.com/<username>/status/<id>/video/<index>`

The extractor requests tweet data through Twitter/X's GraphQL endpoint and falls
back to the syndication endpoint when GraphQL is rate-limited. It returns images
and videos attached to the tweet and its quoted tweet; video items include the
available stream variants.
