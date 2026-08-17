# dsh-conversation-minimap

DSH Web GUI 插件：**Prompt 导航迷你地图（Prompt-based Conversation Minimap）**。

长对话左侧显示一条纵向导航缩略条：每个锚点 = 你发出的一轮 Prompt。
悬停锚点 → 鱼眼放大 + 浮层预览该条 Prompt；点击锚点 → 平滑滚动跳转到对应消息并高亮 2 秒。

## 安装

```sh
dsh plugin --profile web add link:/root/projects/dsh-conversation-minimap
# 或打包后：
dsh plugin --profile web add <tarball|github 地址>
```

重启 `dsh web` 生效。

## 配置（cordis.patch.yml，全部可选）

```yaml
- insert:
    - id: conversation-minimap
      name: dsh-conversation-minimap
      config:
        enabled: true    # 总开关
        minPrompts: 4    # 会话内用户 Prompt 数 ≥ 此值才显示 rail（0 = 总是显示）
        anchorSize: 6    # 锚点直径 px
```

## 工作原理

- **数据源**：观察渲染后的对话 DOM——用户消息行带 `data-chat-flow-kind="user"`（含 `steering`），
  跳转锚点用行上的 `data-chat-anchor-key`（与官方"滚动到消息"同一机制）。
- **挂载**：绝对定位 seat 挂在对话视口外层 relative 包装元素上，不随内容滚动、不占布局。
- **比例**：锚点间距（flex-grow）按相邻用户消息在全文中的距离比例分配，自适应窗口大小。
- **更新**：MutationObserver 监听消息列表（防抖 + key 集合 diff，流式输出时不抖动）；
  800ms 轮询处理会话切换。
- **安全**：全程 try/catch，任何异常只禁用迷你地图本身，不影响 GUI。

纯 vanilla JS 客户端插件（镜像 `dsh-theme-plugin` 结构），无构建步骤、无依赖。

## 开发

```sh
node --check client.js index.js   # 语法检查
# 冒烟测试：test/smoke.html + python3 -m http.server
```

## License

MIT
