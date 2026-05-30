# i Ghostty Config 测试报告

## 本次落地执行结论（2026-05-30）

本次已按“远程 Docker + 浏览器文件写回模式”目标完成落地验证，核心功能与回归链路均通过。

| 检查项 | 实际执行命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run check` | 通过，0 errors / 0 warnings |
| 单元与集成测试 | `npm test` | 通过，7 个测试文件 / 58 个用例 |
| Lint | `npm run lint` | 通过 |
| 生产构建 | `npm run build` | 通过（Node adapter） |
| 远程模式 E2E | `npm run test:e2e` | 通过，4/4 用例 |
| Docker 构建 | `docker build -t ghostty-config-remote-test .` | 通过 |
| Docker 运行 + 页面检查 | `docker run --rm -d -p 3300:3000 ...` + `curl /app/import-export` | HTTP 200 |
| 远程 API smoke | `curl -X POST /api/remote/process-config` | HTTP 200，返回 parsed 结果 |

### 远程模式关键能力核对

1. 通过 `PUBLIC_GHOSTTY_CONFIG_MODE=remote` 切换远程模式，远程模式下隐藏本地 companion 入口（`Read Local`、`Reload`）。
2. Chromium 走 File System Access API：可读取本机文件并确认后写回原文件。
3. 非 Chromium 走上传/下载降级：上传后仅下载替换文件，不做原文件写回。
4. 保存前弹出二次确认，包含目标文件名与变更摘要；可写回场景先下载备份副本。
5. 服务端 `POST /api/remote/process-config` 仅内存处理，不落盘，不保留历史。
6. 远程浏览器模式下不自动触发 Ghostty reload，保存后提示手动 reload。

### 当前残留风险

1. “变更确认”目前是 key 级摘要，不是逐行 unified diff；若团队要求审计级 diff，建议下一迭代补文本级对比视图。
2. 远程模式默认无鉴权，仅适合可信内网，不可直接暴露公网。
3. Docker 构建日志存在 `tsconfig extends ./.svelte-kit/tsconfig.json` 警告（不影响构建成功），建议后续在 CI 中预先 `svelte-kit sync` 或调整构建前步骤。

## 步骤 1：理解与分析

### 功能点与业务流程

| 模块 | 功能点 | 关键流程 |
| --- | --- | --- |
| 设置编辑 | 按分类编辑 Ghostty 配置项，实时预览颜色、字体、窗口和 keybind | 用户进入设置页 -> 修改控件 -> 全局 `config` state 更新 |
| 配置导入 | 剪贴板导入、普通文件导入、分享链接导入 | 读取文本 -> `parse()` -> `load()` 合并到当前配置 |
| 配置导出 | 复制、下载、生成分享 URL | `diff()` -> `stringifyConfig()` -> clipboard/download/share |
| 本地 companion | 读取本机 Ghostty 配置、保存回写、备份、reload | 前端调用 `127.0.0.1:5174` -> 本地脚本读写文件 -> 尝试 reload |
| 远程团队模式 | Docker 部署后由浏览器选择/上传本机配置，远程 API 临时处理，再写回或下载 | 选择文件 -> `/api/remote/process-config` -> Web 编辑 -> 确认 -> File System Access 写回或下载 |
| 浏览器文件访问 | Chromium 支持直接写回，非 Chromium 降级为上传/下载 | `showOpenFilePicker` 可用性判断 -> handle 写入或 `<input type=file>` |
| Keybind 编辑 | trigger/action 解析、参数校验、重复检测、序列编辑 | 输入 keybind -> `parseKeybind()` -> diagnostics -> 保存 |
| 主题加载 | 从 GitHub 拉取 Ghostty 主题列表与内容 | 远程 fetch -> parse color scheme -> load |
| 部署 | 本地开发、远程 Docker、Node adapter production server | `npm run dev:local` / `npm run dev:remote` / Docker run |

### 核心领域模型

| 模型 | 来源 | 作用 | 测试重点 |
| --- | --- | --- | --- |
| `settings` | `src/lib/data/settings.ts` | 配置 schema 和默认值来源 | 默认值完整性、控件类型、平台差异 |
| `config` | `src/lib/stores/config.svelte.ts` | 当前编辑态 | 状态重置、数组合并、导入覆盖 |
| `diff()` | config store | 生成导出配置 | 非默认值、palette/keybind repeatable 输出 |
| `parse()` | `src/lib/utils/parse.ts` | Ghostty 文本解析 | 注释、非法行、palette、颜色、重复键 |
| `BrowserConfigFile` | `browser-file.ts` | 浏览器侧文件会话 | 文件名、内容、handle、fallback 能力 |
| local companion API | `scripts/local-ghostty-server.mjs` | 本地文件读写与 reload | 路径选择、备份、CORS、body size |
| remote API body | `/api/remote/process-config` | 远程临时处理 | 1 MB 限制、错误响应、不落盘 |

### 关键路径与风险点

| 优先级 | 风险 | 影响 | 当前状态 |
| --- | --- | --- | --- |
| P0 | 本地保存覆盖用户真实配置 | 配置丢失、Ghostty 启动失败 | 已补本地 server 写入/备份单测 |
| P0 | 远程 Docker 上传后写回错误文件 | 用户本地配置被误覆盖 | 已补远程上传与确认 E2E |
| P0 | 远程 API body limit 被 adapter 默认 512 KB 先拦截 | 1 MB 产品限制失效，错误不可控 | 已补 `BODY_SIZE_LIMIT=2M` |
| P0 | 解析/导出丢失注释和未知配置 | 用户原配置保真度不足 | 已识别为产品风险，需后续 patch/merge 策略 |
| P1 | 无鉴权远程部署被公网访问 | 配置泄露或滥用 | README 已限定可信内网；建议后续加 token |
| P1 | GitHub Pages 静态部署与 Node adapter 冲突 | 原部署链路可能失效 | 需单独决策静态/Node 双 adapter 策略 |
| P1 | File System Access API 浏览器兼容性 | 非 Chromium 无法原文件写回 | 已有 fallback，已补自动化测试 |
| P2 | UI 固定尺寸和移动端适配 | 移动端可用性弱 | 尚未做跨 viewport 自动化 |

## 步骤 2：测试计划制定

### 测试类型覆盖

| 类型 | 目标 | 工具 | 当前状态 |
| --- | --- | --- | --- |
| 单元测试 | 解析、序列化、keybind、分享、浏览器文件封装 | Vitest | 已补充并通过 |
| 集成测试 | 本地 companion helper、远程处理逻辑 | Vitest | 已补充并通过 |
| API 测试 | `/api/remote/process-config` 正常/异常/超限 | Playwright request | 已补充并通过 |
| E2E 测试 | 远程团队模式 UI、上传、确认保存 fallback | Playwright Chromium | 已补充并通过 |
| UI 测试 | 控件可见性、远程/本地按钮隐藏规则 | Playwright | 已覆盖远程核心路径 |
| 安全测试 | body size、CORS、无鉴权边界、依赖漏洞 | Vitest + npm audit + 审查 | 已执行，仍有 low severity 依赖告警 |
| 性能测试 | 大配置处理、构建包体、API 响应 | build 输出 + size limit 测试 | 已做 smoke，建议后续加基准 |
| 兼容性测试 | Chromium 写回、非 Chromium 下载 fallback、Docker | Playwright + Docker | Chromium/fallback 已测；Docker build/run/API smoke 已通过 |

### 模块测试策略

| 模块 | 策略 |
| --- | --- |
| `parse()` | 覆盖正常标量、颜色补 `#`、palette、keybind、注释、非法行、越界 palette |
| `config-text` | 覆盖 scalar、boolean、repeatable array、header 开关 |
| `keybinds` | 保留现有 trigger/action/duplicate/sequence 校验 |
| `browser-file` | jsdom 模拟 File System Access、upload fallback、写入换行、download URL 回收 |
| `remote-config-server` | 纯函数覆盖非对象、非 string content、空配置 warning、1 MB 限制 |
| local companion | 临时 HOME/XDG/GHOSTTY_CONFIG_PATH 下测试路径选择、备份、body limit、CORS |
| remote UI | production Node server 下验证远程模式入口、隐藏本地 reload、上传处理、保存确认 |
| Docker | 构建镜像、运行容器、API smoke；验证 `BODY_SIZE_LIMIT` 和远程 API 可用性 |

## 步骤 3：测试用例

| ID | 优先级 | 模块 | 场景 | 步骤 | 预期 |
| --- | --- | --- | --- | --- | --- |
| TC-001 | P0 | parse | 标准配置导入 | 输入 `font-size = 14` | 输出 `fontSize: "14"` |
| TC-002 | P0 | parse | 颜色无 `#` | 输入 `background = 101010` | 输出 `#101010` |
| TC-003 | P0 | parse | palette 有效索引 | 输入 `palette = 15=#fff` | 写入 index 15 |
| TC-004 | P1 | parse | 注释/空行/非法行 | 输入混合文本 | 忽略无效行，不抛错 |
| TC-005 | P0 | export | repeatable keybind | 多个 keybind | 输出多行 `keybind = ...` |
| TC-006 | P0 | remote API | 正常配置 | POST content | 200，返回 content/parsed/warnings |
| TC-007 | P0 | remote API | content 非 string | POST `{content: 42}` | 400，清晰错误 |
| TC-008 | P0 | remote API | 超 1 MB | POST 1 MB+1 | 413，应用层错误 |
| TC-009 | P1 | remote API | 空配置 | POST 空白字符串 | 200，warning |
| TC-010 | P0 | browser file | Chromium 文件打开 | mock `showOpenFilePicker` | 返回 writable handle |
| TC-011 | P0 | browser file | 非 Chromium fallback | input file | writable false |
| TC-012 | P0 | browser file | 写回换行 | 写入无换行内容 | 自动补尾随换行 |
| TC-013 | P1 | browser file | 下载备份 | 调用 download | 触发 click 并 revoke URL |
| TC-014 | P0 | local server | 指定 `GHOSTTY_CONFIG_PATH` | 设置 env | 优先写指定路径 |
| TC-015 | P0 | local server | 保存已有配置 | 写临时文件后保存 | 原文件生成 backup |
| TC-016 | P0 | local server | 非 string 写入 | POST 非 string | 400/throw |
| TC-017 | P1 | local server | CORS 允许源 | Origin localhost | 返回允许 header |
| TC-018 | P1 | local server | CORS 非允许源 | Origin example.com | 不返回允许 header |
| TC-019 | P0 | E2E remote | 远程模式入口 | 打开 `/app/import-export` | 有 Remote Team，无 Local Ghostty section |
| TC-020 | P0 | E2E remote | 上传配置 | setInputFiles | 预览包含解析后的配置 |
| TC-021 | P0 | E2E remote | 保存确认 | 点击 Review & Save | 弹窗显示目标文件和变更 key |
| TC-022 | P1 | security | 依赖审计 | `npm audit --audit-level=low` | 无高危；记录低危 |
| TC-023 | P1 | compatibility | Docker API smoke | build/run/curl | Docker 可用时通过 |
| TC-024 | P2 | performance | 大配置边界 | 1 MB 内容 | 不落盘，超限拒绝 |

## 步骤 4：可执行测试代码

### 新增/扩展测试文件

| 文件 | 覆盖 |
| --- | --- |
| `src/lib/utils/parse.test.ts` | 配置解析边界 |
| `src/lib/utils/browser-file.test.ts` | 浏览器文件 API 封装 |
| `src/lib/utils/remote-config-server.test.ts` | 远程处理异常与 size limit |
| `scripts/local-ghostty-server.test.mjs` | 本地 companion 路径、备份、CORS |
| `tests/e2e/remote-mode.spec.ts` | 远程 UI/API E2E |
| `playwright.config.js` | production remote mode E2E server |

### 新增命令

| 命令 | 用途 |
| --- | --- |
| `npm test` | Vitest 单元/集成测试 |
| `npm run test:e2e` | Playwright E2E |
| `npm run test:all` | 单元 + E2E |

## 步骤 5：代码审查与静态测试

### 静态测试结果

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 通过，0 errors，0 warnings |
| `npm run lint` | 通过 |
| `npm run build` | 通过 |
| `npm audit --audit-level=low` | 失败，5 个 low severity，来源 `cookie <0.7.0` 经 `@sveltejs/kit` 传递 |

### 审查发现

| 优先级 | 发现 | 建议 |
| --- | --- | --- |
| P0 | 导入后保存只输出生成器 diff，不保留原文件注释、未知项和顺序 | 后续实现文本级 merge/patch，保存前展示完整 diff |
| P0 | 远程模式无鉴权 | 内网可接受；公网必须加 token、SSO 或反向代理鉴权 |
| P1 | Node adapter 改造可能破坏 GitHub Pages 静态部署 | 增加静态/Node 双构建策略或更新 CI 部署目标 |
| P1 | API size limit 依赖 `BODY_SIZE_LIMIT` | 已在 Docker/E2E 补 `2M`，部署文档需强调 |
| P1 | `parse()` 对 Ghostty 语法仍偏简化 | 增加官方语法兼容测试，尤其重复键、include、引号、转义 |
| P2 | 本地 companion 脚本有文件系统权限边界 | 可增加路径 allowlist 或启动时确认目标路径 |
| P2 | UI 固定桌面尺寸 | 后续补移动端 viewport E2E 和可访问性检查 |

## 步骤 6：测试执行模拟

### 自动执行

| 命令 | 预期 |
| --- | --- |
| `npm test` | 7 个测试文件、58 个用例通过 |
| `npm run check` | Svelte/TS 0 错误 |
| `npm run lint` | ESLint 0 错误 |
| `npm run build` | Node adapter production build 成功 |
| `npm run test:e2e` | 4 个 Chromium E2E 通过 |
| `npm audit --audit-level=low` | 当前会报 5 个 low severity |
| `docker build -t ghostty-config-remote-test .` | 镜像构建成功 |
| `docker run --rm -d --name ghostty-config-remote-test -p 3000:3000 ghostty-config-remote-test` | 容器启动成功，页面 200，远程 API smoke 通过 |

### 手动执行

| 场景 | 步骤 | 预期 |
| --- | --- | --- |
| 本地 companion | `npm run dev:local` -> 打开 Import & Export -> Read Local -> 修改 -> Save Local | 读取本机 config，保存时生成 backup，reload 尽力触发 |
| 远程 Chromium | `npm run dev:remote` -> Open Local Config -> 修改 -> Review & Save | 弹窗确认后写回同一文件，并下载 backup |
| 非 Chromium | `npm run dev:remote` -> Upload File -> 修改 -> Review & Save | 下载替换文件，不尝试原文件写回 |
| 远程 API | curl POST `/api/remote/process-config` | 正常返回 parsed；非法 body 返回 400；超限返回 413 |

## 整体测试报告总结

当前自动化覆盖已经从原有工具函数扩展到本地 companion、浏览器文件 API、远程 API 和远程 UI E2E。核心回归命令均通过，远程 Docker 镜像构建、容器运行、页面访问和 API smoke 均已验证。安全审计存在低危依赖告警，需要后续依赖升级处理。

## 高优先级风险清单

| 优先级 | 风险 |
| --- | --- |
| P0 | 保存策略不保留用户原配置注释/未知项/顺序 |
| P0 | 远程模式无鉴权，不可公网裸露 |
| P1 | GitHub Pages 静态部署与 Node adapter 方向冲突 |
| P1 | `npm audit` 存在 `cookie` low severity 传递依赖告警 |

## 建议改进点

1. 增加原配置保真保存：基于 parsed diff 做文本 patch，而不是直接输出生成器 diff。
2. 增加完整 diff UI：保存前展示新增、删除、修改行。
3. 增加远程部署鉴权选项：至少支持共享 token。
4. 明确部署矩阵：静态 Pages 和 Node/Docker 分开构建。
5. 增加跨浏览器与移动端 E2E：Chromium、Firefox/WebKit fallback、窄屏布局。
6. 增加性能基准：1 MB 以内配置解析耗时、UI 渲染耗时、API 并发请求。
