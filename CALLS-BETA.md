# LinkBook one-to-one calls — beta (10 November 2026)

## Implemented
- Voice Call and Video Call buttons in the private Messages chat for accepted friends.
- Recipient sees an in-app incoming call with **Answer** or **Decline**.
- Calling controls: **Mute/Unmute**, **Camera on/off** for video, and **End call**.
- Browser microphone/camera permissions are requested only when the user starts or accepts a call.
- Peer-to-peer WebRTC transport using STUN and a participant-restricted Supabase signaling channel.
- Call setup metadata and signaling are stored in `private_call_sessions` / `private_call_signals`. No application-level recording feature.

## Access boundaries
- Signed-in accounts only. Session insert is limited by RLS to a caller with an **accepted, unblocked** friendship to the callee.
- Session read is restricted to the two participants.
- Signaling records can be inserted only by the current sender for the exact other participant in the session and only when not blocked.
- Anonymous read access is revoked. Neither the service-role key nor admin privileges are exposed in browser code.
- Existing messages, posts, public live broadcast tables and media files are not changed.

## Beta limitations (do not advertise as production-grade calling)
- Both participants need LinkBook open in a foreground browser tab or installed PWA. No system push notification, mobile phone dialer integration or guaranteed ringing when the app is closed.
- STUN-only WebRTC; calls may fail on symmetric NAT, restrictive firewalls or certain mobile/Wi-Fi networks without TURN relay infrastructure.
- A basic ~5-second polling fallback is used for signaling: ringing can be delayed and is not appropriate for large-user scaling without Realtime / push and quotas.
- One-to-one only. No group calling, call recording, call history UI, screen sharing or cellular/PSTN dial-out.
- Signaling metadata currently persists until account deletion or future separately reviewed retention cleanup; it includes technical WebRTC setup information. Review retention policy before a large launch.
- Both users need supported browsers and must grant microphone/camera permissions. Real Android/Lenovo two-device connectivity has **not** been verified.

## Acceptance test using two consented test accounts
1. Friend account A sends a request to B; B accepts. A opens Messages, selects B, taps **Voice call**. Both accounts keep their browser tabs open.
2. B sees **Answer/Decline** and chooses Answer. Both grant microphone. Verify audio in both directions, mute/unmute, and End call.
3. Repeat using **Video call**. Verify camera/microphone permissions, two video feeds, camera off/on and End call.
4. B declines a call; ensure both sides stop ringing and clear microphone/camera indicators.
5. Block A from B's account and verify new calls are refused by Supabase, even with manually forged client requests.
6. Repeat on Android mobile data vs Lenovo Wi-Fi and different browsers. If peer connection fails, configure a reputable TURN server with secure ephemeral credentials before any production promises.
7. Test permission denial, reloading mid-call, tab backgrounding and offline connection.
8. Verify no ordinary user can view a third party's call signaling through REST queries or subscribe to unrelated sessions.
9. Confirm storage/data retention and update operator privacy policy before expanded public access.

## Administrator notes
- The call tables were created by Supabase migration `linkbook_private_call_signaling_beta_20261110`; the insert policy was corrected by `linkbook_private_calls_correct_insert_rls_20261110`.
- RLS + database grants were checked; security advisor still reports unrelated disabled leaked-password protection.
- Do not open broad public call promotion before two-device tests and operational rate controls.
