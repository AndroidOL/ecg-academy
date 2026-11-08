# 数据库连接与运维

> 本项目使用独立数据库 `ecg_academy`，不属于任何现有生产站点。
> **公开仓库不包含数据库凭据。** 实际连接信息保存在服务器本地、被 `.gitignore` 忽略的：
> - `app/config.local.php`
> - `docs/DATABASE.local.md`
>
> 部署到新环境时，复制 `app/config.local.example.php` 为 `app/config.local.php` 并填写自己的数据库账号。

## 连接信息（占位）

| 项 | 值 |
|---|---|
| Host | `127.0.0.1` |
| Port | `3306` |
| Database | `ecg_academy` |
| Charset | `utf8mb4` |
| Collation | `utf8mb4_unicode_ci` |
| User | 由本地 `config.local.php` 提供 |
| Password | 由本地 `config.local.php` 提供 |

本地连接示例：

```bash
mysql -u<local-user> -p ecg_academy
```

PHP PDO 由 `app/Db.php` 从 `app/config.php` + `app/config.local.php` 读取；凭据不会进入 Web 根目录。

## 建库与迁移

```bash
cd /www/wwwroot/ecg-academy
php scripts/migrate.php
```

迁移脚本使用 `CREATE TABLE IF NOT EXISTS`，可重复执行。表结构定义见 `app/Schema.php`。

## 数据表

| 表 | 用途 |
|---|---|
| `users` | 游客与注册用户、XP、主题偏好；`is_admin` / `is_active` / `ai_daily_limit` |
| `user_progress` | 每篇文章的“已读/已掌握”进度 |
| `quiz_attempts` | 练习出题快照、用户答案、判分结果 |
| `sim_sessions` | 急救模拟实时状态（JSON） |
| `sim_runs` | 急救模拟完成记录与复盘 |
| `auth_throttle` | 登录/注册失败限流 |
| `ai_usage` | AI 每日配额 |
| `app_settings` | 数据库驱动站点/AI/登录配置；键包括 `ai.byok_enabled`、`ai.allow_guest`、`ai.daily_limit`、站点信息等 |
| `admin_passkeys` | 管理员 WebAuthn 公钥、credential ID、计数器 |
| `admin_audit` | 管理操作审计 |

## 备份与恢复

```bash
mysqldump -u<local-user> -p --single-transaction --routines --triggers \
  ecg_academy > storage/backup-ecg_academy-$(date +%Y%m%d-%H%M).sql

mysql -u<local-user> -p ecg_academy < storage/backup-ecg_academy-YYYYmmdd-HHMM.sql
```

## 安全

- 数据库只监听回环地址；Web 根仅为 `public/`。
- 真实凭据只存在于本地忽略文件；公开仓库使用占位符。
- 正式长期运行建议创建仅授权本库的专用账号，而不是 root。
- 不要把 `app/config.local.php`、`docs/*.local.md`、`storage/master.key`、`storage/` 推送到远端；`.gitignore` 已包含它们。
- 首次使用管理后台前执行 `php scripts/create_admin.php --username=admin --write-local`；`docs/ADMIN.local.md` 仅在本地保存初始密码。
