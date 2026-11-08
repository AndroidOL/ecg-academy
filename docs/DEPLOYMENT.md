# 部署与运维

## 当前部署

| 项 | 值 |
|---|---|
| 测试目录 | `/www/wwwroot/ecg-academy` |
| 发布目录 | `/www/wwwroot/ecg.tianhao.me` |
| 生产域名 | `https://ecg.tianhao.me/` |
| Web 根 | `/www/wwwroot/ecg.tianhao.me/public` |
| 访问 | `https://ecg.tianhao.me/`（Demo：仅静态预览，不提供公开登录/AI；按负载调整状态） |
| 测试站 | `http://127.0.0.1:8791/`（本地开发） |
| nginx vhost | `/www/server/panel/vhost/nginx/ecg.tianhao.me.conf` |
| IP 直接访问 | `401`（`/www/server/panel/vhost/nginx/ecg-ip-401.conf`） |
| PHP-FPM | 8.4，`unix:/tmp/php-cgi-84.sock`，运行用户 `www` |
| 数据库 | `ecg_academy`，见 `docs/DATABASE.md` |
| 会话 | `storage/sessions/`，session 名 `ECGLABSESS` |
| 日志 | `/www/wwwlogs/ecg-academy*.log`、`storage/logs/php-error.log` |

> `/www/wwwroot/ecg-academy` 保留为测试站；`/www/wwwroot/ecg.tianhao.me` 为实际发布目录。生产根目录必须指向 `public/`，并对 SPA/API 使用 `try_files`。

## nginx 配置

```nginx
server {
    listen 80;
    server_name <server-ip> <your-domain>;
    server_tokens off;
    root /www/wwwroot/ecg-academy/public;
    index index.php;
    charset utf-8;
    client_max_body_size 1m;

    access_log /www/wwwlogs/ecg-academy.log;
    error_log  /www/wwwlogs/ecg-academy.error.log;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "DENY" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    location / { try_files $uri $uri/ /index.php?$query_string; }

    location ^~ /static/ {
        try_files $uri =404;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
        access_log off;
    }

    location = /index.php {
        include fastcgi.conf;
        fastcgi_pass unix:/tmp/php-cgi-84.sock;
        fastcgi_read_timeout 30s;
    }

    location ~ /\.(?!well-known) { deny all; }
}
```

变更后：

```bash
nginx -t && nginx -s reload
```

## 目录权限

```bash
cd /www/wwwroot/ecg-academy
chown -R www:www .
find . -type d -exec chmod 755 {} \;
find . -type f -exec chmod 644 {} \;
chmod 775 storage storage/sessions storage/logs storage/cache
```

`public/` 之外的文件不可被 Web 访问；`storage/` 与 `app/config*.php` 不得放进 Web 根。

## 从测试站发布

```bash
cd /www/wwwroot/ecg-academy
./scripts/deploy-production.sh
nginx -t && nginx -s reload
```

脚本保留生产目录的 `app/config.local.php`、`storage/master.key`、会话/日志/缓存和 `.user.ini`，只同步代码与内容；不会复制测试站的访问凭据。

生产 vhost 必须使用：

```nginx
root /www/wwwroot/ecg.tianhao.me/public;
location / { try_files $uri $uri/ /index.php?$query_string; }
```

独立 IP 拒绝规则放在 `ecg-ip-401.conf`；不要把它改成 Basic Auth，否则会拦截域名站点。

## 数据库初始化与备份

```bash
php scripts/migrate.php     # CREATE TABLE IF NOT EXISTS，可重复执行
php scripts/export_medical_md.php   # 可选：重新导出医学手册

mysqldump -u<local-user> -p --single-transaction --routines --triggers \
  ecg_academy > storage/backup-ecg_academy-$(date +%Y%m%d-%H%M).sql
```

恢复：

```bash
mysql -u<local-user> -p ecg_academy < storage/backup-ecg_academy-YYYYmmdd-HHMM.sql
```

## 本地开发

```bash
php -S 127.0.0.1:8791 -t public scripts/dev-router.php
```

`scripts/dev-router.php` 让静态文件走 PHP 内置服务器、其余请求进入 SPA/API。仅用于开发验收，不要用于公网生产。

## AI 配置

```bash
cp app/config.local.example.php app/config.local.php
# 编辑 base_url/api_key/model；或使用环境变量
ECG_AI_ENABLED=1
ECG_AI_BASE_URL=https://api.deepseek.com/v1
ECG_AI_API_KEY=sk-...
ECG_AI_MODEL=deepseek-chat
```

- 修改后无需重启 PHP-FPM（每次请求读取配置）；如使用 OPcache，确认 `config.local.php` 及时生效。
- `GET /api/ai/status` 检查 `configured`；不会返回密钥。
- 每日额度表 `ai_usage`；超时/失败自动降级。
- 密钥不要写入公开仓库或 `public/`。

## 日志与排障

```bash
tail -f /www/wwwlogs/ecg-academy.error.log
tail -f /www/wwwlogs/ecg-academy.log
tail -f storage/logs/php-error.log
mysql -u<local-user> -p ecg_academy -e 'SHOW TABLES;'
curl -s http://127.0.0.1/api/health
```

常见问题：

| 现象 | 检查 |
|---|---|
| 首页 404 | nginx vhost 是否 include；`server_name`/Host；root 路径；`nginx -T | grep ecg-academy` |
| 500 | PHP-FPM socket、storage 权限、`storage/logs/php-error.log` |
| 419 | 浏览器 Cookie 被禁用，或 POST 未带 `X-CSRF-Token`；刷新页面重新 bootstrap |
| AI 不生效 | `config.local.php` 是否被读取、curl 扩展、base_url 是否兼容、`/api/ai/status` |
| 会话丢失 | `storage/sessions` 是否可写；Cookie 是否被清理；反向代理是否改 Host |

## 回滚

本项目未改动既有站点，回滚只需：

```bash
rm /www/server/panel/vhost/nginx/ecg-academy.conf
nginx -t && nginx -s reload
# 如需彻底移除：
# rm -rf /www/wwwroot/ecg-academy
# mysql -u<local-user> -p -e 'DROP DATABASE ecg_academy;'
```

删除数据库前先备份；生产环境请谨慎执行。

## 性能与资源

- 零构建、无 CDN、无外部字体；首屏主要为 HTML/CSS/JS 与 40 条诊断摘要。
- ECG 按需生成：首页 1 条、学习库缩略图进入视口才绘制、12 导联按需渲染。
- Canvas DPR 上限 2；移动端只画 5 mm 主网格以降低密度。
- 服务器内存有限，未部署常驻 Node/Playwright；测试使用 CLI 与 jsdom。
- 若流量增大，可在 nginx 增加限流、为 `/api/` 单独配置 `limit_req`，并为 AI 设置更严格的每日配额。
