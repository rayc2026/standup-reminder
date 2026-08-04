# 起身提醒

一款面向 Windows 10/11 的本地托盘提醒工具。默认连续使用电脑 50 分钟后建议活动 5 分钟，并提供系统通知、可选弹窗、锁屏/空闲判断、今日统计和可选 Codex MCP 集成。

> 本项目是非官方社区项目，与 OpenAI 不存在隶属、合作或背书关系。Codex 是 OpenAI 的商标；项目仅使用其名称准确描述可选的兼容功能，不使用 OpenAI 或 Codex 官方标识。

## 使用方式

- 安装版：运行 `起身提醒-Setup-*-x64.exe`，适合日常使用，支持开始菜单和开机启动。
- 便携版：运行 `起身提醒-Portable-*-x64.exe`，无需安装，默认不开启开机启动和 Codex 集成。
- 关闭主窗口不会退出应用；需要通过托盘菜单选择“退出”。

所有设置和统计保存在 Electron 的用户数据目录，不记录具体按键、鼠标位置或输入内容。托盘应用是唯一计时和数据源。

## Codex 集成

Codex 集成默认关闭。开启后，在设置页展开“MCP 连接配置”，将显示的配置加入 Codex。MCP 使用 stdio，并通过带随机令牌的 Windows 命名管道连接正在运行的托盘应用，不开放本地网络端口。

便携版不会依赖 Windows Toast 作为唯一提醒通道：即使系统通知未注册或被静默丢弃，也会保留非聚焦轻量弹窗，并独立播放已启用的系统提示音。为避免出现完全不可见的提醒，便携版不会在全屏时关闭这个弹窗兜底。“通知 + 轻量弹窗”会从第一次提醒开始显示弹窗。

Windows 托盘图标使用随程序打包的 PNG 资源，避免部分系统无法解析运行时 SVG 而显示为空白图标。

提供的工具：

- `get_status`
- `start_break`
- `snooze_reminder`
- `pause_reminders`
- `get_today_stats`
- `get_daily_summary`（按需总结模式）
- `update_settings`
- `acknowledge_codex_reminder`

“同步 + 计时控制”提供查询和计时操作；“只读同步 + 按需总结”开放本地数据摘要工具；“只读同步 + 状态检查”会在状态结果中提供防重复提醒标记。后两项不允许 Codex 修改托盘状态，并且需要 Codex 主动调用对应工具，应用不会自行向外部服务发送请求。

## 本地开发

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

生成安装版和便携版：

```powershell
pnpm dist
```

构建产物位于 `release/`。该目录不会提交到源码仓库；正式二进制文件应通过 GitHub Releases 发布，并附带版本说明和校验值。

## 开源许可

项目源码采用 [MIT License](LICENSE) 发布，版权归 rayc2026 及贡献者所有。第三方运行时及开发工具的许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

项目生成的配置和统计只保存在用户本地。发布者不应将个人用户数据目录、签名证书、令牌或构建密钥提交到仓库或 Release。

## 架构

- `src/main`：Electron 主进程、计时状态机、持久化、托盘、Windows 系统事件和命名管道。
- `src/renderer`：主面板、提醒弹窗、活动倒计时及空闲确认界面。
- `src/mcp`：Codex stdio MCP 适配器。
- `src/shared`：共享类型和默认设置。

运行时不访问互联网，也不包含遥测或自动更新。
