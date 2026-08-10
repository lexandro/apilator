# Apilator

A REST API testing client for Windows. Tauri v2 + React 18 + TypeScript, package-managed
with Bun.

## Working language

Conversation with the maintainer is in Hungarian. **Everything in the repository is in
English** — code, comments, tests, documentation and commit messages.

Do not assume; ask when a decision would change the work.

## Where things are

`ARCHITECTURE.md` has the layers, the module map and the import rules. `README.md` has the
feature list, the commands and the release process. Do not duplicate either here.

## Commands

```powershell
bun install
bun run dev            # Tauri dev
bun run check          # typecheck + lint + tests with coverage thresholds
bun run vite build     # frontend only, fast

cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml -- --ignored   # network-dependent
```

All of these run in CI. Run `bun run check` and the two cargo commands as the **last** step
before committing, not in the middle — a change made after the last run is a change nobody
verified. That gap is how a clippy failure once reached CI.

### Bash and Windows paths

Do not `cd` to an absolute Windows path in bash; use a relative path or a flag.

```bash
# wrong
cd C:\projects\apps\apilator\src-tauri && cargo check

# right
cargo check --manifest-path src-tauri/Cargo.toml
```

The working directory is the project root.

### Renaming or moving files

Vite and the running app lock files on Windows. Stop them first:

```powershell
taskkill //F //IM "node.exe"
taskkill //F //IM "apilator.exe"
```

## What this project expects

**Never ship a control that does nothing.** A settings toggle that is not wired up, a body
type that silently sends nothing, an auth method that produces no header — most of this
project's history was spent removing exactly that. If a feature cannot be finished, remove
its UI rather than leaving it as decoration.

**Tests that would fail without the change.** A test that passes whether or not the code is
correct reads as coverage while providing none. After fixing a bug, break the fix on purpose
once and confirm the test goes red. Several tests here exist because that step found the
first attempt toothless.

**Measure, do not assume.** Performance and memory claims need numbers and a stated method.
An empty or zero measurement is not evidence until the probe itself is shown to work — a
probe that finds nothing because it is broken looks exactly like one that finds nothing
because there is nothing to find.

**Respect the layer boundaries.** ESLint enforces them, so a violation fails the build
rather than waiting to be noticed in review.

## Conventions

- Zustand stores for state and the logic around it, not custom hooks holding `useState`
- A component with five or more callback props should read the store directly instead
- Functional components, TypeScript strict mode, one component per file with its CSS beside it
- Rust: Tauri commands in `lib.rs`, `#[tauri::command]` on each, serde for serialisation
- Refactor when a file passes ~200 lines, a component ~100 lines of JSX, or a hook takes on
  a second responsibility

### Comments

Comments are for what the code cannot say: a non-obvious invariant, the reason for a
workaround, a mechanism that has to be revisited later. Not a restatement of the next line.
Default to no comment.

## Tauri IPC

```typescript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke<ResponseType>('command_name', { param: value });
```

```rust
#[tauri::command]
fn command_name(param: String) -> Result<ResponseType, String> {
    // ...
}
```

## Releasing

The version lives in three files that must agree: `package.json`,
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. Pushing a `v*` tag builds the signed
installers and publishes a GitHub Release; `README.md` has the detail.
