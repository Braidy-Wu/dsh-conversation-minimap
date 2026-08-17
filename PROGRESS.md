---
name: dsh-conversation-minimap
displayName: DSH 对话迷你地图插件
status: in_progress
lastTool: dsh
lastSession: 2026-08-17T00:00:00
environment: office
branch: main
progress: 80
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

- [ ] 用户重启 dsh web 后实测反馈（rail 显示 / 悬停预览 / 点击跳转）
- [ ] 反馈后微调：位置、大小、颜色、minPrompts 阈值
- [ ] （可选）配置项接入（enabled/minPrompts/anchorSize 目前为客户端常量，未接线）

## 最近完成

- [x] client.js 核心实现（rail 渲染 / 悬停预览 / 点击跳转 / 位置指示器 / 动态追加重建）
- [x] Playwright 模拟 DOM 烟雾测试 8/8 通过、0 控制台错误（含修复 onScroll this 绑定 bug）
- [x] 已安装进 web profile（`dsh plugin add link:...`，bundle 已挂载）
- [x] 项目骨架：git init、package.json、cordis.patch.yml、index.js、.gitignore
- [x] 注册 ROUTING（driver=dsh）
