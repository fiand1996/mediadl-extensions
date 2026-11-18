# Civitai Extension

Media extraction extension for Civitai (`civitai.com` and `civitai.red`) images.

## Supported URL Patterns

- `https://civitai.com/images/<id>`
- `https://civitai.red/images/<id>`

The extension queries the public image API by image ID first, then falls back
to parsing the page HTML when the API does not return the image.
