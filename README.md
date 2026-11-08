# LinkBook Pro — online social network

Live site: https://insidemauritiusco-source.github.io/linkbook/

## Architecture
- Static, mobile-responsive GitHub Pages frontend.
- Dedicated Supabase LinkBook backend (NOT Virelo).
- Supabase Auth for email sign-up, sign-in, email verification and reset.
- Cloud data stored in PostgreSQL with row-level security policies.
- Authenticated users run `cloud.js`; the optional guest demo runs `app.js` and remains browser-local.
- Public photo/video media stored in the `linkbook-media` Storage bucket.
- Mauritius timezone display, English/French/Kreol language settings for the original demo.

## Features
- Online posts with text and image/video upload (up to 25 MB), feed, likes, comments, bookmarks.
- Member discovery, invitations, friend requests, accept/decline/remove.
- Private one-to-one chat between accepted friends.
- Real-time change subscriptions, in-app notification feed for likes/comments/friend requests/messages.
- Edit account display name, bio and location.
- Delete your own posts, report other users' posts.

## Notes and limitations
- Existing guest demo posts/messages are not automatically migrated to the online account. They remain in the original browser storage.
- Open the live site and **sign in** to access the cloud-backed features. Continue as demo uses local-only data.
- Online profile photos/covers are not yet uploaded through the editor.
- Notifications are **in-app only**, not Android push notifications.
- Posts are visible to signed-in members. Media uploaded to the public bucket can be viewed by anyone with its URL. Do not upload sensitive media.
- Reporting saves a report record but there is no moderation dashboard or automated review yet.
- Not yet independently tested end-to-end with two registered browser accounts.
- The dedicated Supabase Security Advisor reports **Leaked Password Protection Disabled**. Enable this via Supabase Authentication settings.
- If email confirmation links fail, verify Supabase Authentication > URL Configuration includes https://insidemauritiusco-source.github.io/linkbook/ and that your SMTP settings permit email delivery.
- GitHub Pages deployment comes from main/root; check Actions and hard-refresh after changes.

## Developer reference
- `index.html` hosts shared navigation and login.
- `auth.js` chooses `cloud.js` for logged-in users, `app.js` for the demo.
- `cloud.css` adds styling to the online feed and chat.
- `auth-config.js` contains only the public Supabase publishable key. **Never add service_role or secret keys to GitHub Pages code.**

## LinkBook Pro cloud upgrade (November 2026)

The website now includes cloud-based social features **for signed-in users** using the dedicated LinkBook Supabase project. This repository's authentication flow selects `app-cloud.js` when the user signs in, and leaves guest demo mode on `app.js`.

The shared database now contains:
- member profiles
- public-to-members text/photo/video posts
- likes, comments and saved posts
- friend requests, acceptance and removal
- private chats between accepted friends
- notifications and abuse reports

Uploaded post media is public-readable. Supported files: JPEG, PNG, WebP, GIF, MP4 and WebM (up to 25 MB). The private chat database is access-controlled by Supabase Row Level Security (RLS). Realtime updates use Supabase Postgres changes and network access.

**Important:** This is a first cloud release and has not been end-to-end tested with multiple human accounts. Guest/demo activity will NOT migrate automatically to cloud posts. Reports are stored but there is not yet an admin moderation interface, blocking feature, anti-spam rate limiting, or private post audience controls. Before public launch, test two independent signup/email-confirmation flows, chat and media uploads, configure production SMTP, enable leaked password protection, and implement moderation, privacy policy and deletion controls.

Do not put service-role or secret API keys into public JavaScript. The supplied `auth-config.js` contains only a Supabase publishable key.


## LinkBook Live (small-audience beta)

- Signed-in members can open **Live** from the LinkBook sidebar or mobile navigation, add a title, allow camera/mic access, and start a broadcast.
- Signed-in viewers can select **Watch Live**; hosts can mute microphone, share a link or end their live session.
- Video travels peer-to-peer by WebRTC. Supabase Postgres manages sessions, viewer signaling, and RLS.
- The live page shares a link of the form `?live=<session UUID>`. Sessions expire from the listing after roughly 60 seconds without heartbeat.
- **Beta only**: max 4 viewer connections per broadcast; STUN-only, so some home/mobile networks will not connect without TURN. Video is not recorded and does not scale to a large audience. Browser tabs must remain open.
- Not yet verified end-to-end using two browsers/accounts. A production live video feature needs a managed SFU/streaming service, moderation, connection safeguards and TURN.


## Live comments and reactions

Signed-in viewers and broadcasters can exchange live comments and react with Like, Love, Haha and Wow. A member has one reaction per live session and can update or remove it. Comment authors and hosts can remove comments. Database row-level security protects operations; these are beta features with no automated spam filtering or moderation dashboard.

The live broadcast interface also provides microphone mute, a camera on/off control, an optional front/back camera switch where the device supports it, share link, viewer count, and elapsed live duration. Streams currently use WebRTC browser-to-browser connections (up to 4 viewers; no TURN relay) and **are not equivalent to a production-scale Facebook Live service**. Long streams depend on uninterrupted device and network availability. Test with two distinct signed-in accounts before public launch.

## November 8, 2026 — mobile branding and camera control patch

- Added an installable-web-app manifest and an original LinkBook SVG icon, with browser title, mobile app name, and theme metadata.
- Fixed the camera control lookup in the Live screen so the Front, Back and Switch buttons receive the appropriate disabled/enabled states when camera devices are detected.
- Refreshed the Live script URL version to help browsers fetch the corrected controller.
- Original social-network user data and the dedicated Supabase backend were left unchanged.

**Verification:** Updated repository files have been read back from GitHub. GitHub Pages deployment and multi-device live-video streaming should still be verified separately on actual Android devices. Public beta readiness is not confirmed; moderation, account/data deletion features, and production live infrastructure remain important before a broad launch.

## 8 November 2026 — trust & safety hardening (beta)

Implemented in the dedicated LinkBook Supabase project and on the GitHub Pages frontend:

- Account blocking/unblocking with database RLS protection preventing blocked pairs from sending new messages/friend requests and viewing one another's social posts/profiles. Post comments, likes and saved-post inserts also check block relationships.
- Private moderation queue and reports with statuses (open, reviewing, resolved, dismissed) and moderator notes; moderators can remove reported posts. Moderator roles cannot be assigned by ordinary users. **No moderators are assigned yet**; assign trusted accounts in `public.moderator_roles` via the secure Supabase dashboard only.
- Database insert throttling for posts, comments, messages, live comments and reports. These limits deter accidental floods but do not replace CAPTCHA, abuse detection or more advanced IP/device controls.
- Signed-in Safety & privacy page (desktop and mobile), report history, block controls, JSON account-data export, and an explicit irreversible account-deletion button.
- A JWT-protected `linkbook-delete-account` Supabase Edge Function requiring the signed-in user's explicit confirmation. It removes LinkBook uploads in that user's folder before deleting their Auth account, cascading to related records. This action is destructive and was **not tested with a real user**.
- Public beta [Privacy Notice](privacy.html) and [Community Rules](terms.html), linked from the login screen and Safety page. Operator identity, legal jurisdiction, and contact information should be reviewed before public release.

### Checks and launch blockers

- GitHub versions of `auth.js`, `app-cloud.js`, `live.js`, and `safety.js` passed JavaScript syntax parsing. This is not equivalent to automated or browser end-to-end testing.
- Confirm Android front/back camera switch on a physical phone. Browser permission and camera hardware vary. The Android emulator available for testing has only one back camera and cannot verify the physical front/back switch.
- Google OAuth must be enabled in Supabase Authentication > Providers > Google, with the Supabase callback configured on the Google Cloud OAuth client and LinkBook GitHub Pages return URL in Supabase Auth URL settings. **Not verified**.
- Phone OTP requires a paid/working SMS provider under Supabase Authentication > Providers > Phone. **Not verified**.
- In Supabase Auth settings, enable leaked-password protection; the Security Advisor continues to show this warning. See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Test account registration and email verification, media upload, block, chat, reports, data export, and account deletion with controlled test accounts on distinct devices; no live human credentials were collected or used in this change.
- The live broadcast stack remains experimental (WebRTC STUN only, up to four viewers, no TURN/SFU). Do not advertise it as production-scale Facebook Live, and do not promise live streaming connectivity on all networks.
- File storage is public-readable by URL; posts and profiles are members-only in the database, but their uploaded media links can be shared externally. Do not claim uploaded media is private.
- Keep LinkBook in public **beta** until the operator finishes testing, configures moderator ownership, and sets up incident response/contact and legal information.
