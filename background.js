chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

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