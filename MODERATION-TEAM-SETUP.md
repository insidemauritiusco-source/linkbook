# LinkBook moderation team onboarding

**Status (10 Nov 2026):** Existing staff roles are implemented in Supabase; no roles assigned yet. Four Auth accounts exist, but none should be promoted without explicit owner authorization and identity verification.

## Current permissions (verified against active Supabase RLS)

| Operation | Ordinary member | Staff role `moderator` | Staff role `admin` |
|---|---|---|---|
| Report a post | Yes | Yes | Yes |
| View own submitted reports | Yes | Yes | Yes |
| View private reports queue | No | Yes | Yes |
| Change report status and notes | No | Yes | Yes |
| Remove any reported post | No | Yes | Yes |
| Remove abusive comments/posts/live comments under staff policies | No (own content only) | Yes | Yes |
| Assign or revoke staff roles through browser | No | No | No |

**Important:** The current RLS grants `moderator` and `admin` the **same content and report moderation capabilities**. `admin` is currently a label, not a separate in-app team-management role. Do not promise a stronger role split without additional design, testing and migrations. The app has no public staff-role provisioning endpoint, and must not add one without a careful authorization design.

## Recommended team

- 1 trusted platform owner as `admin` (after verified account ownership).
- 1–2 initial moderators as `moderator` (existing LinkBook accounts only).
- Use individual accounts; no shared password or Google account. Enable strong sign-in security.
- Establish written report triage (abuse, threats, impersonation, privacy complaints), escalation to owner, appeal/restore process, and response targets.
- Keep operations in public beta until at least one actual moderator can complete a disposable report lifecycle.

## Safe onboarding procedure

1. Invite the authorized person to register/sign in on LinkBook using their own account. Do not share credentials.
2. Confirm the exact person's account email and the matching Supabase Auth user ID through a **private** project-owner process. Never guess from display names or assign access just because a profile claims to be staff.
3. Record explicit operator approval for the person's role, and whether this is an initial assignment or replacement.
4. A trusted database administrator uses the Supabase dashboard SQL editor or an authenticated admin tool to promote **only the approved UUID** with a parameterized insert/upsert. Never perform the grant in public client code or through an anonymous RPC.
5. After assignment, sign out/in if necessary and confirm that only the member sees the Safety & privacy moderator dashboard.
6. Submit a disposable report from a second account; verify moderator access, audit behavior, resolution and removal. Confirm a non-staff third account cannot see or update staff-only data.
7. To revoke access, remove only that user's role record using trusted admin tooling and retest; never delete their actual user account by mistake.

### Example SQL — run only after confirmed identities and approval

The project owner must substitute `APPROVED_AUTH_USER_UUID` with the **confirmed** Supabase Auth UUID, and confirm the role choice. This SQL is documentation, **not executed**.

```sql
-- Verify identity in a trusted administrative session first.
select id, email, email_confirmed_at
from auth.users
where id = 'APPROVED_AUTH_USER_UUID'::uuid;

-- Restricted to an explicitly approved UUID + role.
insert into public.moderator_roles (user_id, role)
values ('APPROVED_AUTH_USER_UUID'::uuid, 'moderator')
on conflict (user_id)
do update set role = excluded.role;
```

For the owner `admin` role, substitute `'admin'` only after verifying ownership. The SQL editor runs with administrative privileges: protect dashboard access and do not share service-role credentials.

### Revocation — only on explicit operator instruction

```sql
delete from public.moderator_roles
where user_id = 'APPROVED_AUTH_USER_UUID'::uuid;
```

## Do not do

- Never insert arbitrary account IDs or automatically elevate the oldest user.
- Never let regular users write `moderator_roles` or ship an admin/service-role secret in browser JS.
- Never assume the existence of a moderator dashboard means the full trust and safety lifecycle is tested.
- Never describe media files as private; `linkbook-media` is currently public-readable by URL.

## Final operational checks

- A verified administrator and at least one moderator exist.
- Team has reviewed the Community Rules and privacy notice.
- Report queue and remove-action were tested on disposable content; appeal/escalation pathway is available.
- Offboarding/revocation was tested.
- Owner has considered role-granularity improvements and immutable audit history for future scale.
