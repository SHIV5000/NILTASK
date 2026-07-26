# NILTASK Automated Professionalization Validation

> Use with `AI.md`, `PROFESSIONALIZATION_PLAN.md`, `SMOKE_TEST_CHECKLIST.md`, `RUNTIME_OWNERSHIP_INVENTORY.md` and `MOBILE_RUNTIME_OWNERSHIP.md`.

## Purpose

The automated validation is a fast structural release gate for the professionalization work. It prevents known architectural regressions from being merged accidentally while the application is still being migrated incrementally.

It is deliberately dependency-free and runs with Node.js built-ins only.

## Command

```bash
npm run validate:professionalization
```

The command runs:

```text
scripts/validate-professionalization.mjs
```

## GitHub Actions workflow

```text
.github/workflows/professionalization-validation.yml
```

The workflow runs on:

- every pull request;
- pushes to `main`;
- pushes to `agent/**` branches.

It uses:

```text
Node.js 24
ubuntu-latest
5-minute timeout
contents: read
```

## Protected contracts

### Activity ownership

The validator requires:

- source-owned Activity fallback remains 60 seconds;
- `NILTASK_ACTIVITY_CONTROLLER_VERSION = v1` remains present;
- the retired Activity stability loader remains absent;
- the retired `activity-v207.js` wrapper loader remains absent;
- the compatibility entrypoint constructs no MutationObserver;
- the compatibility entrypoint does not replace `openActivityFeed`;
- the source-owned layout marker remains present.

### Desktop realtime ownership

All seven named owners must remain present:

```text
desktop-shared-broadcast
desktop-message-reactions
desktop-scheduled-messages
desktop-notification-rows
desktop-tasks
desktop-task-assignees
desktop-task-trails
```

All seven managed topic contracts must remain present:

```text
public:messages-<tenant>
taskflow-bc-<tenant>
scheduled-changes
notifications-changes
tasks-changes
assignees-changes
trails-changes
```

The desktop feature-owner module must remain mobile-gated.

### Unread authority

The validator requires:

```text
total unread = room unread total + attention unread
```

It also requires:

- message, reply and mention notification rows remain excluded from attention count;
- fallback attention state remains isolated per user;
- UnreadService remains passive on mobile;
- the desktop room observer remains scoped to `#chatsList` children;
- no body-wide unread observer exists.

### Mobile diagnostics boundary

The validator requires the read-only mobile diagnostic to continue checking:

- `mobile-rt-*` channel count/state;
- `presence-*` channel count/state;
- absence of desktop feature owners;
- export of `NILTASK_printMobileRuntimeSnapshot()`.

It does not claim ownership of module-local mobile timers.

### PWA cache/version coordination

Every query-versioned runtime script dynamically loaded by `js/utils/text.js` must appear with its exact URL in `sw.js`.

The validator also requires:

- service-worker cache generation is declared;
- `PWA_RELEASE_NOTES.md` contains the same cache generation;
- `share-inbox` remains preserved during cache cleanup;
- navigation remains network-first.

### Parse and data-file checks

The validator parses:

- `package.json`;
- `manifest.json`;
- `version.json`.

It syntax-checks the professionalization classic scripts without executing browser code.

## What a green check means

A passing check means the repository still contains the expected professionalization ownership and release contracts, and the checked classic scripts parse successfully.

## What a green check does not mean

It does not prove:

- Supabase RLS correctness;
- authenticated query results;
- realtime delivery on a live tenant;
- message, reaction or notification parity across two users;
- mobile socket reliability;
- Android background/foreground behaviour;
- PWA update behaviour on an already-installed device;
- visual correctness;
- long-session memory stability;
- complete Task lifecycle correctness.

Those still require the manual checks in `SMOKE_TEST_CHECKLIST.md`.

## Failure policy

Do not weaken a failed assertion merely to make CI green.

For every failure:

1. determine whether the runtime contract regressed or the assertion is imprecise;
2. fix the runtime when the contract regressed;
3. narrow the assertion only when it produced a demonstrated false positive;
4. preserve the original safety objective;
5. rerun the workflow;
6. keep the PR draft until required manual checks also pass.

## Initial validation record

The first workflow run correctly executed but found one false positive: a documentation comment said “No function wrappers or MutationObservers,” and the original assertion searched for the word `MutationObserver` rather than executable construction.

The assertion was corrected to reject `new MutationObserver`. The replacement workflow passed without weakening the no-observer contract.

## Merge rule

A green automated validation is required but never sufficient for merge.

`main` must not be changed until the owner explicitly approves the draft PR after the relevant authenticated and device smoke checks.
