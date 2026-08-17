# dsh-conversation-minimap

中文 | [English](README.md)

DeepSeek Harness (DSH) Web GUI 插件：**Prompt 导航迷你地图（Prompt-based Conversation Minimap）**。

长对话左侧显示一条纵向导航缩略条——复刻 ChatGPT 桌面端的对话迷你地图：

- **锚点** = 你发出的每一轮 Prompt（横向小胶囊，等距排列，居中显示）
- **鱼眼钟形**：鼠标悬停处按高斯曲线向右侧放大（峰值 44px），在放大区域内移动不缩小，滑动顺滑
- **渐隐**：rail 顶部/底部有渐变遮罩，超出范围的锚点自动淡出，永远不会超出范围
- **位置感知**：滚动对话时蓝色高亮跟随当前 Prompt（Prompt 中线越过页面中线时切换）；
  窗口压缩后仍自动贴底/跟随，可见锚点始终对应当前所在位置
- **交互**：悬停显示完整 Prompt 预览；点击平滑滚动跳转到对应消息并高亮 2 秒（连续点击不留残影）
- **全历史**：自动通过官方 `loadOlder` API 拉取完整历史，长对话的所有 Prompt 都能跳转

![screenshot](docs/screenshot.png)

## 安装

```sh
dsh plugin --profile web add github:Braidy-Wu/dsh-conversation-minimap
```

重启 `dsh web` 生效。

## 配置（cordis.patch.yml，全部可选，修改后重启 `dsh web` 生效）

```yaml
- insert:
    - id: conversation-minimap
      name: dsh-conversation-minimap
      config:
        enabled: true    # 总开关（false = 完全不加载）
        minPrompts: 4    # 会话内用户 Prompt 数 ≥ 此值才显示 rail（0 = 总是显示，默认 4，范围 0-100）
        anchorSize: 3    # 锚点横条高度 px（默认 3，范围 2-8）
```

## 工作原理

- **数据源**：官方 `ctx.sessions.scope(id)` + `conversation.loadOlder()` 拉取完整历史；
  观察渲染后的对话 DOM——用户消息行带 `data-chat-flow-kind="user"`（含 `steering`），
  跳转锚点用行上的 `data-chat-anchor-key`（与官方「滚动到消息」同一机制）
- **挂载**：绝对定位 seat 挂在对话视口外层，不随内容滚动、不占布局；边缘裁剪 + mask 渐隐
- **更新**：MutationObserver 监听消息列表（防抖 + key 集合 diff，流式输出不抖动）；
  轮询处理会话切换；历史同步期间不渲染，拉完一次性显示完整 rail
- **安全**：全程 try/catch，任何异常只禁用迷你地图本身，不影响 GUI

纯 vanilla JS 客户端插件（`inject: ['sessions']`，镜像 `dsh-theme-plugin` 结构），无构建步骤、无依赖。

## 开发

```sh
node --check client.js index.js   # 语法检查
# 冒烟测试：test/smoke.html + python3 -m http.server
```

## License

MIT
