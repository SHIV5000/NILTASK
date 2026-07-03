# Background Web Push — setup (one-time)

The app code (client subscription + service worker) is already in place. To turn
on notifications-when-the-app-is-closed, do these Supabase steps once.

## 1. Create the subscriptions table
Run `supabase/push_subscriptions.sql` in the Supabase SQL editor.

## 2. Set the function secrets
The VAPID **public** key is already in `js/notifications.js`. Set the private
key and the rest as secrets (the private key must NEVER be committed):

```
supabase secrets set \
  VAPID_PUBLIC=BC1e4iEc-QRWZB2pugDZCElyEFWTja-XS_L0Ij_1gq1Ox2zs6s1gMOSF-k7Leu70yJw81jHChVIvltxOuDGlQEM \
  VAPID_PRIVATE=<the private key I gave you in chat> \
  VAPID_SUBJECT=mailto:you@yourschool.com \
  PUSH_HOOK_SECRET=<any random string>
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 3. Deploy the edge function
```
supabase functions deploy send-push --no-verify-jwt
```
(`--no-verify-jwt` because it's called by a DB webhook, not an end user; the
`x-hook-secret` header below is what protects it.)

## 4. Create the database webhook
Supabase Dashboard → Database → Webhooks → **Create**:
- Table: `public.messages`
- Events: **Insert**
- Type: **HTTP Request**, method **POST**
- URL: `https://<project-ref>.functions.supabase.co/send-push`
- HTTP header: `x-hook-secret: <same value as PUSH_HOOK_SECRET>`

## 5. Test
1. Log in on a phone, allow notifications when prompted (registers the device).
2. Fully close the app.
3. From another device, send a message to that user (DM) or their group.
4. A system notification should arrive; tapping it opens the chat.

### Notes
- To rotate keys, regenerate with `npx web-push generate-vapid-keys`, update the
  public key in `js/notifications.js`, set the new secrets, and have users
  re-open the app (it re-subscribes automatically).
- Expired subscriptions are auto-deleted by the function on 404/410.
