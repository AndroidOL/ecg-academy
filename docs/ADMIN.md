# 管理后台

入口：`/#/admin`

## 当前本地部署

管理员用户名：`admin`。密码只保存在本地忽略文件 `docs/ADMIN.local.md`，不进入公开仓库；后台入口 `/#/admin`。

## 首次创建管理员

管理员账号只保存在数据库，公开仓库不包含任何密码。首次部署或忘记密码时：

```bash
cd /www/wwwroot/ecg-academy
php scripts/migrate.php
php scripts/create_admin.php --username=admin --write-local
```

脚本会生成随机强密码并写入 **仅本地、已 gitignore** 的 `docs/ADMIN.local.md`；也可通过环境变量提供：

```bash
ECG_ADMIN_PASSWORD='换成至少12位的强密码' php scripts/create_admin.php --username=admin
```

已有账号再次执行会重置密码并确保 `is_admin=1, is_active=1`。

## 登录方式

- **密码**：默认开启；管理员密码与普通用户密码分离控制。
- **Passkey（WebAuthn）**：在后台「安全与登录」注册。要求 HTTPS，或 `http://localhost`（WebAuthn 不接受普通 IP 作为 RP ID）。
- 关闭「允许管理员密码登录」前必须已有至少一个 Passkey；服务端会拒绝造成自锁的保存。
- 两种登录方式不能同时关闭。

## 配置项

| 区域 | 能力 |
|---|---|
| 站点开关 | 允许注册、允许普通用户登录、管理员密码登录、管理员 Passkey 登录 |
| AI | 总开关、普通用户每日额度、默认供应商、补充系统提示词、BYOK 演示开关 |
| AI 供应商 | OpenAI / DeepSeek / OpenRouter / 通义千问兼容模式 / 硅基流动预设，或任意 OpenAI-compatible Base URL；可保存多个模型 |
| 站点信息 | GitHub 链接、许可证说明、版权、ICP 备案号 |
| 用户 | 搜索、手动创建用户、启用/停用、设为/移除管理员、每日 AI 额度覆盖、重置密码 |
| 班级作业 | 创建匿名作业链接、按难度/章节/专项筛题、查看人数/次数/平均分/正确率、停用/删除 |
| 安全 | 注册/删除管理员 Passkey；查看审计日志 |

API Key 使用 AES-256-GCM 加密后存入 `app_settings`，密钥文件为 `storage/master.key`（已 gitignore，首次使用时自动创建，权限 0600）。前端与审计日志只显示掩码。

## 数据库直接恢复

如果密码登录和 Passkey 都不可用，可在服务器上执行：

```bash
php scripts/create_admin.php --username=admin --write-local
```

该命令只写入数据库并输出到本地忽略文件；不要在公开仓库、工单或聊天中粘贴密码。

## 限制与注意

- 后台 API 全部在服务端校验 `is_admin=1`、账号启用与 CSRF；普通用户无法通过隐藏 URL 访问。
- Passkey 目前支持 ES256（平台 Passkey 的常见算法）；不支持的安全密钥会明确报错。
- AI 供应商必须是 OpenAI-compatible `/chat/completions`；非兼容协议需要适配层。
- 审计日志最多保留最近记录用于界面展示；生产可按需设置数据库归档。

## 内容审阅与勘误（只读台账）

- 章节审阅状态在 `data/review.php`，当前全部为“编辑核对 · 待临床同行审阅”；后台不提供一键“认证”按钮，避免把编辑操作误当医学审阅。
- 修订流程：改内容/来源 → 更新 `lastChecked` → 跑校验 → 更新 `data/corrections.php` 与静态 `public/static/js/data/corrections.js` → 发布。
- 文章页展示审阅条与来源；`#/about` 展示版本化勘误；GitHub Issue 接收报告。
- 医学顾问加入后，在对应章节写 `clinicalReviewers` 与 `status=clinical_reviewed`，并更新版本记录。

## BYOK 风险提示

- 后台开启 `ai.byok_enabled` 后，用户可自带 API Key；密钥只存在浏览器当前标签页，经本站服务器转发。
- 服务端拒绝 HTTP、localhost、私网/保留 IP，禁止重定向；不落库、不写日志。
- 仍建议仅在演示/培训环境开启；不要让用户输入生产环境高权限密钥。
