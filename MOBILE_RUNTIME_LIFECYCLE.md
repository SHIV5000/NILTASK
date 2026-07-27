# NILTASK Explicit Mobile Runtime Lifecycle

> Binding read order: `AI.md` → `PROFESSIONALIZATION_PLAN.md` → `MOBILE_RUNTIME_OWNERSHIP.md` → this file → `PROFESSIONALIZATION_PROGRESS.md`.

## Status

```text
MobileRuntime:             v1
SessionLifecycle:          v4
Mobile diagnostics:        v2
PWA cache generation:      taskflow-v209
Behavioral CI test:        required
Production merge:          not approved
```

## Why this boundary exists

The mobile shell owns module-local channels, reconnect timeouts, database fallback intervals, Activity polling, typing expiry, heads-up timers, Visual Viewport listeners and observers.

Removing Supabase channels alone is insufficient. A channel `CLOSED` callback can schedule another reconnect while logout, account switching or tenant switching is already in progress. Re-running `initMobileApp()` in the same page is also unsafe after external channel removal because `mobile.js` still holds stale module-local `_rtChannel` and `_presenceChannel` references.

The professional contract is therefore:

```text
stop current mobile runtime explicitly
→ clear owned resources
→ remove mobile/presence channels
→ block reconnect work
→ reload before starting a new identity/runtime
```

## Early installation

`js/utils/text.js` is a classic script loaded before `mobile.js` and `mobile-tasks.js` module evaluation. It installs `NILTASK_MobileRuntime` before those modules create long-lived resources.

The tracker wraps native APIs but records a resource only when the immediate JavaScript callsite is:

```text
/js/mobile.js
/js/mobile-tasks.js
```

Desktop and unrelated application timers/listeners retain normal native behaviour.

## Tracked resources

The lifecycle currently records:

- mobile-originated `setTimeout` handles;
- mobile-originated `setInterval` handles;
- mobile-originated animation frames;
- persistent mobile listeners on window, document, Visual Viewport, service worker and stable mobile shell elements;
- mobile-originated MutationObservers;
- Supabase channels whose topics begin with `mobile-rt-` or `presence-`.

It does not remove desktop managed topics or unrelated browser resources.

## Public API

```javascript
NILTASK_MobileRuntime.stop(reason)
NILTASK_MobileRuntime.start(reason)
NILTASK_MobileRuntime.restart(reason)
NILTASK_MobileRuntime.snapshot()
NILTASK_MobileRuntime.printSnapshot()
```

### `stop(reason)`

1. Marks the current mobile runtime stopped.
2. Clears tracked timers, intervals, animation frames, listeners and observers.
3. Removes only mobile/presence Supabase channels.
4. Runs cleanup a second time because channel-close callbacks may have attempted work during removal.
5. Records the reason, timestamp and resources removed.
6. Rejects later timer/listener/observer creation from mobile callsites on the stopped page.

The operation is idempotent while cleanup is in flight.

### `start(reason)` / `restart(reason)`

A stopped runtime restarts only through:

```text
window.location.reload()
```

This is deliberate. Same-page resurrection would leave stale module-local channel references and is not accepted as a professional restart strategy.

## SessionLifecycle ordering

`SessionLifecycle.cleanup()` now uses this order:

```text
close Activity runtime
→ MobileRuntime.stop(reason)
→ detach push identity when required
→ remove remaining realtime channels
→ clear service-worker auth
→ flush/stop logger
→ reset session context
```

Mobile stop occurs before general realtime teardown so a mobile `CLOSED` callback cannot recreate a reconnect timer during cleanup.

## Identity recovery

Session lifecycle v4 handles:

- tenant change: cleanup then reload;
- authenticated user change: cleanup then reload;
- sign-in after a prior same-page cleanup: reload if MobileRuntime remains stopped.

Only one identity-change reload may be scheduled at a time.

## Diagnostics

Use:

```javascript
NILTASK_printMobileRuntimeSnapshot()
```

The v2 snapshot reports:

- mobile/presence channel topics and joined states;
- absence of desktop named owners;
- passive shared-UnreadService state;
- stopped state and stop reason;
- tracked timeout, interval, animation-frame, listener and observer counts;
- removed-channel total;
- last cleanup record;
- reload-only restart mode;
- acceptance booleans for zero resources/channels after stop.

Before cleanup, an authenticated mobile session should normally show one main mobile channel and one presence channel. After a controlled stop, both channel counts and all tracked resource counts must be zero.

## Automated behavioral test

Required command:

```bash
npm run test:mobile-runtime
```

The VM-based test executes the real early bootstrap, then simulates code with `/js/mobile.js` and `/js/main.js` filenames. It proves that:

- mobile timeout, interval, animation frame, listener and observer are tracked;
- mobile and presence channels are removed;
- a desktop message channel remains;
- all mobile tracked counts reach zero after stop;
- a post-stop mobile reconnect timer is rejected;
- a post-stop desktop timer still behaves normally;
- restart reloads exactly once and records its reason.

The GitHub Actions workflow must run this test in addition to static contracts, PWA assets and the Tailwind verification build.

## PWA coordination

The exact offline-critical URLs are:

```text
/js/core/session-lifecycle.js?v=4
/js/core/mobile-runtime-diagnostics.js?v=2
```

They are precached in `taskflow-v209`. Old app-shell caches are removed after activation while `share-inbox` remains preserved.

## Remaining manual acceptance

Static and VM tests do not replace authenticated device checks. Before merge:

- verify one `mobile-rt-*` and one `presence-*` channel on a real phone;
- keep the app open for at least 30 minutes;
- background and resume it repeatedly;
- verify messages, DMs, reactions, Tasks, typing and presence;
- sign out and sign in again on the same page;
- switch account/tenant where available;
- verify one controlled reload and no reconnect storm;
- confirm old-user messages, badges and callbacks never appear;
- confirm installed PWA cache convergence and offline reload.

## Rollback

If real-device testing reveals a regression:

1. keep PR #204 draft and unmerged;
2. revert the coordinated mobile tracker, SessionLifecycle, diagnostic, loader and PWA-cache changes;
3. use a new corrective service-worker cache generation rather than reusing a broken namespace;
4. preserve logs and runtime snapshots;
5. document root cause before attempting another lifecycle boundary.

`main` and production remain unchanged until explicit owner approval.
