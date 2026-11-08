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
