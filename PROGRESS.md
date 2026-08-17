---
name: dsh-conversation-minimap
displayName: DSH 对话迷你地图插件
status: completed
lastTool: dsh
lastSession: 2026-08-17T00:00:00
environment: office
branch: main
progress: 100
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

- [ ] （可选）配置项接入（enabled/minPrompts 目前为客户端常量，未接线）
- [ ] （可选）社区反馈迭代（issue / PR）

## 最近完成

- [x] **v1.0.0 发布**：用户确认满意 → GitHub 公开仓库
  https://github.com/Braidy-Wu/dsh-conversation-minimap（tag v1.0.0 + Release）；
  补 LICENSE(MIT)、README 完善、版本号 1.0.0

## 最近完成

- [x] **v0.7.8（用户反馈）**：底部最后两个锚点被 22px 全透明渐隐区吃掉（只能悬停
  看不见）。修复：窗口到达列两端时向外扩展 60px（INSET），边缘锚点完全离开渐隐区。
  实测底部：末尾锚点距 rail 底边 60px、全部可见（idx 18-27）
- [x] **v0.7.7（用户反馈）**：拖拽压缩过程中 resize 锚定产生的 scroll 事件会清掉
  「曾在底部」记忆导致贴底失效（锚点窗口停在中间）。修复：resize 后 500ms 内的
  scroll 事件不更新底部记忆。实测 5 步连续拖拽：贴底、active=末尾、窗口显示末尾锚点
- [x] **v0.7.6（用户反馈）**：resize 前若在对话底部，resize 后 300ms 自动贴回新底部
  （拖上边缘是 top 锚定，视图停留在旧内容顶部导致脱离底部；中部位置不动，
  active 跟随保证锚点窗口始终对应当前 prompt）。实测顶锚定模拟：贴底、active=末尾
- [x] **v0.7.5（用户反馈）**：压缩窗口时可见锚点窗口**跟随当前 prompt（active 锚点）**
  ——修复位移符号反转 bug（正 translateY 把列推下、永远只显示顶部锚点；应为负位移
  上移露出后续锚点；此 bug 自 v0.6 起存在，也是早期"看不到最底部标记"的根因）。
  实测 h430：底部→显示 idx 11-23（active 24 在底缘）、顶部→显示 1-13、中部→active 居中
- [x] **v0.7.4（用户反馈）**：锚点列**始终居中**于 rail（移除 active 跟随窗口；溢出时
  两端对称裁剪+渐隐，锚点永不超过 rail 范围——回答了 50/100 轮问题）；**修复双重
  偏移 bug**（v0.7.2 把 seat 定位到 rail 边界后，rail 的 top/bottom 变成相对 seat 的
  二次偏移，短窗口下高度塌成 0；现 rail 填满 seat）；加最小高度保护。
  实测 resize 800→330：各高度均 centered=true，渐隐严格对称（h330: 上 9 下 10）
- [x] **v0.7.3（用户反馈）**：鱼眼峰值 56→44px（小一点）；粘滞鱼眼——每个锚点
  自带 pointermove（指针在放大区内移动时峰值锁定在该条中心，即使越出 rail 右侧
  也不缩小），离开 rail/锚点只安排 250ms 延迟复位（不再一离开就消失）。
  实测：右移入放大区保持 44px，离开 150ms 仍保持，400ms 后复位 12px
- [x] **v0.7.2（用户反馈）**：active 切换时机改为「prompt 垂直中线越过页面中线」
  （不再是一露头就切）；鱼眼改为仅向右侧放大（inner flex-start + margin 2px 固定
  左缘，seat 加宽到 72px 承载放大 + 顶部/底部渐隐 mask + 边界裁剪，rail 改
  overflow visible）。实测：左缘稳定、宽度右向增长越出 rail、居中时对应锚点激活
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
