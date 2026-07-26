# NILTASK Release and Component Version Contract

> Read with `AI.md`, `PROFESSIONALIZATION_PLAN.md`, `PWA_RELEASE_NOTES.md`, `PROFESSIONALIZATION_VALIDATION.md` and `RELEASE_ROLLBACK_CHECKLIST.md`.

## Purpose

NILTASK previously used several version-like strings without an explicit distinction between release identity, UI generation, component revision and service-worker cache generation.

That can cause:

- unnecessary cache-healing reloads;
- remote logs reporting the wrong build;
- a service worker serving assets from the wrong app-shell generation;
- component cache-busters being mistaken for the whole application release;
- rollback instructions pointing at the wrong version signal.

This document defines the permanent contract.

## 1. Authoritative release identity

### `version.json`

```json
{ "v": "v208.3.3-recovery" }
```

This is the network-visible release authority used by the browser cache-healing check.

It must be fetched with:

```text
cache: no-store
```

### `window.APP_VER`

Defined in:

```text
js/shared.js
```

It is the running release identity used by:

- version-healing comparison;
- logger/session metadata;
- support and remote-device diagnosis.

### Required invariant

```text
version.json.v = window.APP_VER
```

Any mismatch is a release defect.

The professionalization validator fails when these values differ.

## 2. HTML shell generation

`index.html` currently contains:

```text
meta niltask-version = v208
window.NILTASK_APP_VERSION = v208
```

These are shell-generation markers, not the cache-healing release authority.

They may remain stable while patch/recovery releases advance, provided they are not used as substitutes for `window.APP_VER`.

A future cleanup may rename them to make the distinction more obvious, but this must not be done until all consumers are inventoried.

## 3. Component versions

Examples:

```text
NILTASK_MOBILE_VERSION
NILTASK_ACTIVITY_CONTROLLER_VERSION
NILTASK_ACTIVITY_UI_VERSION
NILTASK_REALTIME_FEATURE_OWNERS_VERSION
NILTASK_UNREAD_SERVICE_VERSION
query strings such as ?v=5 or ?v=208.3
```

These identify one component or asset revision.

They do not have to equal the release identity.

Rules:

- increment when that component's contract changes materially;
- keep diagnostic markers stable and machine-readable;
- update exact service-worker precache URLs when a query-versioned loaded asset changes;
- never use a component version to trigger whole-app cache healing.

## 4. Service-worker cache generation

Current preview generation:

```text
taskflow-v210
```

Defined in:

```text
sw.js
```

This is a cache namespace, not the application release identity.

Advance it when:

- the app-shell file list changes;
- a query-versioned precached URL changes;
- a local production stylesheet replaces the Tailwind CDN;
- an offline-critical runtime service is added or removed;
- cached asset semantics require old app-shell caches to be discarded.

Do not advance it solely because a database-only or server-only change occurred.

`PWA_RELEASE_NOTES.md` must contain the same cache generation.

## 5. Native shell version

`package.json` version and Android/iOS native build numbers describe the Capacitor wrapper release.

The Capacitor app currently loads the live Vercel site through `server.url`, so most web releases do not require an APK rebuild.

Only change native build versions for changes such as:

- native plugin/configuration updates;
- app identity or signing changes;
- native icons/splash assets;
- permissions or manifest changes;
- store-distributed binary changes.

Do not force the native package version to equal every web release.

## 6. Supabase project identity safety

`js/shared.js` contains a public browser anon key and project URL.

Required invariant:

```text
JWT payload ref = project ref in SUPABASE_URL hostname
JWT payload role = anon
```

The automated validator decodes the public JWT payload and checks both invariants. This catches accidental key transcription or replacement without exposing any secret; the anon key is a public client credential protected by RLS.

Never replace it with:

- a service-role key;
- a key belonging to another Supabase project;
- a truncated or hand-edited JWT.

## 7. Release update sequence

For a normal web release:

1. choose the new release value;
2. update `version.json.v`;
3. update `window.APP_VER` to the exact same value;
4. change component versions only for components actually changed;
5. update query-versioned loader URLs where required;
6. update matching service-worker precache URLs;
7. advance the service-worker cache generation when the app shell changed;
8. update `PWA_RELEASE_NOTES.md` when the cache generation changed;
9. run automated validation;
10. deploy preview;
11. verify no version-healing reload loop;
12. verify logger rows show the intended release;
13. complete relevant smoke checks;
14. identify rollback commit;
15. obtain explicit owner approval before merge.

## 8. Cache-healing acceptance

After a release change:

- a browser on the previous release may heal/reload once;
- a browser already running the current release must not heal repeatedly;
- `share-inbox` must survive cleanup;
- service-worker registration must recover;
- the app must not remain behind a blank overlay;
- offline/PWA users must converge after the next successful online load.

## 9. Current corrected state

```text
version.json.v:          v208.3.3-recovery
window.APP_VER:          v208.3.3-recovery
HTML shell generation:   v208
mobile component:        v208
service-worker cache:    taskflow-v210
native package version:  1.0.3
```

These values intentionally represent different scopes except for the required `version.json.v = window.APP_VER` pair.

## 10. Merge rule

Version consistency passing in CI is required but not sufficient.

No release may be merged to `main` without explicit owner approval after relevant preview, PWA and authenticated smoke checks.
