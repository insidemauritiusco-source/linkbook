/* Controls only posted videos; live camera streams and uploads are unaffected. */
(function () {
 'use strict';
 const selector = '.post video';
 const tracked = new WeakSet();
 const active = new Set();
 const visibilitySupported = 'IntersectionObserver' in window;
 const io = visibilitySupported ? new IntersectionObserver(entries => {
   for (const entry of entries) {
     if (!entry.isIntersecting || entry.intersectionRatio < 0.1) {
       if (!entry.target.paused) entry.target.pause();
     }
   }
 }, {threshold: [0, 0.1]}) : null;
 function register() {
   document.querySelectorAll(selector).forEach(video => {
     if (tracked.has(video)) return;
     tracked.add(video);
     active.add(video);
     video.preload = 'metadata';
     video.controls = true;
     video.autoplay = false;
     video.removeAttribute('autoplay');
     video.addEventListener('ended', () => video.pause());
     if (io) io.observe(video);
   });
   for (const video of active) {
     if (video.isConnected) continue;
     io?.unobserve(video);
     if (!video.paused) video.pause();
     active.delete(video);
   }
 }
 const mo = new MutationObserver(register);
 function init() {
   register();
   mo.observe(document.body, {childList: true, subtree: true});
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
 else init();
 document.addEventListener('visibilitychange', () => {
   if (document.hidden) for (const video of active) if (!video.paused) video.pause();
 });
})();
