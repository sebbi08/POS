# Changelog

## v0.2.0 (2026-11-10)

### Features

- release: roll back automatically when a release fails (20a42e4)
- terminal: till, setup and messages use shadcn/ui (c2be1f7)
- terminal: dialogs use shadcn/ui and keep their touch behaviour (31004e5)
- frontend: catalog, import, terminals and company settings use shadcn/ui (d997d04)
- frontend: layout, login, report and bookings use shadcn/ui (ccfeecc)
- backend: lock out admin PIN guessing per IP, strong PIN in production (6f23899)
- frontend: calendar with booking counts replaces the date fields (09b9293)
- frontend: group booking days into festivals (31d7360)
- backend: reporting/booking-days lists days with their sale count (3d837d4)
- release: release script with conventional version bump and CI gate (d2efa19)
- backend: serve the admin frontend and require ADMIN_PIN in production (0d0a417)
- terminal: no menu bar, Vollbild button toggles fullscreen (0889fc7)
- terminal: touch keypad for Gegeben and admin PIN (20d4be4)
- terminal: PIN dialog is aria-modal and closes on Escape (d08180b)
- terminal: versioned local data format with migration chain (6b5da79)
- terminal: admin PIN dialog and version check before every sync (f005e51)
- terminal: version check and admin PIN in sync client (a7af5e9)
- sync: require matching version and admin PIN, lock after 5 wrong PINs (c93cd19)
- shared version 0.2.0 and GET /api/version (d2729a5)

### Bug Fixes

- e2e: bind the Vite dev server to 127.0.0.1 (60b8336)
- final review findings (devDependencies, ConfirmDialog cancel, test strength) (a320d9a)
- release: ignore untracked files and print recovery steps on failure (c19636c)
- deploy: bind the app port to localhost and document safe operation (b7a09cb)
- release: only gate on master push CI runs (0b400f2)
- terminal: a failed format stamp no longer blocks the start (1988e15)
- terminal: map /api/version 404 to outdated-server text, non-JSON to mismatch (5089fdc)
- sync: exact 429 message, serverVersion() in sync tests, stronger missing-PIN test (4c5d37b)

