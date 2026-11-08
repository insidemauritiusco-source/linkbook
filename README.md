# LinkBook — Facebook-style social network starter

A working mobile-responsive **frontend demo**. It includes a feed, create text post, like/unlike, comments, save post, post share text, sample friend suggestions, local demo chat, editable profile, search, and dark mode.

## Try it
Open `index.html` in a browser (or use a local web server such as `python -m http.server 8000`). No build step required.

## Important limitations
This is a single-browser prototype. It stores demo content in `localStorage`. It has **no server, multi-user accounts, authentication, real friend requests, real-time chat, or cloud media uploads**. It is not safe or suitable for production social networking without a backend, authentication, authorization, database, image storage, moderation and privacy controls. Sample users are fictional demo suggestions.

## Publish on GitHub Pages
1. Create a dedicated repository (for example `linkbook`) in your GitHub account.
2. Upload `index.html`, `styles.css`, and `app.js` to its root.
3. Open repository Settings > Pages > Deploy from a branch > `main` / `(root)` > Save.

GitHub Pages is static hosting and does not supply a database or login system. For a real LinkBook service connect Supabase or another secure backend and implement row-level security.

## Staged Supabase email authentication

Branch: feature/supabase-email-auth. The app will show email signup/login once
the credentials in auth-config.js have been filled in. If they are empty, the
existing local demo continues to work with no login; nothing is broken.

**Use a separate Supabase project for LinkBook, NOT the Virelo project.**
1. Create a LinkBook project in the Supabase organization you choose.
2. Copy the Project URL and PUBLIC publishable API key into auth-config.js.
   Never use a secret key or service_role key in browser code.
3. In Authentication -> URL Configuration, set Site URL and allowed redirect URL
   to https://insidemauritiusco-source.github.io/linkbook/
4. Enable email signup and email confirmations. Configure production SMTP.
5. Merge this branch into main after testing. GitHub Pages deploys from main.

This change only adds authentication. Posts, likes, comments, friend suggestions
and demo messages are still stored in the browser per signed-in user. Real social
content requires a shared database, RLS policies, storage and moderation.
