---
name: dsh-conversation-minimap
displayName: DSH 对话迷你地图插件
status: in_progress
lastTool: dsh
lastSession: 2026-08-17T00:00:00
environment: office
branch: main
progress: 90
---

# dsh-conversation-minimap

> DSH Web GUI 插件：Prompt 导航迷你地图（Prompt-based Conversation Minimap）。
> 长对话左侧显示纵向导航缩略条，锚点 = 每轮用户 Prompt；悬停预览、点击跳转。

## 产品规格（已与用户确认）

- 形态：对话区左侧窄轨（浮动 rail，不占布局），锚点为半透明小横条
- 交互：悬停 → 鱼眼放大 + 右侧浮层显示该条 Prompt 预览；点击 → 滚动跳转到对应消息
- 术语：Conversation Minimap（对外名）/ Prompt Anchors（锚点）；不用 Scrubber（不支持拖动）

## 技术方案（已验证）

- 数据/定位：对话 DOM 行有 `data-chat-anchor-key`（消息 key）+ `data-chat-flow-kind`（`user`/`steering` 为用户 Prompt）
- 挂载：绝对定位 seat 挂在对话滚动容器外层的 relative 包装元素上（不随内容滚动）
- 锚点位置：flex-grow 间隙按相邻用户消息间距比例分配（自适应窗口尺寸）
- 跳转：`row.scrollIntoView({behavior:'smooth', block:'start'})` + 2s 高亮
- 更新：MutationObserver 监听消息列表（防抖 + key diff）；轮询处理会话切换
- 纯 vanilla JS 客户端插件，无构建步骤；host 端 no-op（镜像 dsh-theme-plugin 结构）

## 下一步

- [ ] 用户硬刷新（Ctrl+Shift+R）后实测：rail 出现、锚点数 = 全部历史 Prompt
- [ ] 反馈后微调：位置、大小、颜色、minPrompts 阈值
- [ ] （可选）配置项接入（enabled/minPrompts/anchorSize 目前为客户端常量，未接线）

## 最近完成

- [x] **v0.2 关键修复**：DSH 会话视图是窗口化的（只渲染最近 ~150 节点，历史消息不在 DOM）。
  v0.1 只收集到窗口内 3 条 user 行 < 阈值 4 → rail 隐藏。v0.2 挂载时用官方
  `ctx.sessions.scope(id).conversation.loadOlder()` 逐页拉全历史（检测首行 key 变化判断尽头，
  上限 120 页），全部 Prompt 成为锚点；期间 rail 显示 "⋯" 加载提示
- [x] v0.2 冒烟测试 10 项断言全过（窗口→同步→6 锚点→预览→点击→active→追加→卸载），0 控制台错误
- [x] 排查"重启后不显示"：服务器未真正重启（启动包装脚本端口占用时只开浏览器）。
  客户端改动无需重启服务器，硬刷新页面即可（link 安装实时生效）
- [x] client.js 核心实现（rail 渲染 / 悬停预览 / 点击跳转 / 位置指示器 / 动态追加重建）
- [x] Playwright 模拟 DOM 烟雾测试（含修复 onScroll this 绑定 bug）
- [x] 已安装进 web profile（`dsh plugin add link:...`，bundle 已挂载）
- [x] 项目骨架：git init、package.json、cordis.patch.yml、index.js、.gitignore
- [x] 注册 ROUTING（driver=dsh）
