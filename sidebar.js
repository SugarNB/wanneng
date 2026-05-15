const DEFAULT_AI_LIST = [
  { name: 'DeepSeek', url: 'https://chat.deepseek.com', icon: '🔮' },
  { name: 'Claude', url: 'https://claude.ai', icon: '🤖' },
  { name: 'Kimi', url: 'https://kimi.moonshot.cn', icon: '🌙' },
  { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '💬' },
  { name: 'Gemini', url: 'https://gemini.google.com', icon: '✨' },
  { name: '通义千问', url: 'https://tongyi.aliyun.com', icon: '🎯' },
  { name: '豆包', url: 'https://www.doubao.com', icon: '🫘' },
  { name: '文心一言', url: 'https://yiyan.baidu.com', icon: '📝' },
  { name: '智谱清言', url: 'https://chatglm.cn', icon: '🧠' },
  { name: '讯飞星火', url: 'https://xinghuo.xfyun.cn', icon: '🔥' },
  { name: '腾讯元宝', url: 'https://yuanbao.tencent.com', icon: '💎' },
  { name: 'Poe', url: 'https://poe.com', icon: '🌐' }
];

let state = {
  aiList: [],
  settings: {
    defaultHome: 'https://chat.deepseek.com',
    theme: 'light'
  },
  zoomLevel: 100,
  isFullscreen: false,
  webDarkMode: false,
  history: [],
  historyIndex: -1,
  tabs: [],
  activeTabIndex: 0
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- Tab iframe management ---

function getActiveIframe() {
  const tab = getActiveTab();
  if (!tab) return null;
  return document.getElementById('iframe_' + tab.id);
}

function createIframeForTab(tab) {
  const container = $('#webview');
  const iframe = document.createElement('iframe');
  iframe.id = 'iframe_' + tab.id;
  iframe.className = 'webview-frame hidden';
  iframe.src = tab.url || state.settings.defaultHome;
  container.appendChild(iframe);

  // Monitor iframe src changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
        const newSrc = iframe.src;
        if (newSrc && newSrc !== 'about:blank' && !newSrc.startsWith('about:')) {
          const tabData = state.tabs.find(t => t.id === tab.id);
          if (tabData && tabData.url !== newSrc) {
            tabData.url = newSrc;
            if (tabData === getActiveTab()) {
              $('#urlInput').value = newSrc;
            }
            renderTabs();
            saveTabsState();
          }
        }
      }
    });
  });

  observer.observe(iframe, { attributes: true, attributeFilter: ['src'] });

  return iframe;
}

function showIframe(tabId) {
  const container = $('#webview');
  container.querySelectorAll('iframe').forEach(f => f.classList.add('hidden'));
  const iframe = document.getElementById('iframe_' + tabId);
  if (iframe) iframe.classList.remove('hidden');
}

function removeIframe(tabId) {
  const iframe = document.getElementById('iframe_' + tabId);
  if (iframe) iframe.remove();
}

// --- Init ---

async function init() {
  await loadState();
  applyTheme();
  setupEventListeners();

  // No tabs? Create default
  if (state.tabs.length === 0) {
    createTabData(state.settings.defaultHome, extractDomain(state.settings.defaultHome));
    state.activeTabIndex = 0;
  }

  // Only create iframe for the active tab (lazy load others)
  const activeTab = getActiveTab();
  if (activeTab && !document.getElementById('iframe_' + activeTab.id)) {
    createIframeForTab(activeTab);
  }

  if (activeTab) {
    state.history = activeTab.history;
    state.historyIndex = activeTab.historyIndex;
    showIframe(activeTab.id);
    setupIframeLoadHandler(activeTab.id);
  }

  renderAiList();
  renderTabs();

  if (state.isFullscreen) {
    document.body.classList.add('fullscreen');
    $('#exitFullscreen').classList.remove('hidden');
  }

  $('#urlInput').value = activeTab?.url || state.settings.defaultHome;
  updateNavButtons();
  saveTabsState();

  chrome.storage.local.remove('panelState');
}

async function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['aiList', 'settings', 'zoomLevel', 'webDarkMode', 'isFullscreen', 'tabs', 'activeTabIndex'],
      (result) => {
        state.aiList = result.aiList || DEFAULT_AI_LIST;
        state.settings = { ...state.settings, ...result.settings };
        state.zoomLevel = result.zoomLevel || 100;
        state.webDarkMode = result.webDarkMode || false;
        state.isFullscreen = result.isFullscreen || false;

        // Restore and validate tabs
        state.tabs = Array.isArray(result.tabs) ? result.tabs : [];

        // Fix each tab's data integrity
        state.tabs = state.tabs.filter(tab => tab && tab.id).map(tab => ({
          id: tab.id,
          title: tab.title || extractDomain(tab.url || state.settings.defaultHome),
          url: tab.url || state.settings.defaultHome,
          history: Array.isArray(tab.history) && tab.history.length > 0 ? tab.history : [tab.url || state.settings.defaultHome],
          historyIndex: typeof tab.historyIndex === 'number' ? Math.min(tab.historyIndex, (tab.history || []).length - 1) : 0,
          scrollTop: tab.scrollTop || 0
        }));

        // Validate activeTabIndex
        const savedIndex = typeof result.activeTabIndex === 'number' ? result.activeTabIndex : 0;
        state.activeTabIndex = state.tabs.length > 0
          ? Math.min(savedIndex, state.tabs.length - 1)
          : 0;

        resolve();
      }
    );
  });
}

function saveState() {
  chrome.storage.local.set({
    aiList: state.aiList,
    settings: state.settings,
    zoomLevel: state.zoomLevel,
    webDarkMode: state.webDarkMode
  });
}

function savePanelState() {
  saveCurrentTabState();

  chrome.storage.local.set({
    tabs: state.tabs,
    activeTabIndex: state.activeTabIndex,
    isFullscreen: state.isFullscreen
  });
}

// --- Tab data management ---

function createTabData(url, title) {
  const tab = {
    id: 'tab_' + generateId(),
    title: title || extractDomain(url),
    url: url,
    history: [url],
    historyIndex: 0,
    scrollTop: 0
  };
  state.tabs.push(tab);
  return tab;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.substring(0, 20);
  }
}

function getActiveTab() {
  return state.tabs[state.activeTabIndex] || null;
}

function saveCurrentTabState() {
  const tab = getActiveTab();
  if (!tab) return;
  const iframe = getActiveIframe();

  if (iframe) {
    try {
      const iframeUrl = iframe.contentWindow?.location?.href;
      if (iframeUrl && iframeUrl !== 'about:blank' && !iframeUrl.startsWith('about:')) {
        tab.url = iframeUrl;
      }
    } catch (e) {
      tab.url = state.history[state.historyIndex] || tab.url;
    }
  }

  if (!tab.url || tab.url === 'about:blank') {
    tab.url = state.history[state.historyIndex] || tab.url;
  }

  tab.history = [...state.history];
  tab.historyIndex = state.historyIndex;

  if (iframe) {
    try {
      tab.scrollTop = iframe.contentDocument?.documentElement?.scrollTop || 0;
    } catch (e) {}
  }
}

function switchToTab(index) {
  if (index < 0 || index >= state.tabs.length || index === state.activeTabIndex) return;

  saveCurrentTabState();

  state.activeTabIndex = index;
  const tab = getActiveTab();
  state.history = tab.history;
  state.historyIndex = tab.historyIndex;

  // Create iframe if it doesn't exist yet (lazy loading)
  if (!document.getElementById('iframe_' + tab.id)) {
    createIframeForTab(tab);
  }

  showIframe(tab.id);
  setupIframeLoadHandler(tab.id);

  $('#urlInput').value = tab.url;
  applyWebDarkMode();
  applyZoom();
  renderTabs();
  updateNavButtons();
  saveTabsState();
}

function closeTab(index) {
  const closedTab = state.tabs[index];

  if (state.tabs.length <= 1) {
    // Last tab: reset to default home
    closedTab.url = state.settings.defaultHome;
    closedTab.history = [state.settings.defaultHome];
    closedTab.historyIndex = 0;
    state.history = closedTab.history;
    state.historyIndex = 0;

    // Remove old iframe and create new one
    removeIframe(closedTab.id);
    createIframeForTab(closedTab);
    showIframe(closedTab.id);
    setupIframeLoadHandler(closedTab.id);
    $('#urlInput').value = state.settings.defaultHome;
    renderTabs();
    saveTabsState();
    return;
  }

  // Remove iframe
  removeIframe(closedTab.id);
  state.tabs.splice(index, 1);

  if (index < state.activeTabIndex) {
    state.activeTabIndex--;
  } else if (index === state.activeTabIndex) {
    state.activeTabIndex = Math.min(state.activeTabIndex, state.tabs.length - 1);
    const tab = getActiveTab();
    state.history = tab.history;
    state.historyIndex = tab.historyIndex;
    showIframe(tab.id);
    setupIframeLoadHandler(tab.id);
    $('#urlInput').value = tab.url;
    applyWebDarkMode();
    applyZoom();
  }

  renderTabs();
  updateNavButtons();
  saveTabsState();
}

function openInNewTab(url, title) {
  saveCurrentTabState();

  // Normalize URL
  if (!url || url === 'about:blank') {
    url = state.settings.defaultHome || 'https://chat.deepseek.com';
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.includes('.') && !url.includes(' ')) {
      url = 'https://' + url;
    } else {
      url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }
  }

  const tab = createTabData(url, title || extractDomain(url));
  createIframeForTab(tab);

  state.activeTabIndex = state.tabs.length - 1;
  state.history = tab.history;
  state.historyIndex = 0;

  showIframe(tab.id);
  setupIframeLoadHandler(tab.id);
  $('#urlInput').value = url;
  applyWebDarkMode();
  applyZoom();
  renderTabs();
  updateNavButtons();
  saveTabsState();
}

// --- Iframe load handler ---

function setupIframeLoadHandler(tabId) {
  const iframe = document.getElementById('iframe_' + tabId);
  if (!iframe) return;

  const loading = $('#loading');

  iframe.onload = () => {
    loading.classList.add('hidden');
    applyWebDarkMode();

    // Try to get the actual URL from the iframe
    try {
      const iframeUrl = iframe.contentWindow?.location?.href;
      if (iframeUrl && iframeUrl !== 'about:blank' && !iframeUrl.startsWith('about:')) {
        const tab = state.tabs.find(t => t.id === tabId);
        if (tab) {
          tab.url = iframeUrl;
          // Try to get page title
          const iframeTitle = iframe.contentDocument?.title;
          if (iframeTitle) {
            tab.title = iframeTitle;
          }
          // Update URL input if this is the active tab
          if (tab === getActiveTab()) {
            $('#urlInput').value = iframeUrl;
          }
          renderTabs();
        }
      }
    } catch (e) {
      // Cross-origin restriction - can't access iframe URL
      // The URL will be updated via postMessage from content.js
    }

    saveCurrentTabState();
    saveTabsState();
  };

  iframe.onerror = () => {
    loading.classList.add('hidden');
    showToast('页面加载失败');
  };
}

// --- Navigation ---

function navigateTo(url, fromHistory) {
  if (!url || url === 'about:blank') {
    url = state.settings.defaultHome || 'https://chat.deepseek.com';
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.includes('.') && !url.includes(' ')) {
      url = 'https://' + url;
    } else {
      url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }
  }

  const activeTab = getActiveTab();
  if (!activeTab) return;

  let iframe = getActiveIframe();

  // Create iframe if it doesn't exist
  if (!iframe) {
    createIframeForTab(activeTab);
    iframe = getActiveIframe();
  }

  if (!iframe) return;

  // Already at this URL
  if (iframe.src === url && iframe.contentDocument?.readyState === 'complete') {
    $('#urlInput').value = url;
    applyWebDarkMode();
    return;
  }

  if (!fromHistory) {
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(url);
    state.historyIndex = state.history.length - 1;
  }

  $('#loading').classList.remove('hidden');

  activeTab.url = url;

  setupIframeLoadHandler(activeTab.id);
  iframe.src = url;

  $('#urlInput').value = url;

  if (!fromHistory) {
    const domain = extractDomain(url);
    if (!activeTab.title || activeTab.title === extractDomain(activeTab.url) || activeTab.title === activeTab.url) {
      activeTab.title = domain;
    }
    renderTabs();
  }

  updateNavButtons();
}

function goBack() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  navigateTo(state.history[state.historyIndex], true);
  saveCurrentTabState();
  saveTabsState();
}

function goForward() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  navigateTo(state.history[state.historyIndex], true);
  saveCurrentTabState();
  saveTabsState();
}

function refreshPage() {
  const iframe = getActiveIframe();
  const url = state.history[state.historyIndex];
  if (iframe && url) {
    iframe.src = 'about:blank';
    requestAnimationFrame(() => {
      iframe.src = url;
    });
  }
}

function updateNavButtons() {
  $('#goBack').classList.toggle('disabled', state.historyIndex <= 0);
  $('#goForward').classList.toggle('disabled', state.historyIndex >= state.history.length - 1);
}

// --- Tab bar UI ---

function renderTabs() {
  const tabBar = $('#tabBar');
  if (!tabBar) return;
  tabBar.innerHTML = state.tabs.map((tab, index) => `
    <div class="tab-item ${index === state.activeTabIndex ? 'active' : ''}" data-index="${index}">
      <span class="tab-title">${escapeHtml(tab.title)}</span>
      <button class="tab-close" data-index="${index}" title="关闭标签页">&times;</button>
    </div>
  `).join('') + '<button id="newTabBtn" class="tab-add" title="新建标签页">+</button>';

  tabBar.querySelectorAll('.tab-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        switchToTab(parseInt(el.dataset.index));
      }
    });
  });

  tabBar.querySelectorAll('.tab-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(parseInt(btn.dataset.index));
    });
  });

  const newTabBtn = tabBar.querySelector('#newTabBtn');
  if (newTabBtn) {
    newTabBtn.addEventListener('click', () => {
      openInNewTab(state.settings.defaultHome);
    });
  }
}

function saveTabsState() {
  chrome.storage.local.set({
    tabs: state.tabs,
    activeTabIndex: state.activeTabIndex
  });
}

// --- Theme & UI ---

function applyTheme() {
  const theme = state.settings.theme || 'light';
  let resolved = theme;
  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = resolved === 'dark' ? 'dark' : '';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function renderAiList() {
  const aiList = $('#aiList');
  aiList.innerHTML = state.aiList.map((ai, index) => `
    <div class="ai-item" data-index="${index}">
      <span class="ai-item-icon">${ai.icon}</span>
      <span class="ai-item-name">${escapeHtml(ai.name)}</span>
      <button class="ai-item-delete" data-index="${index}">×</button>
    </div>
  `).join('');

  aiList.querySelectorAll('.ai-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('ai-item-delete')) {
        const index = parseInt(el.dataset.index);
        const ai = state.aiList[index];
        openInNewTab(ai.url, ai.name);
        $('#aiSidebar').classList.remove('open');
        updateBackdrop();
      }
    });
  });

  aiList.querySelectorAll('.ai-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      state.aiList.splice(index, 1);
      saveState();
      renderAiList();
    });
  });
}

let viewerFullContent = '';
const VIEWER_MAX_CHARS = 500000;

function showContentInViewer(title, content) {
  viewerFullContent = content;
  const len = content.length;
  const kb = (len / 1024).toFixed(1);
  const tokens = Math.round(len / 4);

  let displayTitle = `${title} · ${kb} KB · ${len.toLocaleString()} 字符 · ~${tokens.toLocaleString()} tokens`;
  let displayContent = content;

  if (len > VIEWER_MAX_CHARS) {
    const shown = (VIEWER_MAX_CHARS / 1024).toFixed(0);
    displayTitle += ` · 仅显示前 ${shown} KB`;
    displayContent = content.substring(0, VIEWER_MAX_CHARS)
      + `\n\n... [已截断，共 ${len.toLocaleString()} 字符，完整内容请下载查看] ...`;
  }

  $('#contentViewer h3').textContent = displayTitle;
  $('#contentText').textContent = displayContent;
  $('#contentViewer').classList.remove('hidden');
}

function applyWebDarkMode() {
  const iframe = getActiveIframe();
  if (iframe) {
    if (state.webDarkMode) {
      iframe.style.filter = 'invert(1) hue-rotate(180deg)';
    } else {
      iframe.style.filter = '';
    }
  }
  $('#webDarkMode')?.classList.toggle('active', state.webDarkMode);
}

function updateBackdrop() {
  const sidebarOpen = $('#aiSidebar').classList.contains('open');
  const settingsOpen = !$('#settingsPanel').classList.contains('hidden');
  $('#panelBackdrop').classList.toggle('hidden', !sidebarOpen && !settingsOpen);
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupEventListeners() {
  $('#urlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      navigateTo(e.target.value);
      e.target.blur();
    }
  });

  $('#urlInput').addEventListener('focus', () => {
    $('#urlInput').select();
  });

  $('#goBack').addEventListener('click', goBack);
  $('#goForward').addEventListener('click', goForward);
  $('#refresh').addEventListener('click', refreshPage);

  $('#zoomIn').addEventListener('click', () => {
    if (state.zoomLevel < 200) {
      state.zoomLevel += 10;
      applyZoom();
    }
  });

  $('#zoomOut').addEventListener('click', () => {
    if (state.zoomLevel > 50) {
      state.zoomLevel -= 10;
      applyZoom();
    }
  });

  $('#fullscreen').addEventListener('click', toggleFullscreen);
  $('#exitFullscreen').addEventListener('click', toggleFullscreen);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isFullscreen) {
      toggleFullscreen();
    }
  });

  $('#extractContent').addEventListener('click', extractPageContent);
  $('#areaCapture').addEventListener('click', startAreaCapture);
  $('#viewSource').addEventListener('click', viewPageSource);

  $('#webDarkMode').addEventListener('click', () => {
    state.webDarkMode = !state.webDarkMode;
    saveState();
    applyWebDarkMode();
  });

  $('#settingsBtn').addEventListener('click', () => {
    $('#settingsPanel').classList.toggle('hidden');
    updateBackdrop();
    $('#themeMode').value = state.settings.theme || 'light';
    $('#defaultHome').value = state.settings.defaultHome;
  });

  $('#closeSettings').addEventListener('click', () => {
    $('#settingsPanel').classList.add('hidden');
    updateBackdrop();
  });

  $('#saveSettings').addEventListener('click', () => {
    state.settings.theme = $('#themeMode').value;
    state.settings.defaultHome = $('#defaultHome').value;
    saveState();
    applyTheme();
    $('#settingsPanel').classList.add('hidden');
    showToast('设置已保存');
  });

  $('#sidebarToggle').addEventListener('click', () => {
    $('#aiSidebar').classList.toggle('open');
    updateBackdrop();
  });

  $('#closeAiSidebar').addEventListener('click', () => {
    $('#aiSidebar').classList.remove('open');
    updateBackdrop();
  });

  $('#panelBackdrop').addEventListener('click', () => {
    $('#aiSidebar').classList.remove('open');
    $('#settingsPanel').classList.add('hidden');
    updateBackdrop();
  });

  $('#addCustomAi').addEventListener('click', () => {
    $('#addAiModal').classList.remove('hidden');
  });

  $('#cancelAddAi').addEventListener('click', () => {
    $('#addAiModal').classList.add('hidden');
  });

  $('#confirmAddAi').addEventListener('click', () => {
    const name = $('#aiName').value.trim();
    const url = $('#aiUrl').value.trim();
    const icon = $('#aiIcon').value.trim() || '🌐';

    if (name && url) {
      state.aiList.push({ name, url, icon });
      saveState();
      renderAiList();
      $('#addAiModal').classList.add('hidden');
      $('#aiName').value = '';
      $('#aiUrl').value = '';
      $('#aiIcon').value = '';
      showToast('AI已添加');
    }
  });

  $('#copyContent').addEventListener('click', () => {
    navigator.clipboard.writeText(viewerFullContent).then(() => {
      showToast('已复制到剪贴板');
    });
  });

  $('#downloadContent').addEventListener('click', () => {
    if (!viewerFullContent) return;
    const blob = new Blob([viewerFullContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `page-source-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('#closeContentViewer').addEventListener('click', () => {
    $('#contentViewer').classList.add('hidden');
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.action === 'urlChanged' && e.data.url) {
      const tab = getActiveTab();
      if (tab) {
        // Update tab URL
        tab.url = e.data.url;

        // Update tab title if provided
        if (e.data.title && e.data.title !== '') {
          tab.title = e.data.title;
        }

        // Update history if this is a new URL
        if (tab.history[tab.historyIndex] !== e.data.url) {
          tab.history = tab.history.slice(0, tab.historyIndex + 1);
          tab.history.push(e.data.url);
          tab.historyIndex = tab.history.length - 1;
          state.history = tab.history;
          state.historyIndex = tab.historyIndex;
        }

        // Update URL input
        $('#urlInput').value = e.data.url;

        // Update UI
        renderTabs();
        updateNavButtons();
        saveTabsState();
      }
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'system') {
      applyTheme();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      savePanelState();
    }
  });

  window.addEventListener('beforeunload', () => {
    savePanelState();
  });

  window.addEventListener('pagehide', () => {
    savePanelState();
  });

  // Periodic save to ensure state is persisted
  setInterval(() => {
    saveCurrentTabState();
    saveTabsState();
  }, 10000);

  // Periodic check for iframe URL changes
  setInterval(() => {
    const tab = getActiveTab();
    if (!tab) return;
    const iframe = getActiveIframe();
    if (!iframe) return;

    try {
      const iframeUrl = iframe.contentWindow?.location?.href;
      if (iframeUrl && iframeUrl !== 'about:blank' && !iframeUrl.startsWith('about:') && iframeUrl !== tab.url) {
        tab.url = iframeUrl;
        const iframeTitle = iframe.contentDocument?.title;
        if (iframeTitle) {
          tab.title = iframeTitle;
        }
        $('#urlInput').value = iframeUrl;
        renderTabs();
        saveTabsState();
      }
    } catch (e) {
      // Cross-origin - can't access iframe URL
    }
  }, 2000);
}

function applyZoom() {
  const iframe = getActiveIframe();
  if (iframe) {
    iframe.style.transform = `scale(${state.zoomLevel / 100})`;
    iframe.style.transformOrigin = 'top left';
    iframe.style.width = `${10000 / state.zoomLevel}%`;
    iframe.style.height = `${10000 / state.zoomLevel}%`;
  }
  $('#zoomLevel').textContent = `${state.zoomLevel}%`;
  saveState();
}

function toggleFullscreen() {
  state.isFullscreen = !state.isFullscreen;
  document.body.classList.toggle('fullscreen', state.isFullscreen);
  $('#exitFullscreen').classList.toggle('hidden', !state.isFullscreen);
  savePanelState();
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css']
    });
  }
}

async function extractPageContent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });

    if (response?.content) {
      showContentInViewer('网页内容', response.content);
    }
  } catch (e) {
    showToast('无法提取页面内容');
  }
}

async function startAreaCapture() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { action: 'startAreaCapture' });
    showToast('请在页面上拖拽选择截屏区域');
  } catch (e) {
    showToast('无法启动截屏功能');
  }
}

async function viewPageSource() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageSource' });

    if (response?.html) {
      showContentInViewer('网页源码', response.html);
    }
  } catch (e) {
    showToast('无法获取网页源码');
  }
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'restoreState') {
    sendResponse({ state });
  }

  // Handle iframe navigation events from background script
  if (request.action === 'iframeNavigation') {
    const tab = getActiveTab();
    if (tab && request.url) {
      // Check if this URL change is for the current tab's iframe
      const iframe = getActiveIframe();
      if (iframe) {
        try {
          // Try to verify this is the same iframe
          const iframeUrl = iframe.contentWindow?.location?.href;
          if (iframeUrl === request.url) {
            tab.url = request.url;
            $('#urlInput').value = request.url;
            renderTabs();
            saveTabsState();
          }
        } catch (e) {
          // Cross-origin - update anyway
          tab.url = request.url;
          $('#urlInput').value = request.url;
          renderTabs();
          saveTabsState();
        }
      }
    }
  }
});

init();
