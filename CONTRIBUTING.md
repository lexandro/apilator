# Contributing

Thanks for taking a look. This is a small project, so the process is light.

## Getting set up

```powershell
bun install
bun run dev
```

You need Bun, Rust with the MSVC toolchain, and Windows 10 or 11.

## Before opening a pull request

Everything CI runs, you can run locally:

```powershell
bun run check    # typecheck, lint, tests with coverage thresholds

cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

A few Rust tests hit the network and are excluded from the default run. Run them with
`cargo test --manifest-path src-tauri/Cargo.toml -- --ignored` if you touched the HTTP
client or certificate handling.

## What the project expects of a change

**Tests that would fail without your change.** A test that passes whether or not the code
is correct is worse than no test, because it reads as coverage. If you fix a bug, break the
fix on purpose once and check the test goes red.

**Respect the layer boundaries.** Views render; anything touching the backend goes through a
hook or a store; the domain layer stays free of frameworks. This is enforced by ESLint, so
you will find out quickly. `ARCHITECTURE.md` has the detail.

**No feature that only half works.** A switch in the settings that does nothing, or a body
type that silently sends nothing, is worse than not offering it — most of this project's
early history was spent removing exactly that.

**Measure performance claims.** If a change is about speed or memory, include the numbers
and how you got them.

## Code style

- English identifiers, comments and test names
- Comments only where the reason is not recoverable from the code
- `bun run lint` decides formatting arguments

## Reporting a bug

Include the app version from Settings → About (the Copy debug info button gives you the
whole block), what you did, and what happened instead.
