# 万能侧边栏

一个 Chrome 侧边栏扩展，将完整浏览器和 AI 聊天平台集成到 Chrome 侧边栏中。支持多 AI 平台切换、网页内容提取、区域截屏、视频字幕提取等功能。

## ✨ 功能特性

- **多标签页浏览器** — 在侧边栏内打开任意网页，支持多标签页切换
- **AI 平台一键切换** — 预置 DeepSeek、Claude、ChatGPT、Gemini、Kimi 等主流 AI 平台，支持自定义添加
- **网页内容提取** — 一键将当前网页内容转换为 Markdown 格式
- **区域截屏** — 框选网页任意区域，截图自动复制到剪贴板并粘贴到 AI 对话框
- **视频字幕提取** — 支持 YouTube、Bilibili 等平台的字幕抓取与显示
- **深色模式** — 支持亮色/深色/跟随系统三种主题
- **页面缩放** — 50% ~ 200% 缩放控制
- **全屏模式** — 侧边栏全屏浏览

## 📦 安装方式

1. 下载或克隆本仓库到本地
2. 打开 Chrome，地址栏输入 `chrome://extensions/`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择本项目目录
5. 点击 Chrome 工具栏中的扩展图标，即可打开侧边栏

## 🔒 权限说明

| 权限 | 用途 |
|------|------|
| `sidePanel` | 创建侧边栏面板 |
| `activeTab` | 获取当前标签页信息 |
| `storage` | 保存用户设置和标签页状态 |
| `tabs` | 管理多标签页 |
| `clipboardWrite` | 截图复制到剪贴板 |
| `scripting` | 注入内容脚本 |
| `declarativeNetRequest` | 移除 iframe 限制头，实现网页嵌入 |
| `webNavigation` | 监听 iframe 内导航变化 |
| `cookies` | 修复 MiMo 平台的 cookie 兼容性 |
| `webRequest` | 拦截字幕相关网络请求 |
| `<all_urls>` | 内容脚本注入到所有页面（用于内容提取和截屏） |

## 🛠 技术栈

- 纯原生 JavaScript (ES6+)、HTML5、CSS3
- Chrome Extension Manifest V3
- 零依赖，无需构建步骤

## 📁 项目结构

```
├── manifest.json        # 扩展配置
├── background.js        # Service Worker — 消息中继、截屏
├── content.js           # 内容脚本 — 内容提取、截屏、URL 检测
├── content.css          # 截屏选择框样式
├── subtitle-main.js     # 字幕拦截脚本（MAIN world）
├── sidebar.html         # 侧边栏 HTML
├── sidebar.js           # 侧边栏逻辑
├── sidebar.css          # 侧边栏样式
├── rules.json           # iframe 嵌入规则
└── icons/               # 扩展图标
```

## 📄 许可证

[MIT License](LICENSE)
