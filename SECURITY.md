# Security Policy

## Supported Versions

Security fixes are currently targeted at the latest `main` branch only.

## Reporting a Vulnerability

Please do not open a public issue for credential leaks, session handling bugs,
or other security-sensitive findings.

Preferred reporting path:

1. Use GitHub Security Advisories / private vulnerability reporting for this repo.
2. If that channel is unavailable, open a minimal issue without sensitive details
   and clearly label it as `security`.

When reporting a vulnerability, include:

- affected path or feature
- reproduction steps
- expected vs actual behavior
- whether credentials, cookies, browser sessions, or user data are involved

Do not include live secrets, cookie bundles, user-agent strings tied to private
sessions, or raw browser profile data in public reports.

## Response Expectations

- Initial triage target: within 3 business days
- Status update target: within 7 business days for confirmed issues

## Scope Notes

WebaiBridge handles user-owned credentials and browser session material. Reports
involving `.runtime-cache`, `.agents`, local browser profiles, or captured
session artifacts should be treated as high sensitivity.
