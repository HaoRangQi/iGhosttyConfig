# 本地 Companion 模式

本模式用于“直接读取并写回本机 Ghostty 配置文件”，适合个人本机使用。

## 启动

```bash
bun run dev:local
```

该命令会同时启动：

- Web 应用（默认 `http://localhost:5173`）
- 本地 API 服务（默认 `http://127.0.0.1:5174`）

在 `Import & Export` 页面会出现 **Local Ghostty** 区域，可执行：

- `Read Local`：读取当前本机配置
- `Save Local`：写回配置文件（保存前自动备份旧文件）
- `Reload`：尝试触发 Ghostty 重新加载配置

## 配置文件路径选择规则

本地 API 按顺序取“第一个已存在”的路径：

1. `$GHOSTTY_CONFIG_PATH`（若设置）
2. `$XDG_CONFIG_HOME/ghostty/config.ghostty`
3. `$XDG_CONFIG_HOME/ghostty/config`
4. `~/Library/Application Support/com.mitchellh.ghostty/config.ghostty`（macOS）
5. `~/Library/Application Support/com.mitchellh.ghostty/config`（macOS）

如果都不存在，默认写入 `$XDG_CONFIG_HOME/ghostty/config.ghostty`。

## 安全边界

- 本地 API 默认监听 `127.0.0.1`，仅本机访问。
- 请求体默认限制为 `1 MB`。
- 仅允许预设 Origin（可通过环境变量扩展）。

## 相关脚本

- 本地 API：`scripts/local-ghostty-server.mjs`
- 本地模式组合启动：`scripts/dev-local.mjs`
