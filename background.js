chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// --- MiMo Cookie Fix ---
// MiMo auth depends on: serviceToken, userId, xiaomichatbot_ph
// These cookies may have SameSite=Lax which blocks them in iframe context.
// Use cookies API to re-set them with SameSite=None; Secure after they're created.
const MIMO_DOMAINS = ['.xiaomimimo.com', '.mimo.com', 'xiaomimimo.com', 'mimo.com'];
const recentlyFixed = new Set();

function isMimoCookie(domain) {
  return MIMO_DOMAINS.some(d => domain === d || domain.endsWith(d));
}

function fixCookie(changeInfo) {
  const { cookie, removed } = changeInfo;
  if (removed) return;
  if (!cookie || !isMimoCookie(cookie.domain)) return;

  // Already has correct attributes — skip
  if (cookie.sameSite === 'no_restriction' && cookie.secure) return;

  // Skip if we just fixed this cookie (prevent infinite loop)
  const cookieKey = `${cookie.name}|${cookie.domain}|${cookie.path}`;
  if (recentlyFixed.has(cookieKey)) {
    recentlyFixed.delete(cookieKey);
    return;
  }

  // Re-set cookie with SameSite=None; Secure
  recentlyFixed.add(cookieKey);

  chrome.cookies.set({
    url: `https://${cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`,
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: true,
    httpOnly: cookie.httpOnly,
    sameSite: 'no_restriction',
    storeId: cookie.storeId,
    ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {})
  });
}

chrome.cookies.onChanged.addListener(fixCookie);

// On service worker startup, scan and fix existing MiMo cookies
chrome.cookies.getAll({}, (cookies) => {
  for (const cookie of cookies) {
    if (isMimoCookie(cookie.domain) && (cookie.sameSite !== 'no_restriction' || !cookie.secure)) {
      const cookieKey = `${cookie.name}|${cookie.domain}|${cookie.path}`;
      recentlyFixed.add(cookieKey);
      chrome.cookies.set({
        url: `https://${cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: true,
        httpOnly: cookie.httpOnly,
        sameSite: 'no_restriction',
        storeId: cookie.storeId,
        ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {})
      });
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureVisibleTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }

  if (request.action === 'getPageContent') {
    chrome.tabs.sendMessage(request.tabId, { action: 'extractContent' }, (response) => {
      sendResponse(response);
    });
    return true;
  }

  if (request.action === 'startAreaCapture') {
    chrome.tabs.sendMessage(request.tabId, { action: 'startAreaCapture' }, (response) => {
      sendResponse(response);
    });
    return true;
  }

  if (request.action === 'screenshotComplete') {
    chrome.runtime.sendMessage({
      action: 'screenshotComplete',
      dataUrl: request.dataUrl
    }).catch(() => {});
    return false;
  }
});

// Listen for web navigation events to detect iframe URL changes
chrome.webNavigation.onCompleted.addListener((details) => {
  // Only notify for sub-frames (iframes)
  if (details.frameId > 0) {
    // Try to send message to the side panel
    chrome.runtime.sendMessage({
      action: 'iframeNavigation',
      url: details.url,
      tabId: details.tabId,
      frameId: details.frameId
    }).catch(() => {
      // Side panel might not be open
    });
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  // Only notify for sub-frames (iframes)
  if (details.frameId > 0) {
    chrome.runtime.sendMessage({
      action: 'iframeNavigation',
      url: details.url,
      tabId: details.tabId,
      frameId: details.frameId
    }).catch(() => {
      // Side panel might not be open
    });
  }
});