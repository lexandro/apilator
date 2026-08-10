# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.2] - 2026-08-10

### Fixed

- Opening Settings blanked the window. `getGeneralSettings()` built a fresh object on every
  call and the General section used it as a Zustand selector; since Zustand 5 compares
  selector results with `Object.is`, every snapshot looked new and React re-rendered until it
  gave up with error #185. The uncaught error then unmounted the whole tree, which is why the
  window emptied rather than showing anything. The stored settings are now completed once at
  load, so the getter returns a stable reference

### Added

- An error boundary at the app root and around each settings section. A render error now
  shows what failed, with the stack behind a disclosure and a way to retry, instead of
  leaving an empty window with nothing to go on
- About lists the repository and the licence, which were placeholders reading "TBD"

### Changed

- The changelog no longer repeats its own title inside the Settings view

## [0.9.1] - 2026-08-10

No functional changes. This release exists to exercise the update mechanism end to end,
which 0.9.0 could not do: there was nothing installed to update from.

### Changed

- The repository is now entirely in English. ARCHITECTURE.md and the engineering log were
  folded into the README or removed rather than translated, since both had drifted from the
  code and the layer rules they described are enforced by lint anyway
- Line endings normalised via .gitattributes. The tree had been 143 LF, 53 CRLF and 3 files
  mixed within themselves, so a one-line comment change showed as 2212 changed lines

## [0.9.0] - 2026-08-10

First public release. Everything below is relative to the unreleased 0.1.0 state.

### Added

- Collections: saved requests in folders of any depth, rearranged by drag and drop, stored
  in their own file
- Environments: named variable sets substituted as `{{name}}` throughout a request, with
  variables markable as secret
- Import and export: own collection format, plus OpenAPI 3 import in JSON or YAML, grouped
  into folders by tag with example bodies generated from schemas
- `multipart/form-data` bodies, including file uploads
- JWT authentication (HMAC: HS256, HS384, HS512), as a header or a query parameter
- Request cancellation, with a Cancel button while a request is in flight
- Response size limit, applied while streaming rather than after the fact
- TLS certificate verification toggle, and a visible marker on responses fetched over an
  unverified connection

### Changed

- TLS certificate verification is on by default. It was previously disabled outright with
  no way to turn it on
- Secrets — proxy passwords and variables marked secret — are stored in the Windows
  Credential Manager instead of in localStorage or a data file
- HTTP connections are pooled. Every request previously built a new client, so every
  request paid for a new TCP connection and TLS handshake
- Request history keeps a response summary rather than the full body. For fifty 1 MB
  responses this took the state file from 86 MB to 7 kB and retained memory from 60.8 MB
  to 1.2 MB
- State writes are atomic and asynchronous; a crash mid-write no longer truncates the file
- An unreadable or unrecognised data file is moved aside rather than deleted, and the state
  format carries a migration chain
- General settings are honoured: request timeout, max response size, redirect following,
  HTTP version, no-cache header and response format detection. Four settings that could not
  be implemented were removed rather than left as decoration
- Binary responses are handed over as base64 rather than being mangled by lossy UTF-8
  conversion, and the hex view shows the real bytes

### Fixed

- Form Data bodies were never sent; the request went out with no body at all
- The hex view of a binary response showed the hex of the base64 text rather than the bytes
- A state file that parsed but had no tabs array left the app on the splash screen forever,
  across restarts
- A version mismatch in the state file silently discarded every tab and the whole history
- Searching a large response froze the UI for seconds; grouping matches by line was
  quadratic, and the per-line offset was recomputed from zero for every rendered row
- The proxy bypass list and the system proxy credentials were accepted and then ignored
- A slower earlier response could overwrite a newer one in the same tab

### Security

- Content Security Policy added; the full Tauri API is no longer exposed on `window`
- JWT headers cannot claim an algorithm other than the one actually used for signing

[0.9.1]: https://github.com/lexandro/apilator/releases/tag/v0.9.1
[0.9.0]: https://github.com/lexandro/apilator/releases/tag/v0.9.0
