# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

万能侧边栏 (Universal Sidebar) — a Chrome Manifest V3 extension that embeds a full browser and AI chat platform switcher inside the Chrome side panel. Users can browse the web, switch between AI services (DeepSeek, Claude, ChatGPT, Gemini, Kimi, etc.), extract page content as Markdown, take area screenshots that auto-paste into AI chat inputs, and extract video subtitles from platforms like YouTube and Bilibili.

## Tech Stack

- Vanilla JavaScript (ES6+), HTML5, CSS3 — no frameworks, no TypeScript, no build tools
- Chrome Extension Manifest V3 (`chrome.sidePanel`, `chrome.storage.local`, `chrome.tabs`, `chrome.scripting`, `chrome.webNavigation`, `declarativeNetRequest`)
- Zero npm dependencies. No `package.json`. Source files are the final files.

## Development

There is no build step. To run the extension:

1. Go to `chrome://extensions/`, enable Developer mode
2. Click "Load unpacked" and select this project directory
3. Click the extension icon to open the side panel

Syntax check: `node -c <file>.js` (validates JS syntax, no linting tools configured)

No automated tests — testing is manual in Chrome.

## Architecture

Four components communicate via Chrome messaging APIs:

### background.js (Service Worker, ~210 lines)
- Opens side panel on icon click
- Message relay between sidebar and content scripts
- Handles `captureVisibleTab` for screenshots
- Subtitle URL interception via `webRequest.onBeforeRequest` (stores per-tab subtitle URLs in `subtitleUrlMap`)
- MiMo cookie fix — re-sets MiMo cookies with `SameSite=None; Secure` for iframe compatibility
- Tab change detection and notification to sidebar
- Monitors iframe navigation via `webNavigation` events

### content.js (Content Script, ~512 lines)
- Injected into all pages including iframes
- URL change detection inside iframes (polls + event listeners, sends via `postMessage`)
- `extractPageContent()` — DOM-to-Markdown converter (`nodeToMarkdown()`) handling headings, lists, tables, code blocks, blockquotes
- `startAreaCapture()` — selection overlay + canvas crop + clipboard copy
- `pasteImageToInput()` — synthetic `ClipboardEvent` paste into chat input elements

### subtitle-main.js (MAIN World Content Script, ~69 lines)
- Runs in the page's MAIN world at `document_start` (separate from content.js)
- Hooks `fetch`, `XMLHttpRequest`, and `WebSocket` to capture subtitle-related network request URLs
- Stores captured URLs in `window.__capturedSubtitles` for content.js to read
- Uses `__subtitleHooked` flag to prevent double-injection

### sidebar.html / sidebar.js / sidebar.css (Side Panel UI)
- **sidebar.js** (~1378 lines): Main application logic
- **sidebar.css** (~783 lines): All styling with CSS custom properties
- Multi-tab browser with per-tab iframes, lazy-loaded
- Each tab has its own navigation history stack
- AI sidebar panel with pre-configured and custom AI platform URLs
- Settings panel (theme, default homepage)
- Content viewer overlay for extracted Markdown/source
- Features: dark mode (CSS `invert(1) hue-rotate(180deg)`), zoom (50%-200%), fullscreen, video subtitle extraction for YouTube/Bilibili/Douyin/TikTok

### rules.json (Declarative Net Request)
Removes `X-Frame-Options` and `Content-Security-Policy` headers from all sub-frame responses. This is what enables embedding arbitrary websites in iframes.

## State Management

Single global `state` object in sidebar.js persisted to `chrome.storage.local`:
- `tabs[]` — each tab has iframe ref, URL, title, history stack, scroll position
- `settings` — theme (`light`/`dark`/`system`), default homepage URL
- `aiList[]` — user-customizable AI platform entries
- `zoomLevel`, `isFullscreen`, `webDarkMode`

State saves on navigation, tab switch, visibility change, `beforeunload`, and every 10 seconds.

## Key Communication Flows

**Screenshot auto-paste**: content script area selection → `captureVisibleTab` via background → canvas crop → clipboard copy → `chrome.runtime.sendMessage` to background → relay to sidebar → `postMessage` to iframe → content script dispatches paste event into chat input

**URL sync**: content script in iframe detects URL changes (pushState/popstate/polling) → `postMessage` to sidebar → sidebar updates tab URL bar

**Subtitle extraction**: `subtitle-main.js` hooks fetch/XHR/WebSocket in MAIN world → stores URLs in `window.__capturedSubtitles` → content.js reads those + background's `subtitleUrlMap` (via `GET_SUBTITLE_URLS` message) → sidebar fetches and displays subtitle content

## File Reference

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config, permissions, content script rules |
| `background.js` | Service worker — message relay, screenshot capture |
| `content.js` | Content script — extraction, screenshots, URL detection |
| `content.css` | Styles for screenshot selection overlay |
| `subtitle-main.js` | MAIN world script — hooks fetch/XHR/WebSocket to capture subtitle URLs |
| `sidebar.html` | Side panel HTML structure |
| `sidebar.js` | Side panel logic — tabs, navigation, state, UI |
| `sidebar.css` | Side panel styles with CSS custom properties |
| `rules.json` | Header removal rules for iframe embedding |
