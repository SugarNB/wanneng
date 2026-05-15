chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ pong: true });
  }

  if (request.action === 'extractContent') {
    const content = extractPageContent();
    sendResponse({ content });
  }

  if (request.action === 'startAreaCapture') {
    startAreaCapture();
    sendResponse({ success: true });
  }

  if (request.action === 'getPageSource') {
    sendResponse({ html: document.documentElement.outerHTML });
  }

  if (request.action === 'getCurrentUrl') {
    sendResponse({ url: window.location.href, title: document.title });
  }
});

// --- URL Change Detection ---
// Only run in iframes (not the main page)
if (window !== window.top) {
  let lastUrl = '';
  let lastTitle = '';

  function notifyUrlChange() {
    const currentUrl = window.location.href;
    const currentTitle = document.title || '';

    // Skip if URL is empty, about:blank, or hasn't changed
    if (!currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('about:')) {
      return;
    }

    if (currentUrl !== lastUrl || currentTitle !== lastTitle) {
      lastUrl = currentUrl;
      lastTitle = currentTitle;

      // Notify parent (sidebar) via postMessage
      try {
        window.parent.postMessage({
          action: 'urlChanged',
          url: currentUrl,
          title: currentTitle
        }, '*');
      } catch (e) {
        // May fail if parent is different origin
      }
    }
  }

  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', notifyUrlChange);

  // Listen for pushstate/replacestate (SPA navigation)
  try {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function() {
      originalPushState.apply(this, arguments);
      setTimeout(notifyUrlChange, 100);
    };

    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      setTimeout(notifyUrlChange, 100);
    };
  } catch (e) {
    // Some pages may block this
  }

  // Periodic check as fallback
  setInterval(notifyUrlChange, 1000);

  // Check on page load
  window.addEventListener('load', () => {
    setTimeout(notifyUrlChange, 500);
  });

  // Check on DOMContentLoaded
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(notifyUrlChange, 100);
  });

  // Initial notification
  setTimeout(notifyUrlChange, 200);
}

function extractPageContent() {
  const article = document.querySelector('article') ||
                  document.querySelector('[role="main"]') ||
                  document.querySelector('main') ||
                  document.querySelector('.content') ||
                  document.querySelector('#content') ||
                  document.body;

  const clone = article.cloneNode(true);

  clone.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript').forEach(el => el.remove());

  return nodeToMarkdown(clone).replace(/\n{3,}/g, '\n\n').trim();
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/\s+/g, ' ');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  const hidden = node.style?.display === 'none' || node.style?.visibility === 'hidden';
  if (hidden) return '';

  // Headings
  if (/^h[1-6]$/.test(tag)) {
    const level = parseInt(tag[1]);
    const text = collectInlineText(node).trim();
    return text ? '\n' + '#'.repeat(level) + ' ' + text + '\n' : '';
  }

  // Paragraph / block elements
  if (['p', 'div', 'section', 'article', 'blockquote', 'figcaption'].includes(tag)) {
    const inner = childrenToMarkdown(node).trim();
    if (tag === 'blockquote' && inner) {
      return '\n> ' + inner.split('\n').join('\n> ') + '\n';
    }
    return inner ? '\n' + inner + '\n' : '';
  }

  // Lists
  if (tag === 'ul' || tag === 'ol') {
    let index = 0;
    const items = Array.from(node.children).filter(c => c.tagName?.toLowerCase() === 'li').map(li => {
      index++;
      const bullet = tag === 'ol' ? `${index}. ` : '- ';
      const text = childrenToMarkdown(li).trim();
      return bullet + text;
    });
    return items.length ? '\n' + items.join('\n') + '\n' : '';
  }

  if (tag === 'li') {
    return childrenToMarkdown(node);
  }

  // Links
  if (tag === 'a') {
    const href = node.getAttribute('href');
    const text = collectInlineText(node).trim();
    if (!text) return '';
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      return `[${text}](${href})`;
    }
    return text;
  }

  // Images
  if (tag === 'img') {
    const alt = node.getAttribute('alt') || '';
    const src = node.getAttribute('src') || '';
    return src ? `![${alt}](${src})` : '';
  }

  // Code
  if (tag === 'code') {
    const text = node.textContent.trim();
    if (node.parentElement?.tagName?.toLowerCase() === 'pre') return text;
    return text ? '`' + text + '`' : '';
  }

  if (tag === 'pre') {
    const code = node.querySelector('code');
    const text = (code || node).textContent.trim();
    return text ? '\n```\n' + text + '\n```\n' : '';
  }

  // Line break
  if (tag === 'br') return '\n';

  // Horizontal rule
  if (tag === 'hr') return '\n---\n';

  // Table (basic)
  if (tag === 'table') {
    return '\n' + tableToMarkdown(node) + '\n';
  }

  // Inline elements — collect text
  if (['span', 'strong', 'b', 'em', 'i', 'mark', 'small', 'del', 'ins', 'sub', 'sup', 'abbr', 'label'].includes(tag)) {
    let text = collectInlineText(node).trim();
    if (!text) return '';
    if (tag === 'strong' || tag === 'b') return '**' + text + '**';
    if (tag === 'em' || tag === 'i') return '*' + text + '*';
    if (tag === 'del') return '~~' + text + '~~';
    if (tag === 'mark') return '==' + text + '==';
    return text;
  }

  // Default: recurse into children
  return childrenToMarkdown(node);
}

function childrenToMarkdown(parent) {
  return Array.from(parent.childNodes).map(child => nodeToMarkdown(child)).join('');
}

function collectInlineText(el) {
  return Array.from(el.childNodes).map(child => {
    if (child.nodeType === Node.TEXT_NODE) return child.textContent.replace(/\s+/g, ' ');
    if (child.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = child.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    const inner = collectInlineText(child);
    if (tag === 'strong' || tag === 'b') return '**' + inner + '**';
    if (tag === 'em' || tag === 'i') return '*' + inner + '*';
    if (tag === 'code') return '`' + inner + '`';
    if (tag === 'a') {
      const href = child.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) return `[${inner}](${href})`;
    }
    return inner;
  }).join('');
}

function tableToMarkdown(table) {
  const rows = [];
  const trs = table.querySelectorAll('tr');
  trs.forEach((tr, i) => {
    const cells = Array.from(tr.querySelectorAll('th, td')).map(cell =>
      cell.textContent.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')
    );
    rows.push('| ' + cells.join(' | ') + ' |');
    if (i === 0) {
      rows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
    }
  });
  return rows.join('\n');
}

function showContentToast(message) {
  const existing = document.querySelector('.content-screenshot-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'content-screenshot-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 2147483647;
    pointer-events: none;
    animation: contentToastFade 2.5s ease forwards;
  `;

  if (!document.querySelector('#content-toast-style')) {
    const style = document.createElement('style');
    style.id = 'content-toast-style';
    style.textContent = `
      @keyframes contentToastFade {
        0% { opacity: 0; transform: translateX(-50%) translateY(16px); }
        15% { opacity: 1; transform: translateX(-50%) translateY(0); }
        75% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function startAreaCapture() {
  document.querySelectorAll('#screenshot-overlay, #screenshot-selection').forEach(el => el.remove());

  const overlay = document.createElement('div');
  overlay.id = 'screenshot-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    cursor: crosshair;
    z-index: 2147483647;
  `;

  const selection = document.createElement('div');
  selection.id = 'screenshot-selection';
  selection.style.cssText = `
    position: fixed;
    border: 2px dashed #fff;
    background: rgba(255, 255, 255, 0.1);
    display: none;
    z-index: 2147483647;
    pointer-events: none;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(selection);

  let startX, startY, isDrawing = false;

  function cleanup() {
    overlay.remove();
    selection.remove();
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0';
    selection.style.height = '0';
    selection.style.display = 'block';
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!isDrawing) return;

    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const width = Math.abs(e.clientX - startX);
    const height = Math.abs(e.clientY - startY);

    selection.style.left = x + 'px';
    selection.style.top = y + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;

    const rect = selection.getBoundingClientRect();
    cleanup();

    if (rect.width > 10 && rect.height > 10) {
      captureArea(rect);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
    }
  }

  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('keydown', onKeyDown, true);
}

function captureArea(rect) {
  chrome.runtime.sendMessage({
    action: 'captureVisibleTab'
  }, (response) => {
    if (response?.dataUrl) {
      cropImage(response.dataUrl, rect);
    }
  });
}

function cropImage(dataUrl, rect) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = window.devicePixelRatio || 1;

    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      img,
      rect.left * scale,
      rect.top * scale,
      rect.width * scale,
      rect.height * scale,
      0,
      0,
      rect.width * scale,
      rect.height * scale
    );

    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        showContentToast('已复制到剪贴板');
      } catch (e) {
        const link = document.createElement('a');
        link.download = `screenshot-${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        showContentToast('已保存为图片');
      }
    }, 'image/png');
  };
  img.src = dataUrl;
}

// --- Draft Auto-Save ---
let draftKey = null;
let draftDebounceTimer = null;

const DRAFT_SAVE_DELAY = 1000;
const DRAFT_MAX_LENGTH = 50000;

async function initDraftSystem() {
  const result = await chrome.storage.local.get('currentTabId');
  draftKey = result.currentTabId
    ? `draft_${result.currentTabId}`
    : `draft_${window.location.href}`;

  restoreDraft();
  setupDraftListeners();
}

function setupDraftListeners() {
  document.addEventListener('input', onDraftInput, true);
  observeSendActions();
}

function onDraftInput(e) {
  const target = e.target;
  if (!isDraftableElement(target)) return;

  clearTimeout(draftDebounceTimer);
  draftDebounceTimer = setTimeout(() => {
    saveDraft(target);
  }, DRAFT_SAVE_DELAY);
}

function isDraftableElement(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute('role') === 'textbox') return true;
  if (el.tagName === 'INPUT' && el.type === 'text' && el.offsetHeight > 50) return true;
  return false;
}

function getDraftContent(el) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    return el.value;
  }
  if (el.isContentEditable) {
    return el.innerText;
  }
  return '';
}

function setDraftContent(el, content) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    el.value = content;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (el.isContentEditable) {
    el.innerText = content;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function saveDraft(el) {
  const content = getDraftContent(el);
  if (!content || content.length > DRAFT_MAX_LENGTH) return;

  chrome.storage.local.set({
    [draftKey]: {
      content: content,
      timestamp: Date.now(),
      url: window.location.href
    }
  });
}

async function restoreDraft() {
  const result = await chrome.storage.local.get(draftKey);
  const draft = result[draftKey];
  if (!draft || !draft.content) return;

  if (Date.now() - draft.timestamp > 24 * 60 * 60 * 1000) {
    chrome.storage.local.remove(draftKey);
    return;
  }

  waitForDraftableElement((el) => {
    const currentContent = getDraftContent(el);
    if (!currentContent || currentContent.trim() === '') {
      setDraftContent(el, draft.content);
    }
  });
}

function waitForDraftableElement(callback, maxAttempts = 20) {
  let attempts = 0;

  function tryFind() {
    attempts++;
    const selectors = [
      'textarea',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '#prompt-textarea',
      '.chat-input',
      '[data-testid*="input"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && isDraftableElement(el)) {
        callback(el);
        return;
      }
    }

    if (attempts < maxAttempts) {
      setTimeout(tryFind, 500);
    }
  }

  setTimeout(tryFind, 1000);
}

function observeSendActions() {
  document.addEventListener('submit', clearCurrentDraft, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && isDraftableElement(e.target)) {
      setTimeout(() => clearCurrentDraft(), 500);
    }
  }, true);

  document.addEventListener('click', (e) => {
    const target = e.target;
    const isSendButton = target.closest(
      'button[data-testid*="send"], ' +
      'button[aria-label*="Send"], ' +
      'button[aria-label*="send"], ' +
      'button[aria-label*="发送"], ' +
      '.send-button, ' +
      '[data-testid="send-button"]'
    );
    if (isSendButton) {
      setTimeout(() => clearCurrentDraft(), 500);
    }
  }, true);
}

function clearCurrentDraft() {
  if (draftKey) {
    chrome.storage.local.remove(draftKey);
  }
}

initDraftSystem();
