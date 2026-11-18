# PornPics Extension

Extracts high-resolution image galleries from PornPics (pornpics.com).

The extension fetches gallery pages through `this.request()` and sends extracted image URLs through the host's `/api/proxy` route. The host handles network defenses: its proxy can use FlareSolverr when it detects an anti-bot challenge and FlareSolverr is enabled. FlareSolverr is not called directly by this extension.
