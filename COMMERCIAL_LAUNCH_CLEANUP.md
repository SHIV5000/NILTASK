# NILTASK Commercial Launch Cleanup

Status: audit in progress

## Safety rules
- No production database object is dropped without dependency and usage verification.
- No repository file is deleted solely because its name looks old.
- Every cleanup change is made on a dedicated branch first.
- Current production rollback branches remain untouched.

## Confirmed findings
1. `index.html` references `js/activity-v208.js`, but that file does not exist.
2. The existing `js/activity-v207.js` identifies itself internally as the v208 activity UI.
3. Multiple version labels are inconsistent across `index.html`, `shared.js`, and `version.json`; these should be normalized after functional testing.
4. Historical Supabase SQL files must be classified as either migration history, active schema, or obsolete one-off scripts before deletion.

## Required Supabase evidence before destructive cleanup
- Tables, views and materialized views with estimated row counts and sizes.
- Functions with definitions, owners and dependency information.
- Triggers and their target functions.
- RLS policies.
- Extensions and schemas.
- Cron jobs, Edge Functions and Storage buckets.
- API usage evidence for candidate objects.

## Cleanup stages
1. Fix broken references and version inconsistencies.
2. Identify files with zero imports/references.
3. Move historical SQL into an archive/migrations structure instead of deleting immediately.
4. Generate a Supabase dependency report.
5. Drop only objects proven unused, after a schema backup.
6. Run login, messaging, tasks, notifications, uploads, reminders and admin regression tests.
