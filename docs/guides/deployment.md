# 部署说明

## 方式 1：官方线上版本

主分支默认通过 GitHub Actions 自动发布到：

- [ghostty.zerebos.com](https://ghostty.zerebos.com)

## 方式 2：自托管 Node 服务

```bash
npm install
npm run build
npm run start
```

默认启动 `@sveltejs/adapter-node` 产物，可通过环境变量调整地址和端口。

## 方式 3：Docker（推荐团队内部）

```bash
docker build -t ghostty-config-remote .
docker run --rm -p 3000:3000 ghostty-config-remote
```

## 常用环境变量

- `PUBLIC_GHOSTTY_CONFIG_MODE`
  - `local`：本地 companion 交互（默认）
  - `remote`：远程团队模式 UI
- `HOST`：服务监听地址（默认 `0.0.0.0`）
- `PORT`：服务端口（默认 `3000`）
- `BODY_SIZE_LIMIT`：请求体限制（默认容器内设置为 `2M`）

## 生产建议

- 远程模式默认无鉴权，仅部署在内网。
- 公网场景务必加网关鉴权、访问控制和 TLS。
- 建议启用反向代理访问日志与错误监控。
