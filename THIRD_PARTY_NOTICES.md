# Third-party notices

起身提醒本身采用 MIT License。以下组件由各自的版权所有者提供，并受各自许可证约束。本文件用于帮助源码与二进制发布者保留必要的第三方许可信息；完整、权威的许可证文本以相应软件包及其上游仓库所附文件为准。

## 随应用分发的主要组件

| 组件 | 版本 | 许可证 | 上游项目 |
| --- | --- | --- | --- |
| Electron | 43.2.0 | MIT；同时包含 Chromium 等第三方许可 | https://github.com/electron/electron |
| @modelcontextprotocol/node | 2.0.0 | MIT / Apache-2.0 许可过渡，详见包内 LICENSE | https://github.com/modelcontextprotocol/typescript-sdk |
| @modelcontextprotocol/server | 2.0.0 | MIT / Apache-2.0 许可过渡，详见包内 LICENSE | https://github.com/modelcontextprotocol/typescript-sdk |
| Zod | 4.4.3 | MIT | https://github.com/colinhacks/zod |

Electron 二进制分发中包含 `LICENSE.electron.txt` 和 `LICENSES.chromium.html`。打包或重新分发应用时请保留这些文件。Model Context Protocol SDK 正在从 MIT 向 Apache-2.0 迁移，重新分发时请保留所安装版本中的完整 `LICENSE` 文件。

## 仅用于开发和构建的直接依赖

| 组件 | 版本 | 许可证 |
| --- | --- | --- |
| @types/node | 26.1.2 | MIT |
| electron-builder | 26.15.3 | MIT |
| tsup | 8.5.1 | MIT |
| TypeScript | 7.0.2 | Apache-2.0 |
| Vite | 8.2.0 | MIT |
| Vitest | 4.1.10 | MIT |

传递依赖及其精确版本记录在 `pnpm-lock.yaml` 中。安装依赖后，可在每个包的 `package.json` 与 `LICENSE` 文件中查阅完整许可内容。

## 商标

OpenAI 和 Codex 是 OpenAI 的商标。本项目为独立的非官方社区项目，未获得 OpenAI 的赞助、认可或背书。项目名称、图标和主要品牌不包含 OpenAI 标识。
