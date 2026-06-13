// subtitle-main.js — 运行在 MAIN world，用于捕获字幕网络请求
// 在页面最早期注入，hook fetch 和 XHR 以记录字幕 URL

(function () {
  if (window.__subtitleHooked) return;
  window.__subtitleHooked = true;
  window.__capturedSubtitles = [];

  const SUBTITLE_PATTERNS = [
    /\.vtt(\?|$)/i,
    /\.srt(\?|$)/i,
    /\.ass(\?|$)/i,
    /timedtext/i,
    /subtitle/i,
    /caption/i,
    /aisubtitle/i,
    /transcript/i,
    /cc_vtt/i,
    /webvtt/i,
    /api\.bilibili\.com.*subtitle/i,
    /bilibili\.com.*subtitle/i,
  ];

  // 排除明显不是字幕的 URL（防止误报）
  const EXCLUDE_PATTERNS = [
    /caption-settings/i,
    /caption-style/i,
    /subtitle-settings/i,
  ];

  function isSubtitleUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (EXCLUDE_PATTERNS.some(p => p.test(url))) return false;
    return SUBTITLE_PATTERNS.some(p => p.test(url));
  }

  function capture(url) {
    if (!isSubtitleUrl(url)) return;
    if (!window.__capturedSubtitles.includes(url)) {
      window.__capturedSubtitles.push(url);
    }
  }

  // Hook fetch
  const _fetch = window.fetch;
  window.fetch = function (...args) {
    try {
      const url = typeof args[0] === 'string' ? args[0]
        : (args[0] instanceof Request ? args[0].url : '');
      capture(url);
    } catch (_) {}
    return _fetch.apply(this, args);
  };

  // Hook XMLHttpRequest
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { capture(String(url)); } catch (_) {}
    return _open.apply(this, arguments);
  };

  // Hook WebSocket（某些平台使用 WebSocket 传输字幕）
  const _WebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    try { capture(String(url)); } catch (_) {}
    return new _WebSocket(url, protocols);
  };
  window.WebSocket.prototype = _WebSocket.prototype;
})();
