<div align="center">
  <a href="https://zerebos.github.io/ghostty-config"><img src="./src/lib/images/icon.webp" height="128" alt="i Ghostty Config"></a>
  <h1 align="center" style="border:0;">i Ghostty Config</h1>
  <p align="center">为 <a href="https://ghostty.org/" target="_blank">Ghostty</a> 终端打造的美观直观配置生成器。</p>

[![GitHub Stars](https://img.shields.io/github/stars/HaoRangQi/iGhosttyConfig?style=social)](https://github.com/HaoRangQi/iGhosttyConfig/stargazers)
[![App](https://img.shields.io/badge/app-online-brightgreen)](https://ghostty.zerebos.com)
[![Build Status](https://github.com/HaoRangQi/iGhosttyConfig/actions/workflows/deploy.yml/badge.svg)](https://github.com/HaoRangQi/iGhosttyConfig/actions)
[![License](https://img.shields.io/github/license/HaoRangQi/iGhosttyConfig)](https://github.com/HaoRangQi/iGhosttyConfig/blob/main/LICENSE)

  <img src="https://github.com/user-attachments/assets/aa49f2bb-a6d3-4248-833b-488d27b57815" alt="Preview of the terminal colorizer">
</div>

## 一句话介绍

i Ghostty Config 是一个基于 Web 的 [Ghostty](https://ghostty.org/) 配置编辑器：可视化调整设置、实时预览、一键导出。

**在线体验：** [ghostty.zerebos.com](https://ghostty.zerebos.com)

## 快速开始

```bash
git clone https://github.com/HaoRangQi/iGhosttyConfig.git
cd iGhosttyConfig
bun install
bun run dev
```
启动后访问 `http://localhost:5173`。

## 运行模式

- 本机直连（读取/写回本机配置）：见 [Local Companion 文档](./docs/guides/local-companion.md)。
- 远程团队（Docker + 浏览器文件授权）：见 [Remote Team Mode 文档](./docs/guides/remote-team-mode.md)。

## 文档导航

- [文档总览](./docs/README.md)
- [本地 Companion 模式](./docs/guides/local-companion.md)
- [远程团队模式（Docker）](./docs/guides/remote-team-mode.md)
- [部署说明](./docs/guides/deployment.md)
- [路线图](./docs/roadmap.md)
- [测试报告](./docs/testing/test-report.md)

## 参与贡献

- 提交想法或 Bug： [GitHub Issues](https://github.com/HaoRangQi/iGhosttyConfig/issues)
- 提交改进： Pull Request

## 许可证

[Apache-2.0 License](https://github.com/HaoRangQi/iGhosttyConfig/blob/main/LICENSE)
