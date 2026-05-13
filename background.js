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