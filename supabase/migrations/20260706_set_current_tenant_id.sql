-- Missing setter for the tenant-id session cache.
--
-- 20260627_app_logs.sql defined the READER app.get_current_tenant_id() (which
-- reads the 'app.current_tenant_id' session variable, falling back to a profiles
-- lookup), but the SETTER was never created — so main.js's
--   sb.rpc('set_current_tenant_id', { tenant_id })
-- returns 404 and the O(1) optimization never activates (RLS silently falls back
-- to the per-row profiles subquery, i.e. the slow path this was meant to fix).
--
-- SECURITY: this must NOT blindly trust the argument. get_current_tenant_id()
-- trusts the session variable, so if a client could set it to any value they'd
-- read another tenant's rows. We therefore only honour the call when the passed
-- tenant_id is the caller's OWN tenant (verified against profiles).
CREATE OR REPLACE FUNCTION public.set_current_tenant_id(tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF tenant_id IS NOT NULL
     AND tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
  THEN
    -- is_local = false: persist for the whole session/connection, not just the txn.
    PERFORM set_config('app.current_tenant_id', tenant_id::text, false);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_current_tenant_id(uuid) TO authenticated;
