# Noted For Action Release and Component Version Contract

> Read with `AI.md`, `PROFESSIONALIZATION_PLAN.md`, `PWA_RELEASE_NOTES.md`, `PROFESSIONALIZATION_VALIDATION.md` and `RELEASE_ROLLBACK_CHECKLIST.md`.

## Purpose

Noted For Action uses several version-like strings with different scopes. They must not be treated as interchangeable.

## 1. Authoritative release identity

`version.json.v` and `window.APP_VER` in `js/shared.js` are the network-visible application release identity.

Required invariant:

```text
version.json.v = window.APP_VER
```

The professionalization validator fails when these values differ.

## 2. HTML shell generation

`index.html` currently carries the existing v208 shell-generation markers. These are component/shell markers, not the cache-healing release authority.

## 3. Component versions

Examples include:

```text
NILTASK_MOBILE_VERSION
NILTASK_ACTIVITY_CONTROLLER_VERSION
NILTASK_ACTIVITY_UI_VERSION
NILTASK_REALTIME_FEATURE_OWNERS_VERSION
NILTASK_UNREAD_SERVICE_VERSION
NILTASK_CHAT_PARITY_VERSION
NFA_WEB_VERSION
query strings such as ?v=5 or ?v=208.3
```

A component revision changes only when that component contract changes materially. Component versions do not need to equal the release identity.

## 4. Service-worker cache generation

Current production generation:

```text
taskflow-v217
```

Defined in `sw.js`.

This is a cache namespace, not the application release identity. Advance it when the app-shell file list changes, a query-versioned precached asset changes, a local production stylesheet replaces a browser CDN, an offline-critical service is added or removed, or cached-asset semantics require old app-shell caches to be discarded.

`PWA_RELEASE_NOTES.md` must contain the same cache generation.

## 5. WEB v13

`WEB v13` is the desktop Web finishing-layer identifier. It covers the production Tailwind switch, service-worker fetch hardening, and no-flicker task-action presentation. It does not replace `window.APP_VER` as the application release identity.

## 6. Native shell version

`package.json` version and Android/iOS native build numbers describe the Capacitor wrapper release. The Capacitor app loads the live Vercel site, so most Web releases do not require an APK rebuild.

## 7. Supabase project identity safety

The browser anon key and project URL must continue to satisfy:

```text
JWT payload ref = project ref in SUPABASE_URL hostname
JWT payload role = anon
```

Never replace the browser key with a service-role key or a key from another project.

## 8. Release update sequence

For a normal Web release:

1. keep `version.json.v` and `window.APP_VER` identical;
2. change only component versions that actually changed;
3. update query-versioned loader URLs where required;
4. update matching service-worker precache URLs;
5. advance the service-worker cache generation when the app shell changes;
6. update `PWA_RELEASE_NOTES.md` when the cache generation changes;
7. run automated validation;
8. deploy;
9. verify there is no version-healing or service-worker reload loop;
10. run relevant authenticated desktop/mobile smoke checks;
11. retain a clean rollback commit boundary.

## 9. Cache-healing acceptance

After a release change:

- a browser on the previous release may heal/reload once;
- a browser already running the current release must not heal repeatedly;
- `share-inbox` must survive cleanup;
- service-worker registration must recover;
- the app must not remain behind a blank overlay;
- offline/PWA users must converge after the next successful online load.

## 10. Current scoped state

```text
version.json.v:          v208.3.3-recovery
window.APP_VER:          v208.3.3-recovery
HTML shell generation:   v208
Mobile PWA UI marker:    PWA v216
Desktop Web marker:      WEB v13
service-worker cache:    taskflow-v217
native package version:  1.0.3
```

These values intentionally represent different scopes except for the required `version.json.v = window.APP_VER` pair.
