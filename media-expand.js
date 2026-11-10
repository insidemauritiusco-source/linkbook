/* Expand feed media without changing the uploaded files or live broadcast controls. */
(() => {
 'use strict';
 const mediaSelector = '.post img.post-image, .post video.post-image';
 const registered = new WeakSet();
 let overlay = null;
 let focusBefore = null;
 let sourceVideo = null;

 function close() {
   if (!overlay) return;
   const current = overlay;
   overlay = null;
   const video = current.querySelector('video');
   if (video) video.pause();
   current.remove();
   sourceVideo = null;
   const toFocus = focusBefore;
   focusBefore = null;
   if (toFocus?.isConnected) toFocus.focus();
   document.body.classList.remove('lb-media-expanded');
 }
 function open(media) {
   if (!media?.src) return;
   close();
   focusBefore = document.activeElement;
   sourceVideo = media.tagName === 'VIDEO' ? media : null;
   if (sourceVideo && !sourceVideo.paused) sourceVideo.pause();
   const modal = document.createElement('div');
   modal.className = 'lb-media-lightbox';
   modal.setAttribute('role', 'dialog');
   modal.setAttribute('aria-modal', 'true');
   modal.setAttribute('aria-label', sourceVideo ? 'Expanded video' : 'Expanded photo');
   const closeButton = document.createElement('button');
   closeButton.type = 'button';
   closeButton.className = 'lb-media-close';
   closeButton.textContent = '× Close';
   closeButton.setAttribute('aria-label', 'Close expanded media');
   closeButton.addEventListener('click', close);
   const content = document.createElement(sourceVideo ? 'video' : 'img');
   content.className = 'lb-media-full';
   content.src = media.currentSrc || media.src;
   if (sourceVideo) {
     content.controls = true;
     content.preload = 'metadata';
     content.playsInline = true;
     content.currentTime = Number.isFinite(media.currentTime) ? media.currentTime : 0;
   } else {
     content.alt = media.alt || 'Expanded post photo';
   }
   modal.append(closeButton, content);
   modal.addEventListener('click', e => { if (e.target === modal) close(); });
   document.body.append(modal);
   overlay = modal;
   document.body.classList.add('lb-media-expanded');
   closeButton.focus();
 }
 function register() {
   document.querySelectorAll(mediaSelector).forEach(media => {
     if (registered.has(media)) return;
     registered.add(media);
     if (media.tagName === 'IMG') {
       media.classList.add('lb-photo-expandable');
       media.tabIndex = 0;
       media.setAttribute('role', 'button');
       media.setAttribute('aria-label', 'Expand photo');
       media.addEventListener('click', () => open(media));
       media.addEventListener('keydown', e => {
         if (e.key === 'Enter' || e.key === ' ') {
           e.preventDefault();
           open(media);
         }
       });
     } else {
       const button = document.createElement('button');
       button.type = 'button';
       button.className = 'lb-video-expand';
       button.textContent = '⛶ Expand video';
       button.setAttribute('aria-label', 'Expand video');
       button.addEventListener('click', async () => {
         if (typeof media.requestFullscreen === 'function') {
           try { await media.requestFullscreen(); return; }
           catch (_) { /* Fallback to in-page dialog. */ }
         }
         open(media);
       });
       media.insertAdjacentElement('afterend', button);
     }
   });
 }
 document.addEventListener('keydown', e => {
   if (!overlay) return;
   if (e.key === 'Escape') { e.preventDefault(); close(); }
   else if (e.key === 'Tab') { e.preventDefault(); overlay.querySelector('.lb-media-close')?.focus(); }
 });
 function init() {
   register();
   const root = document.querySelector('#content') || document.body;
   new MutationObserver(register).observe(root, {childList: true, subtree: true});
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
 else init();
})();
