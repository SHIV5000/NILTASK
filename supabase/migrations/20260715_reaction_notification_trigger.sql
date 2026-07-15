-- Reactions never reliably reached the bell / Activity feed because the CLIENT
-- inserted the notification, and that cross-user insert depends on the RLS insert
-- policy being present. This trigger creates the notification SERVER-SIDE (security
-- definer, bypasses RLS) the instant a reaction row is inserted — so a reaction to
-- your message always lands in your bell + Activity feed, regardless of client RLS.
--
-- Idempotent. Deduped by (user_id, message_id, type) so it coexists with the client
-- path (both no-op on conflict) and never double-counts.

create or replace function public.notify_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  reactor_name text;
begin
  select sender_id into author from public.messages where id = NEW.message_id;
  -- No author, or reacting to your own message → no notification.
  if author is null or author = NEW.user_id then
    return NEW;
  end if;
  select coalesce(full_name, split_part(email, '@', 1), 'Someone')
    into reactor_name
    from public.profiles where id = NEW.user_id;

  insert into public.notifications (user_id, type, message, message_id, tenant_id, is_read)
  values (
    author,
    'reaction',
    coalesce(NEW.value, '👍') || ' ' || coalesce(reactor_name, 'Someone') || ' reacted to your message',
    NEW.message_id,
    NEW.tenant_id,
    false
  )
  on conflict (user_id, message_id, type) do nothing;

  return NEW;
end
$$;

drop trigger if exists trg_notify_on_reaction on public.reactions;
create trigger trg_notify_on_reaction
  after insert on public.reactions
  for each row execute function public.notify_on_reaction();
