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
