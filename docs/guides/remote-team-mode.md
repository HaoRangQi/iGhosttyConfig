# 远程团队模式（Docker）

本模式用于“应用部署在远程 Docker，用户通过浏览器处理本机配置文件”。

## 适用场景

- 团队共用一套配置编辑服务
- 服务端只做临时处理，不保留用户配置文件
- 需要兼容 Chromium 与非 Chromium 浏览器

## 启动方式

### 本地模拟远程模式

```bash
npm run dev:remote
```

### Docker 运行

```bash
docker build -t ghostty-config-remote .
docker run --rm -p 3000:3000 ghostty-config-remote
```

访问：`http://localhost:3000/app/import-export`

## 使用流程

1. 打开 `Import & Export` 页面。
2. 选择 `Open Local Config`（Chromium）或 `Upload File`（其他浏览器）。
3. 配置上传到 `/api/remote/process-config` 做临时解析处理。
4. 页面编辑后点击 `Review & Save`，确认目标文件和变更摘要。
5. Chromium 可写回原文件；其他浏览器下载替换文件。

## 浏览器差异

- Chromium：支持 File System Access API，可授权并写回原文件。
- 非 Chromium：降级为上传 + 下载，不支持直接覆盖本机文件。

## 安全说明

- 默认无登录鉴权，仅建议部署在可信内网。
- 不应直接暴露公网；如需公网使用，请加反向代理鉴权或 SSO。
- 远程浏览器模式不能自动触发 Ghostty reload，保存后需手动 reload。
