# Security

## Reporting a vulnerability

Please report security issues privately rather than in a public issue, through
[GitHub's private vulnerability reporting](https://github.com/lexandro/apilator/security/advisories/new).

Include what an attacker can do, the steps to reproduce, and the app version. You should
get an initial response within a week.

## What this app does with your data

Apilator is a desktop client. Nothing is sent anywhere except the HTTP requests you
explicitly make. There is no telemetry, no update check, and no network traffic the app
starts on its own.

**Stored on disk**, under `%LOCALAPPDATA%\Apilator\`:

- open tabs and request history — request details only; response bodies are not kept
- saved collections
- environments, excluding the values of variables marked secret

**Stored in the Windows Credential Manager:**

- proxy passwords
- environment variables marked secret

**Not stored at all:** response bodies beyond the current session.

## Updates

Apilator checks GitHub for new releases in the background and offers them; it never
downloads or installs anything on its own. Update packages are signed with a minisign key
whose public half is compiled into the app, so a package that was not signed by this
project is rejected before anything is installed.

The installer itself is not code-signed with a Windows certificate, so SmartScreen warns on
first run. That is about the installer's provenance, not the update mechanism.

## Things worth knowing

**TLS verification can be turned off.** It is on by default. When you turn it off, every
response fetched over an unverified connection is marked in the response header, because a
connection that is not authenticated can be intercepted.

**Requests go out as you write them.** Variables are substituted into the URL, headers,
query parameters, body and auth fields, so a secret in an environment variable will appear
in whatever request references it. That is the point, but it means a request shared from
history or a collection can carry one.

**Exported collections contain request details as written.** If a request has a hardcoded
token in a header, exporting it exports the token. Use a secret environment variable if you
intend to share the collection.
