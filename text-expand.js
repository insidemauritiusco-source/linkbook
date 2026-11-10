/* Read more and expanded reading view for LinkBook post text only. */
(() => {
  'use strict';
  const seen = new WeakSet();
  let dialog = null;
  let previousFocus = null;
  const threshold = 360;

  function closeDialog() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
    document.body.classList.remove('lb-text-dialog-open');
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }

  function openDialog(source) {
    if (!source?.textContent?.trim()) return;
    closeDialog();
    previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'lb-text-dialog';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Read full LinkBook post');

    const card = document.createElement('section');
    card.className = 'lb-text-dialog-card';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'lb-text-close';
    closeButton.textContent = '× Close';
    closeButton.addEventListener('click', closeDialog);
    const heading = document.createElement('h2');
    heading.textContent = 'Full post';
    const text = document.createElement('div');
    text.className = 'lb-text-dialog-body';
    text.textContent = source.textContent;
    card.append(closeButton, heading, text);
    backdrop.append(card);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeDialog(); });
    document.body.append(backdrop);
    document.body.classList.add('lb-text-dialog-open');
    dialog = backdrop;
    closeButton.focus();
  }

  function attach() {
    document.querySelectorAll('.post .post-body').forEach(body => {
      if (seen.has(body) || !body.textContent?.trim()) return;
      seen.add(body);
      const isLong = body.textContent.length > threshold;
      if (isLong) body.classList.add('lb-post-text-collapsed');
      const controls = document.createElement('div');
      controls.className = 'lb-text-actions';
      if (isLong) {
        const readMore = document.createElement('button');
        readMore.type = 'button';
        readMore.textContent = 'Read more';
        readMore.setAttribute('aria-expanded', 'false');
        readMore.addEventListener('click', () => {
          const collapsed = body.classList.toggle('lb-post-text-collapsed');
          readMore.textContent = collapsed ? 'Read more' : 'Show less';
          readMore.setAttribute('aria-expanded', String(!collapsed));
        });
        controls.append(readMore);
      }
      const expand = document.createElement('button');
      expand.type = 'button';
      expand.textContent = '⛶ Expand text';
      expand.setAttribute('aria-label', 'Read post text in expanded view');
      expand.addEventListener('click', () => openDialog(body));
      controls.append(expand);
      body.insertAdjacentElement('afterend', controls);
    });
  }

  document.addEventListener('keydown', e => {
    if (!dialog) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
    if (e.key === 'Tab') { e.preventDefault(); dialog.querySelector('button')?.focus(); }
  });

  function init() {
    attach();
    const root = document.getElementById('content') || document.body;
    new MutationObserver(attach).observe(root, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
