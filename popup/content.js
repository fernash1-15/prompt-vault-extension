// Content script — injected into every page
// Listens for insert-prompt messages from the popup

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INSERT_PROMPT') {
    const text = message.text;
    const activeEl = document.activeElement;

    // Try focused element first
    if (activeEl && isEditable(activeEl)) {
      insertText(activeEl, text);
      sendResponse({ success: true, method: 'active-element' });
      return;
    }

    // Fall back: find first visible textarea or contenteditable
    const candidates = [
      ...document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')
    ].filter(el => isVisible(el));

    if (candidates.length > 0) {
      candidates[0].focus();
      insertText(candidates[0], text);
      sendResponse({ success: true, method: 'first-candidate' });
    } else {
      sendResponse({ success: false, error: 'No editable field found' });
    }
  }
});

function isEditable(el) {
  const tag = el.tagName.toLowerCase();
  const ce = el.getAttribute('contenteditable');
  return (
    tag === 'textarea' ||
    (tag === 'input' && ['text', 'search', 'url', 'email'].includes(el.type)) ||
    ce === 'true' ||
    ce === ''
  );
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function insertText(el, text) {
  el.focus();

  // ContentEditable (e.g. Claude, ChatGPT, Notion)
  if (el.getAttribute('contenteditable') !== null) {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.innerText += text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // Standard textarea / input
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.substring(0, start);
  const after = el.value.substring(end);
  el.value = before + text + after;
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
