# Engineering log

Apilator existed for months as a working prototype before anyone audited it. This is the
record of turning it into something publishable: what the audit found, what was done about
it, and what the numbers were before and after.

It is kept because the measurements are the interesting part. Anyone can claim a thing got
faster.

---

## Where it started

The audit ran the tooling first, on the assumption that a claim without a measurement is a
guess:

| Gate | Result |
|------|--------|
| `tsc --noEmit` | clean |
| `cargo clippy` | clean |
| `bun run test` | **no test files, exit 1** |
| `bun run lint` | **no configuration file — the lint had never run** |
| CI | **none** |

The type discipline was real. Everything else was absent.

### Findings

Three groups, all confirmed by measurement rather than reading:

**The UI promised things the code did not do.** The entire General settings section was
inert: `requestTimeout`, `maxResponseSize`, `httpVersion`, `autoFollowRedirects` and five
others had zero consumers, while the request layer sent a hardcoded 30-second timeout. JWT
auth had a complete form with twelve algorithms and produced no header at all. The proxy
bypass list and the system proxy credentials reached the backend and were discarded there.

**Two quadratic paths in the response viewer.** Grouping search matches by line tested every
match against every line; on a 6.2 MB response that is 3.2 billion iterations, and it ran on
every debounced keystroke. Separately, the character offset of a line was recomputed from
zero for every rendered row, so scrolling near the end of a large response cost 40 × 288,000
iterations per frame.

**Data loss waiting to happen.** A state file whose version did not match was discarded
outright with a `console.warn` nobody would see. The write was not atomic, so a crash
mid-write truncated it. And the load path had no `.catch()`, so a state file that parsed but
lacked a `tabs` array threw, left `setIsLoading(false)` unreached, and stranded the app on
the splash screen permanently — across restarts, because the bad file stayed put.

Security: TLS certificate verification was disabled outright with no way to enable it, proxy
passwords sat in localStorage in plaintext, and the app shipped with no CSP and the whole
Tauri API exposed on `window`.

---

## First pass: correctness, safety and speed

Nine phases, each one planned, implemented, verified, and committed on its own.

### Test infrastructure first

Nothing else could be verified without it. ESLint 9 with `react-hooks/exhaustive-deps` set
to error — a rule chosen deliberately, because a missing dependency was the cause of one of
the findings. 103 tests over the pure, deterministic surfaces. GitLab CI running every gate.

Two known bugs were pinned by tests rather than left in a list. The JWT contradiction used
`it.fails`, which stays green while the bug exists and turns red the moment it is fixed,
forcing the test to be updated rather than forgotten.

Writing those tests immediately surfaced dead code: `escapeHtml`, `highlightMatches`, an
entire `HighlightedCode` component and a `contentRef` scroll effect that was never attached
to anything. `findMatches` existed twice, once in each of two modules.

### Closing the data-loss paths

`save_state` writes to a temp file, fsyncs, and renames over the target. The regression test
induces a real write failure and asserts the failure happened *before* checking the previous
content survived — otherwise it would pass whether or not the code was atomic.

Every path that used to discard the state file now moves it aside as
`apilator-state.yaml.<suffix>.bak`. Suffixes arrive over IPC, so they are filtered to
`[A-Za-z0-9_-]` and length-capped; a traversal attempt cannot escape the data directory.

A migration chain keyed by source version was added, with a guard against a migration that
forgets to bump the version and loops forever.

### Security

TLS verification became a setting defaulting to on, with the state surfaced on every
response. Verified against real endpoints rather than assumed:

| Test | Result |
|------|--------|
| expired certificate, verification on | rejected |
| expired certificate, verification off | accepted, marked unverified |
| valid certificate, verification on | accepted |

That is both the positive and the negative control: the bad certificate fails, the toggle
genuinely toggles, and normal requests still work.

Proxy passwords moved to the Windows Credential Manager. The test asserts on the actual
localStorage contents, so it fails if a password ever leaks back in.

A wrong CSP produces a blank window that neither the compiler nor the test suite would
catch, so it was checked functionally: delete the state file, launch the app, and require
the file to reappear — which only happens if the webview loaded the bundle, React mounted
and IPC worked. Confirmed in both a production build and dev mode, since Tauri applies the
production CSP to dev when `devCsp` is unset.

### The single largest win

History entries stored the entire `HttpResponse`, body included. Nothing ever read it back —
the history list uses only `request.method` and `request.url`, and clicking an entry loads
only the request. Replacing it with a four-field summary:

| | Before | After |
|--|--------|-------|
| state file, 50 entries × 1 MB responses | 86.0 MB / 1041 ms | 7 kB / 5 ms |
| retained JS heap for the same history | 60.8 MB | 1.2 MB |
| the real state file on the author's machine | 5652 kB | 36 kB, all 66 entries intact |

The first two memory measurements were wrong and thrown away: one had every entry sharing a
single body string, the next measured RSS, which reports allocator high-water mark rather
than retained data. Only `heapUsed` after a forced GC produced a number worth quoting.

### The quadratic paths

Both lists are ordered, so grouping matches by line is a single walk with a running pointer.
Line offsets became a prefix-sum array built once, with binary search for the current match.

| Operation | 1.2 MB / 64k lines | 6.2 MB / 320k lines |
|-----------|--------------------|---------------------|
| group matches by line | 772 ms → **2.0 ms** | 3376 ms → **13.4 ms** |
| line offsets, 40 rows per frame | 3.8 ms → **0.03 ms** | 19.3 ms → **0.004 ms** |
| hex view | 359 ms → **130 ms** | 3284 ms → **206 ms** |

The old implementations are kept verbatim in the test file as an oracle, and the new ones
are compared against them over 30 seeded random corpora.

**Mutation testing was worth doing.** Of three deliberate bugs introduced to check the tests
actually bite, **two were missed**. The random corpus only ever produced matches starting on
a printable character, so nothing exercised newline positions. Five targeted boundary tests
were added; all three mutations now fail as they should.

For the hex view, measurement changed the plan. The dominant cost was not string
concatenation — V8 ropes make `+=` cheap — but per-byte `toString(16).padStart`, 85.6 ms of
the 385 ms at 1.2 MB. A 256-entry lookup table does the same work in 3.3 ms.

### The network layer

Every request built a new `reqwest::Client`, and the connection pool lives inside the
client, so every request paid for a new TCP connection and TLS handshake. Clients are now
cached by the settings that affect how connections are made.

Proving it needed care. A global build counter was flaky because other tests build clients
concurrently; a per-key counter is immune. Removing the cache lookup makes the test fail, so
it does bite.

Response bodies are read chunk by chunk and stop at the configured limit.
`String::from_utf8_lossy` was replacing every invalid byte with U+FFFD, silently destroying
binary payloads; bodies that are not valid UTF-8 now arrive base64-encoded.

Requests became cancellable, and the stale-response race was closed: a slower earlier
response for a tab no longer overwrites a newer one.

### Making the switches real

JWT signing was implemented in Rust over `hmac` and `sha2`. The first test claimed to pin
HS256 end to end but only checked signature length and determinism — it was replaced with
cross-implementation vectors generated by Node's `crypto.createHmac`. That test immediately
failed, because `serde_json` sorts object keys alphabetically and would have reordered the
user's claims; `preserve_order` is now on.

Six General settings were wired end to end. Four were **removed** rather than faked:
`disableCookies` (there is no cookie jar to disable), `requestValidation` and
`sendTokenHeader` (semantics never defined), `retainHeadersOnRedirect` (reqwest offers no
such switch). A switch for a feature that does not exist is worse than no switch.

### Enforcing the layers

All five import violations were fixed, and four ESLint rule groups now enforce the
boundaries. The rule immediately caught a violation the manual refactor had missed, and was
positive-controlled by adding a forbidden import to each layer and watching the lint fail.

One documented "duplication" turned out not to be: the two `PasswordInput` components share
a concept but not markup or styling. Merging would have risked the settings design for no
gain; the confusing part was the shared name, so one was renamed.

### Repository hygiene

`public/favicon.ico` began with the PNG magic bytes — a 994 kB PNG with the wrong extension,
loaded on every start. Images were sized for how they are actually displayed rather than
what was exported.

| | Before | After |
|--|--------|-------|
| `favicon.ico` | 994 kB | 16 kB (a real multi-resolution ICO) |
| splash | 1459 kB (1024×1024) | 196 kB (512×512) |
| about logo | 994 kB (705×824) | 85 kB (219×256) |
| `dist/` total | 3.9 MB | 820 kB |

`serde_yaml` was declared but never used anywhere in the Rust source, and is a deprecated
crate. `tokio` dropped from `features = ["full"]` to the four it actually needs.

### After the first pass

| Gate | Before | After |
|------|--------|-------|
| frontend tests | 0 | 228 |
| Rust tests | 0 | 59 |
| lint | never ran | clean, and enforcing layer boundaries |
| CI | none | 9 green pipelines |

---

## Second pass: what the first one missed

A re-audit after the first pass found three more instances of the same class of bug the
whole effort had been about — two of them introduced or left by that work.

**Form Data sent nothing.** The editor offered a Form Data tab with a key-value grid, but
the request builder only handled `raw` and `x-www-form-urlencoded`. This was missed by the
first audit entirely. Fixed with full `multipart/form-data` including file upload, proven by
a network test that posts a text field and a real file to httpbin.org and asserts both
appear in the echo.

**The hex view showed the wrong bytes for binary responses** — introduced by the first pass,
when non-UTF-8 bodies started arriving base64-encoded. `toHex` was hexing the base64 text:

```
before: 69 56 42 4f 52 77 30 4b   ("iVBORw0K")
after:  89 50 4e 47 0d 0a 1a 0a   (the actual PNG header)
```

The binary notice was also pointing users at the broken view.

**The proxy bypass list and system proxy credentials were still ignored.** The first pass
combed the General settings and never opened the Proxy section.

### Coverage where it mattered

The 24.4% overall figure hid two entirely uncovered layers, and the riskier one held the
newest logic: send, cancel and the stale-response guard. Both hooks are now covered,
including a race test that resolves two concurrent requests out of order.

Three bugs in the new tests surfaced while writing them: a missing `cleanup()` left earlier
hooks mounted and still saving; advancing fake timers inside the same `act()` as the store
change meant the effect had not re-registered its timer; and passing `undefined` to a
defaulted parameter silently used the default, so one test was not testing what it claimed.

Coverage thresholds are per layer rather than global — domain 90, utils 90, stores 85,
services 80, and nothing imposed on presentation components, where a number would only
reward render tests that assert nothing. Verified by raising one threshold above the actual
figure and watching the build fail.

That threshold later earned its keep: a service tested only through its store dropped
`src/services` below the floor and failed the build. The missing tests were written rather
than the threshold lowered.

### Features

**Collections** — a tree of saved requests, rearranged by drag and drop, in its own file.
The tree operations live in the domain layer as pure functions with 42 tests. The one that
matters most is `moveNode`'s guard: a folder cannot be dropped into itself or its own
descendant, which would detach that subtree and lose everything in it — two seconds of work
to trigger with drag and drop.

**Environments** — named variable sets substituted as `{{name}}` throughout a request.
Unknown placeholders are deliberately left in place rather than blanked: blanking turns a
typo into an empty string and sends the request somewhere else with nothing to show for it.
Variables marked secret go to the Credential Manager, and the store forgets the credential
when the flag is cleared, the variable deleted, or the environment removed.

**Import and export** — the project's own format, plus OpenAPI 3 in JSON or YAML. Imported
requests are usable rather than merely present: path parameters become `{{placeholders}}` so
environments can fill them, optional query parameters arrive disabled, and request bodies are
generated from the schema.

### After the second pass

| | First pass | Second pass |
|--|-----------|-------------|
| frontend tests | 228 | 513 |
| Rust tests | 59 | 81 |
| coverage | 31.7% | 38.0% |
| `src/domain` coverage | 93.8% | 97.7% |

---

## Publishing

The three layer documents under `docs/` were six months stale and described none of the nine
modules added since; they were folded into the README and deleted.

Auto-update was added: a background check that only *offers*, never downloads unattended.
The changelog is inlined at build time so what you read matches the version you are running.

The repository moved to GitHub with a single history-free initial commit, so the
maintainer's email address does not appear. The full history is preserved as a `git bundle`
whose restore was verified by actually cloning from it — an archive nobody has restored is
not an archive.

Before publishing, the entire history was scanned: 282 files across every commit, with no
API key, token, password, private key or real email address in any of them. The state file,
which held real request data, was never committed.

**The first release failed**, and the reason is worth recording. Both installers built, then
signing failed with `Wrong password for that key`. The obvious suspect was the CI secret,
but signing with the same key failed locally too — which settled in one step that the key,
not the pipeline, was at fault. It had been generated with `tauri signer generate -p ""` on
the assumption that produces a password-less key. It does not: it produces a key that then
refuses to sign. Regenerated with a real password, and the signature proven locally before
anything else was touched.

The update chain was then verified by query rather than inference: the endpoint compiled
into the app resolves, `latest.json` reports the right version and platforms, and the key id
in the published signature matches the public key in the app.

---

## Lessons that became rules

These are in `CLAUDE.md` and `CONTRIBUTING.md` because they cost something to learn.

**A test that cannot fail is not a test.** Mutation testing found two of three deliberate
bugs slipping through a suite that looked thorough. Break the fix on purpose once.

**An empty measurement is not evidence.** A probe that finds nothing because it is broken
looks exactly like one that finds nothing because there is nothing to find. Several
measurements here were wrong on the first attempt and only caught by checking the probe.

**Run the gates last.** A clippy failure reached CI because the final edit came after the
last local check.

**Never ship a control that does nothing.** Most of this work was removing exactly that. If
it cannot be finished, remove the UI.
