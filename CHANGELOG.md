# Changelog

## v0.7.0

### Features

- Add optional `cwd` parameter to `bash`, `grep`, and `glob` — run commands/searches in any directory without `cd … &&`. Accepts absolute paths only; relative paths are rejected with `Path must be absolute, not relative: …`. Title displays ` (in: <relative>)` when cwd differs from the workspace root.
- Add `<diagrams>` behavioral block to the system prompt — guides the model to produce box-drawing `diagram` code blocks for architecture/workflow/data-flow explanations, with alignment guidelines to reduce stray characters and text overflow.
- Inject `PI_*` session metadata (`PI_SESSION_ID`, `PI_SESSION_FILE`, `PI_PROVIDER`, `PI_MODEL`, `PI_REASONING_LEVEL`) into bash subprocesses via `buildBashEnv(ctx)`, so user scripts can adapt to the active session/model.
- Add `constrainedSampling: { type: 'json_schema', strict: 'prefer' }` to bash, edit, write, apply-patch, and todo — opts into provider-side strict JSON Schema generation, reducing argument errors on weaker models.
- Enable clickable file links (OSC 8 hyperlinks) in edit, write, and apply-patch tool titles — Alt+Click now works consistently with read.

### Improvements

- Bump `pi-coding-agent` peer dependency to `>=0.82.0`.
- Add `Paths.cwdSuffix()` and `Paths.requireAbsolute()` helpers.
- Update `docs/pi-api.md` and `docs/tool-output.md`.

## v0.6.0

### Features

- Update pi alongside pim in prod Telegram `/update` and report its version (1b7e3e4)

### Improvements

- Bump `pi-coding-agent` to 0.80.10 and migrate to the ModelRuntime API (54d7046)

## v0.5.0

### Features

- Render Telegram status narration as Markdown with message length caps (cafa871)

### Bug Fixes

- Require double tildes for Telegram strikethrough formatting (#12)

## v0.4.0

### Features

- Render Telegram replies and live status as Bot API 10.1 rich messages (b1afcb9)
- Reuse Exa MCP sessions and throttle free-tier web searches (60eef60)

### Improvements

- Document Telegram rich text formatting (1953b3c)

## v0.3.0

### Features

- Run file picker suggestion ranking in a worker thread to improve performance for large number of files (cebda6d)
- Scope file picker ranking to directory children and add literal fast path to improve performance for large number of files (b2d388d)
- Add a literal fast path to improve `grep` performance for large number of files (a50fee3)
- Add repo-aware file enumeration with accurate nested Git ignore handling (131483e)
- List directories in the file picker and avoid adding a trailing space on tab completion (c47deff)

### Bug Fixes

- Respect excluded edit tools when using `apply_patch` (556f991)

### Improvements

- Bump dependencies (4920aaf)
- Add edit micro benchmark and results (13541c1, 500f749)
- Add README badges (0baf591)

## v0.2.0

### Features

- Add the `apply_patch` V4A patch tool for GPT/Codex models (d0b559d)
- Show `apply_patch` operations and diff stats in Telegram status updates (5026999)
- Render `read` output with muted line numbers (0ff35ab)

### Bug Fixes

- Format `glob` targets in `grep` result titles (802026c)
- Use a hardcoded `settings.json` for the Terminal Bench 2 adapter (01f5d7f)

### Improvements

- Add the release skill (c0d9b1e)
- Refine tool descriptions (a038607)
- Add the release workflow (00150cd)
- Document `apply_patch` usage (96f52cf)
- Update Telegram feature documentation (ac2126b)
- Refresh the demo asset (76ecdbc)
- Add `Levenshtein` tests (e1928f3)
- Refresh project and benchmark READMEs (b93294c)

## v0.1.0

### Features

- Initial release
