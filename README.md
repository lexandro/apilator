# Apilator

A REST API testing client for Windows. Tabs, request history, proxy support and a response
viewer that stays responsive on large payloads.

Built with Tauri v2, React 18 and TypeScript.

## Features

- **Requests** — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS with headers, query params and
  raw or form-encoded bodies
- **Auth** — Basic, Bearer and JWT (HMAC: HS256/384/512), as an `Authorization` header or a
  query parameter
- **Bodies** — raw (JSON, XML, HTML, text), URL-encoded forms, and `multipart/form-data`
  with file uploads
- **Tabs** — rename, colour, pin, reorder, duplicate, and reopen a closed tab with
  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>
- **Response viewer** — JSON, XML, HTML, hex and base64 views, line numbers, and search that
  stays usable on multi-megabyte responses
- **Collections** — saved requests in folders, any depth, rearranged by drag and drop,
  kept in their own file
- **Environments** — dev, staging and prod variable sets, used as `{{name}}` anywhere in a
  request; variables marked secret live in the Windows Credential Manager, not in the file
- **Import and export** — share collections as a file, or import an OpenAPI 3 document
  (JSON or YAML), which arrives grouped into folders by tag with example bodies filled in
- **History** — the last 50 requests, grouped by day, one click to load one back into a tab
- **Proxy** — system, environment or a custom proxy with authentication
- **Security** — TLS certificate verification on by default with an explicit opt-out, and
  proxy passwords kept in the Windows Credential Manager rather than on disk

## Install

Download the installer from the [latest release](https://github.com/lexandro/apilator/releases/latest).

The installer is not code-signed, so Windows SmartScreen shows a warning the first time:
choose **More info**, then **Run anyway**. Once installed, Apilator checks GitHub for
updates in the background and offers them; update packages are signed and verified against
a key built into the app, so an update can only come from this project. Nothing is
downloaded or installed without you asking.

## Requirements

- Windows 10 or 11
- [Bun](https://bun.sh/)
- [Rust](https://rustup.rs/) with the MSVC toolchain
- WebView2 runtime (already present on current Windows installs)

## Development

```powershell
bun install
bun run dev
```

Quality gates, all of which run in CI:

```powershell
bun run typecheck   # tsc --noEmit
bun run lint        # eslint
bun run test        # vitest
bun run check       # all three

cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

A handful of Rust tests hit the network (certificate handling, response size limits) and are
excluded from the default run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml -- --ignored
```

## Build

```powershell
.\scripts\build.ps1            # EXE + MSI installer
.\scripts\build.ps1 -ExeOnly   # EXE only, faster
.\scripts\build.ps1 -OpenFolder
```

Output:

- `target/release/apilator.exe` — standalone, runs without installing
- `target/release/bundle/` — MSI and NSIS installers

The version lives in three files that must agree: `package.json`,
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## Releasing

Push a version tag and GitHub Actions does the rest:

```powershell
# bump the version in package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml
git tag v0.9.0
git push origin v0.9.0
```

The workflow builds the installers, signs the update package and publishes a GitHub Release
including `latest.json`, which is what running copies check against.

It needs two repository secrets, produced by `bunx tauri signer generate`:

| Secret | Contents |
|--------|----------|
| `TAURI_SIGNING_PRIVATE_KEY` | the private key file's contents |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password |

Generate the key with a real password. `tauri signer generate -p ""` does not produce a
password-less key, it produces one that then refuses to sign.

Losing the private key means existing installations can no longer verify updates and would
have to be reinstalled by hand. Keep a backup outside the repository.

## Where things live

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| Views | `src/views/` | React components, rendering only |
| Hooks | `src/hooks/` | UI logic, the only place views reach the backend through |
| Stores | `src/stores/` | Zustand state and the logic around it |
| Services | `src/services/` | Tauri and external integrations |
| Domain | `src/domain/` | Types, factories and pure logic; framework-free |
| Backend | `src-tauri/src/` | Rust: HTTP client, persistence, secrets, JWT |

The boundaries are enforced by ESLint, not just documented: a view importing a service, or
the domain importing React, fails the lint. [ARCHITECTURE.md](ARCHITECTURE.md) has the
rationale.

### Domain

Pure TypeScript. No framework imports, no I/O, and the most thoroughly tested layer,
because everything interesting can be checked without rendering anything.

| Module | Contents |
|--------|----------|
| `request.ts` / `response.ts` | `HttpRequest`, `HttpResponse`, request state union |
| `auth.ts` | auth configs and the header they produce |
| `tab.ts` / `history.ts` | tabs, history entries |
| `collection.ts` | the collection tree and its operations (find, insert, move, remove) |
| `environment.ts` | environments and `{{variable}}` substitution |
| `openApi.ts` | OpenAPI 3 document to collection |
| `settings.ts` | theme, proxy and general settings |

### Services

Everything that talks to the Rust backend or the outside world. Services may use Tauri APIs
but know nothing about stores, views or hooks.

| Module | Responsibility |
|--------|----------------|
| `httpService` | building and sending requests, variable substitution, JWT signing |
| `persistenceService` | app state: load, save, migrate, and back up rather than delete |
| `collectionsService` | collections file, plus export and import |
| `environmentsService` | environments file, keeping secret values out of it |
| `secretsService` | the Windows Credential Manager |
| `fileService` / `systemService` | file dialogs, app and OS info |

### Stores

Zustand. State plus the logic around it; they call services, never the other way round.

| Store | Responsibility |
|-------|----------------|
| `useTabsStore` | open tabs, the closed-tab stack, reordering |
| `useHistoryStore` | the last 50 requests, as summaries |
| `useCollectionsStore` | the collection tree, persisted on every change |
| `useEnvironmentsStore` | environments, selection and secret handling |
| `useSettingsStore` | theme, proxy and general settings |

### Backend

| Module | Responsibility |
|--------|----------------|
| `http_client.rs` | pooled reqwest clients, streaming reads, cancellation, multipart |
| `persistence.rs` | atomic writes and backups for every data file |
| `secrets.rs` | Windows Credential Manager |
| `jwt.rs` | HMAC JWT signing |
| `system_proxy.rs` | the Windows proxy setting, so credentials can be attached |

Application data lives in `%LOCALAPPDATA%\Apilator\`:

| File | Contents |
|------|----------|
| `apilator-state.yaml` | open tabs, request history |
| `apilator-collections.yaml` | saved requests |
| `apilator-environments.yaml` | environments and non-secret variables |

Secret values — proxy passwords and variables marked secret — are never written to these
files. They go to the Windows Credential Manager.

## Icons

```powershell
bunx tauri icon src-tauri/icons/icon.png
```

## Licence

[MIT](LICENSE)
