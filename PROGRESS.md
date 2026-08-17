---
name: dsh-conversation-minimap
displayName: DSH 对话迷你地图插件
status: in_progress
lastTool: dsh
lastSession: 2026-08-17T00:00:00
environment: office
branch: main
progress: 95
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

- [ ] 用户硬刷新（Ctrl+Shift+R）后确认 v0.7.1（鱼眼更明显 + 绿色残留修复）
- [ ] （可选）配置项接入（enabled/minPrompts 目前为客户端常量，未接线）

## 最近完成

- [x] **v0.7.1（用户反馈）**：鱼眼更明显（峰值 40→56px、σ15→18、放大条加深色调、
  过渡 0.18s 更顺滑）；active 指示器加蓝色光晕更醒目；**修复绿色残留 bug**——
  根因：连续点击时新点击 clearTimeout 掉旧定时器，旧锚点绿色永不消除；
  改为新跳转先清除上一个 jumpedDot，且行高亮闭包改为按次捕获 target
- [x] **v0.7（用户反馈，复刻 ChatGPT 迷你地图）**：像素级分析 GPT 截图确认目标规格
  （63 条 3px 横条、15px 等距、顶部 4 条渐隐、鼠标处宽度 9→39 钟形放大）。
  实现：12×3px 统一横条 + 12px 等距；鱼眼钟形（宽度 12→40 峰值、σ=15、0.12s 过渡
  滑动感、悬停条变深）；mask-image 顶部/底部渐隐（22px→54px 渐变）；修复无分号
  风格下的 ASI 陷阱（IIFE 前加前导分号，曾导致 setAttribute 结果被调用）。
  实测宽度序列 [12,12,16,29,40,29,16,12,12] 与 GPT 同构
- [x] **v0.6（用户反馈）**：胶囊尺寸锁死统一（14×4，flex:0 0 4px，实测 19 个全部
  一致）；锚点等距（固定 8px gap，实测 min=max=8）；锚点列整体居中（从中间开始，
  向两边增长）；溢出时窗口跟随 active 锚点滚动（rail overflow:hidden 裁剪，
  顶部逐渐消失、往回滚重新出现，窗口化数学已实测）；resize 重新对齐
- [x] **v0.5（用户反馈）**：横向 GPT 风格胶囊（14×4px 悬停变宽）；位置改为按消息实际位置
  比例映射——关键修复：计算基准从 list 改为 SCROLLER（list 位于 sticky 包装层内，
  viewport 偏移污染了首/尾间隙的绝对项），实测 railFrac↔contentFrac 偏差 <0.5%；
  active 指示器随滚动移动（滚到底高亮最后一个锚点）；预览显示完整 prompt 并移除
  原生 title 白框；历史同步期间不渲染，拉完一次性显示完整 rail
- [x] **v0.4（用户反馈）**：① rail 边界对齐可视区（顶部避开会话头、底部避开输入框，
  底部标记不再被遮挡）；② GPT 风格胶囊标记（4×12px，hover 加宽到 12px 加深）；
  ③ 锚点等距分布（space-evenly，实测间距 59-60px 均匀）；实测 17 锚点全部可见、
  active 蓝色指示器正常。冒烟测试 10 断言全过 + GUI 实测通过

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
