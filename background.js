chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── 字幕 URL 捕获（按 tabId 存储）────────────────────────────────────
const subtitleUrlMap = new Map(); // tabId → Set<url>

const SUBTITLE_PATTERNS = [
  /\.vtt(\?|$)/i, /\.srt(\?|$)/i, /\.ass(\?|$)/i,
  /timedtext/i, /aisubtitle/i, /cc_vtt/i,
  /subtitle(?!-settings)/i, /caption(?!-settings)/i,
  /api\.bilibili\.com.*subtitle/i,
  /bilibili\.com.*subtitle/i,
  /youtube\.com.*timedtext/i,
  /googlevideo\.com.*timedtext/i,
];

function isSubtitleUrl(url) {
  if (!url) return false;
  return SUBTITLE_PATTERNS.some(p => p.test(url));
}

// 使用 webRequest 捕获字幕请求
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isSubtitleUrl(details.url)) return;
    if (!subtitleUrlMap.has(details.tabId)) {
      subtitleUrlMap.set(details.tabId, new Set());
    }
    subtitleUrlMap.get(details.tabId).add(details.url);
  },
  { urls: ['<all_urls>'] }
);

// 标签页关闭时清理
chrome.tabs.onRemoved.addListener((tabId) => {
  subtitleUrlMap.delete(tabId);
});

// 标签页导航时清空旧字幕 URL
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    subtitleUrlMap.delete(tabId);
  }
});

// ── 标签页切换检测 ───────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab) {
      chrome.runtime.sendMessage({
        action: 'TAB_CHANGED',
        tabId: activeInfo.tabId,
        url: tab.url,
        title: tab.title
      }).catch(() => {});
    }
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    chrome.runtime.sendMessage({
      action: 'TAB_CHANGED',
      tabId: tabId,
      url: changeInfo.url,
      title: tab.title
    }).catch(() => {});
  }
});

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

  // ── 字幕 URL 获取（按 tabId 返回 webRequest 捕获的 URL）
  if (request.action === 'GET_SUBTITLE_URLS') {
    const tabId = request.tabId;
    const urls = tabId && subtitleUrlMap.has(tabId)
      ? [...subtitleUrlMap.get(tabId)]
      : [];
    sendResponse({ urls });
    return true;
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