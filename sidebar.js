const DEFAULT_AI_LIST = [
  { name: 'DeepSeek', url: 'https://chat.deepseek.com', icon: '🔮' },
  { name: 'Claude', url: 'https://claude.ai', icon: '🤖' },
  { name: 'Kimi', url: 'https://kimi.moonshot.cn', icon: '🌙' },
  { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '💬' },
  { name: 'Gemini', url: 'https://gemini.google.com', icon: '✨' },
  { name: '通义千问', url: 'https://tongyi.aliyun.com', icon: '🎯' },
  { name: '文心一言', url: 'https://yiyan.baidu.com', icon: '📝' }
];

let state = {
  aiList: [],
  settings: {
    linkOpenMode: 'inside',
    defaultHome: 'https://chat.deepseek.com',
    theme: 'light'
  },
  zoomLevel: 100,
  isFullscreen: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function init() {
  await loadState();
  applyTheme();
  renderAiList();
  setupEventListeners();

  navigateTo(state.settings.defaultHome);
}

async function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiList', 'settings', 'zoomLevel'], (result) => {
      state.aiList = result.aiList || DEFAULT_AI_LIST;
      state.settings = { ...state.settings, ...result.settings };
      state.zoomLevel = result.zoomLevel || 100;
      resolve();
    });
  });
}

function saveState() {
  chrome.storage.local.set({
    aiList: state.aiList,
    settings: state.settings,
    zoomLevel: state.zoomLevel
  });
}

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
        navigateTo(ai.url);
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

function navigateTo(url) {
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

  const webview = $('#webview');
  const loading = $('#loading');

  if (webview.src === url && webview.contentDocument?.readyState === 'complete') {
    $('#urlInput').value = url;
    return;
  }

  loading.classList.remove('hidden');

  webview.onload = () => {
    loading.classList.add('hidden');
  };

  webview.onerror = () => {
    loading.classList.add('hidden');
    showToast('页面加载失败');
  };

  webview.src = url;
  $('#urlInput').value = url;
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
  
  $('#goBack').addEventListener('click', () => {
    const webview = $('#webview');
    try { webview.contentWindow.history.back(); } catch (e) {}
  });
  
  $('#goForward').addEventListener('click', () => {
    const webview = $('#webview');
    try { webview.contentWindow.history.forward(); } catch (e) {}
  });
  
  $('#refresh').addEventListener('click', () => {
    const webview = $('#webview');
    try { webview.contentWindow.location.reload(); } catch (e) {
      navigateTo($('#urlInput').value);
    }
  });
  
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
  
  $('#settingsBtn').addEventListener('click', () => {
    $('#settingsPanel').classList.toggle('hidden');
    updateBackdrop();
    $('#themeMode').value = state.settings.theme || 'light';
    $('#linkOpenMode').value = state.settings.linkOpenMode;
    $('#defaultHome').value = state.settings.defaultHome;
  });

  $('#closeSettings').addEventListener('click', () => {
    $('#settingsPanel').classList.add('hidden');
    updateBackdrop();
  });
  
  $('#saveSettings').addEventListener('click', () => {
    state.settings.theme = $('#themeMode').value;
    state.settings.linkOpenMode = $('#linkOpenMode').value;
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
    const text = $('#contentText').textContent;
    navigator.clipboard.writeText(text).then(() => {
      showToast('内容已复制到剪贴板');
    });
  });
  
  $('#closeContentViewer').addEventListener('click', () => {
    $('#contentViewer').classList.add('hidden');
  });
  
  window.addEventListener('message', (e) => {
    if (e.data && e.data.action === 'linkClick') {
      const url = e.data.url;
      if (state.settings.linkOpenMode === 'inside') {
        navigateTo(url);
      } else {
        window.open(url, '_blank');
      }
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'system') {
      applyTheme();
    }
  });

}

function applyZoom() {
  const webview = $('#webview');
  webview.style.transform = `scale(${state.zoomLevel / 100})`;
  webview.style.transformOrigin = 'top left';
  webview.style.width = `${10000 / state.zoomLevel}%`;
  webview.style.height = `${10000 / state.zoomLevel}%`;
  $('#zoomLevel').textContent = `${state.zoomLevel}%`;
  saveState();
}

function toggleFullscreen() {
  state.isFullscreen = !state.isFullscreen;
  document.body.classList.toggle('fullscreen', state.isFullscreen);
  $('#exitFullscreen').classList.toggle('hidden', !state.isFullscreen);
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
      $('#contentText').textContent = response.content;
      $('#contentViewer').classList.remove('hidden');
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


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'restoreState') {
    sendResponse({ state });
  }
});

init();