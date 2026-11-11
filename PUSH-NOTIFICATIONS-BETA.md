# LinkBook device push notifications — staged beta (11 November 2026)

## Deployed in this change
- Signed-in members find **Device notifications (beta)** in the Notifications panel (bell icon).
- Buttons: Enable device alerts; Send test alert; Disable on this device.
- Enable asks browser permission on a direct user tap, registers the existing /linkbook/ service worker, subscribes using Web Push, and saves the endpoint plus public subscription key material to `public.push_subscriptions`.
- Authenticated row-level security limits users to their own subscriptions; `anon` has no table access.
- Foreground new-notification events can display a device notification while LinkBook is active and permission is granted.
- A **local browser notification test** checks permission and the service worker. It does not prove network background push delivery.
- The service worker supports a standard Web Push `push` event and opens `/linkbook/?notifications=1` when clicked.
- Sharing from Android Gallery remains on the same service worker.

## Not active yet — DO NOT advertise as live background alerts
The client alone cannot send authenticated encrypted push messages to remote devices. A separate trusted backend sender must be configured with a matching **VAPID private signing key** and Web Push encryption. This change deliberately does **not** commit a private signing key to GitHub or call an insecure sender from the browser.

The public signing key embedded in `device-alerts.js` is staging-only. Before full launch, provision an operator-controlled persistent keypair in the server secrets manager, update the frontend public key if it changes, and re-enable subscriptions. Configure an authenticated sender/worker that reads only recipient-owned push subscriptions, sends a generic notification payload, handles invalid 404/410 endpoints, and enforces per-member rate limiting and audit logging. Connect that worker to new rows in `public.notifications` using a secure, backend-triggered queue or webhook. Never expose the Supabase service-role key or VAPID private key in browser JavaScript, public GitHub files, push messages, or SQL functions callable by ordinary members.

## Acceptance testing
1. Open LinkBook in Android Chrome / installed PWA and tap the bell → Enable device alerts → Allow.
2. Tap Send test alert: check for a notification and tap it. The Notifications page should open.
3. Deny permission on a separate disposable browser session: ensure Enable is disabled with a useful explanation.
4. Disable on this device: verify browser subscription and your user-owned database row are removed.
5. Sign in with a second test account: confirm it cannot read or update the first user's endpoints using Data API/RLS.
6. Trigger a normal message/friend request on another account: test in-app notification and foreground alert while LinkBook stays open.
7. **Only after secure sender activation:** close LinkBook entirely, send a real message from a second account, verify the recipient receives a push on Android and the tap opens their notification list.
8. Test Android battery restrictions, multiple devices, unsubscribed devices and revoked permission. Verify no sensitive chat content appears on the lock screen.
9. Investigate any Supabase Auth security advisor warnings (leaked password protection currently disabled) before a broad public launch.

## Privacy
Endpoint URLs are pseudonymous notification routing identifiers, but treat them as personal/account-linked data. Keep storage owner-limited, send generic notification body text, and avoid exposing message content to push providers. Users can withdraw consent on each device. Browser permission may also be changed in device settings.

## Existing behavior preserved
Original in-app notifications, chats, posts, account registration, Android Share Target and Status remain intact.

## Update 11 November 2026 — secure sender linked
- An authenticated Supabase Edge Function named `linkbook-push-dispatch` is deployed with a public readiness endpoint, allowing browser registrations to use its actual VAPID public signing key.
- Supabase Vault stores the server-only VAPID private key and webhook token; neither is copied into the public repository. A database trigger on `public.notifications` queues delivery for messages, friend requests and the existing supported notification types.
- **Before expecting a push, existing subscribed devices must open Notifications → Enable device alerts again.** Their former subscriptions were created with a different public signing key, so they cannot be used by the server. The updated browser code renews the subscriptions.
- The “Test background push” button asks the secure server to send a real push to the signed-in account only, subject to a 2-minute rate limit. The local test alert is separate and does not demonstrate background delivery.
- Server and database configurations have been inspected; end-to-end Samsung delivery with LinkBook closed remains to be verified. Unsubscribe old devices only when requested by the owner.
