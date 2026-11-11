# LinkBook device push notifications — staged beta (11 November 2026)

## Deployed in this change
- Signed-in members find **Device notifications (beta)** in the Notifications panel (bell icon).
- Buttons: Enable device alerts; Test on this screen; Send background test; Disable on this device.
- Enable asks browser permission on a direct user tap, registers the existing /linkbook/ service worker, subscribes using Web Push, and saves the endpoint plus public subscription key material to `public.push_subscriptions`.
- Authenticated row-level security limits users to their own subscriptions; `anon` has no table access.
- Foreground new-notification events can display a device notification while LinkBook is active and permission is granted.
- **Test on this screen** checks permission and the service worker. **Send background test** uses the authenticated server sender and requires the member to verify receipt on their device.
- The service worker supports a standard Web Push `push` event and opens `/linkbook/?notifications=1` when clicked.
- Sharing from Android Gallery remains on the same service worker.

## Current background sender (beta, requires real-device acceptance testing)
- A trusted Supabase Edge Function named `linkbook-push-dispatch` and a notifications table insert trigger now exist. The backend retrieves encrypted VAPID credentials from Supabase Vault; no private signing key is shipped in public GitHub files.
- The signed-in device obtains the corresponding **public** VAPID key from the server before subscribing. Existing subscriptions created using the earlier public key are replaced only when the member explicitly presses **Enable device alerts**.
- After registering a device, **Send background test** invokes the backend using the current signed-in user's token. The server restricts self-tests to that user's own endpoints and rate-limits them.
- **Test on this screen** still displays a device-local alert only. It cannot prove background server delivery.
- Server activation and signed-in delivery are implemented, but a confirmed push received on a Samsung with LinkBook fully closed, as well as a true second-account message test, **are not verified**. The feature remains Public Beta and should not be promised as reliable until those tests pass.

## Server-side safety and support
- Only the backend may read private VAPID credentials and dispatch push notifications. Never paste the private key into client code, GitHub, or this document.
- The Edge Function uses owner-scoped device subscriptions and checks the actual notification recipient before dispatching. It filters allowed notification kinds and avoids sending private message text.
- Invalid endpoints can be removed by the server after a 404/410 response. Delivery attempts are deduplicated for notification-row events.
- If server health, browser permission, device connection, or VAPID signing fails, users can still read existing in-app notifications.
- Keep the existing RLS policies on `push_subscriptions`; do not expose push endpoint lists to other members.

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
