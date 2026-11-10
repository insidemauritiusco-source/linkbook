# LinkBook public launch readiness — 10 November 2026

**Status: public beta, NOT approved for broad launch.** Keep existing users, database, uploads, security policies and separate projects unchanged.

## Verified from connected GitHub / Supabase
- Latest mobile-responsive GitHub Pages deployment succeeded (commit `4421ac1`).
- Authenticated text-only post reached `public.posts` with HTTP 201 in an observed Android test.
- Google sign-in has worked on an existing user account; fresh-user sign-up, recovery and other providers are not end-to-end verified.
- `linkbook-media` is public-readable; per-user folder INSERT policy exists; bucket limit is 25 MiB and MIME allowlist includes JPEG, PNG, WebP, GIF, MP4 and WebM.
- Storage has received at least one JPEG and an MP4, but recent Android uploads of both JPG and PNG showed `LB-UPLOAD-NET` after successful OPTIONS requests, with no completing POST visible. Wi-Fi and mobile data both failed in reported tests.
- Reporting, blocking and account deletion components exist in repo. **There are zero members of `public.moderator_roles`** at this check.
- Account deletion with a real test user and high-concurrency video streaming have not been verified.

## Release-blocking verification matrix

| Area | Test and evidence required | Current status |
| --- | --- | --- |
| New registration | Create test accounts with email and Google on separate browsers/devices; verify email, log out, log back in; audit session separation | Unverified |
| Password and account recovery | Reset password, expire/revoke sessions, test deleted-user access; enable leaked-password protection if available | Unverified |
| Phone sign-in | Confirm actual SMS provider configuration and one-time code delivery with a permitted test phone | Unverified |
| Android media | Upload small JPG, PNG, and MP4 on Samsung Chrome; inspect *actual* POST and browser Network/CORS response; verify saved post, feed and re-login | **Failing** |
| Laptop media | Upload JPG and MP4 from Lenovo; verify media link displays for second account and reload; avoid mistaking a prior post for a new success | Partial |
| Storage permissions | Verify second user cannot upload/delete in first user's folder; media links public by URL must be disclosed | Not fully tested |
| Moderation | Assign at least one trusted moderator in Supabase via secure admin channel; file a test report and verify review, removal, appeal/contact workflow | **Blocked: no moderator assigned** |
| Blocking and privacy | Test blocking across accounts, post/profile visibility, chat and friend requests; verify privacy notice and support contact | Unverified |
| Account deletion | Test export and deletion with disposable account; verify Auth removal, object cleanup, and inaccessible user content after deletion | Unverified |
| Mobile and desktop UX | Check phone widths 320/360/390/430px, keyboard focus, navigation, dark mode, images, mobile date/time, Lenovo desktop | Static checks only |
| Performance and reliability | Use disposable multi-account load tests, confirm email limits, quotas, storage spend alerts, backup and recovery | Unverified |
| Legal and operations | Operator/support identity, updated terms/privacy for Mauritius and other target markets, abuse escalation and incident response | Unverified |
| Live video | Validate front/back camera, permissions, TURN/SFU or disable/clearly mark as beta until scaled | Experimental |

## Storage diagnosis procedure (never paste secrets)
1. On a connected Android device use Chrome remote inspection on Windows (`chrome://inspect/#devices`) or inspect on desktop first.
2. Open Network, preserve log, filter `storage/v1/object`; publish one disposable JPEG under 1 MiB.
3. Record OPTIONS status and the **response headers** `access-control-allow-origin`, `access-control-allow-methods`, `access-control-allow-headers`; compare against request's `Origin` and `Access-Control-Request-Headers`.
4. Check whether POST occurs, request `Content-Type` (multipart versus raw), HTTP status/response and console's specific message.
5. Redact `Authorization`, `apikey`, cookies, access tokens, user IDs, personal images and full HAR before sharing.
6. If POST never starts, debug preflight CORS or browser filtering; if POST completes non-2xx, debug status and RLS; if HTTP 2xx but the post fails, debug post insertion/linking. Do not weaken RLS or deploy service role keys.

## Launch policy
- Invite a small number of **consenting beta testers** only; explicitly label incomplete uploads and experimental live features.
- Do not advertise unlimited storage, universal video support or private-by-default media; media is publicly accessible with its URL.
- Do not disable RLS, publish service-role credentials, or create unverified admin accounts.
- Require explicit operator approval and real-device checks before removing beta labels or opening a broad marketing campaign.
- Preserve separate apps Virelo and ZivTok and the Inside Mauritius news website.

## Beta acceptance test (two disposable accounts)
1. Sign up as A and B; sign in separately on Android and laptop.
2. As A create text, image and short video posts, then verify from B.
3. B likes, comments and reports; moderator reviews, removes abusive test content, verifies audit and support flow.
4. A blocks B; ensure B cannot message, friend or view protected posts according to current policy.
5. A exports data and deletes disposable account; confirm stored objects and authored data are cleaned as expected.
6. Retest a full user lifecycle after every security-related change. Document date, device, browser, step, outcome, and redacted evidence.
