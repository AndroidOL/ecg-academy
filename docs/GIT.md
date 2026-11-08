# Git 与 GitHub

- Remote：`git@github.com:AndroidOL/ecg-academy.git`（SSH）
- Branch：`main`
- CI：`.github/workflows/ci.yml`

## 项目 SSH key

- 私钥：`.ssh/github_ecg_academy`（仅服务器本地，`.gitignore` 已排除）
- 公钥：`/tmp/ecg-academy-github.pub`（部署时由管理员加入 GitHub Deploy Key，勾选 write access）
- 不要在公开仓库、日志或截图中粘贴私钥。

初始开源提交由服务器已有的 GitHub 身份完成推送；项目专用 key 生成后，需要管理员在 GitHub 仓库 Settings → Deploy keys 中添加对应公钥，之后可使用：

```bash
./scripts/git-push.sh
```

## 自动 commit

`scripts/autocommit.sh` 会：

1. 对项目执行 `git add -A`；
2. 无变化时直接退出；
3. 检测私钥/API key 形态，命中则拒绝提交；
4. 以时间戳提交到本地 `main`。

自动 commit **不会自动 push**，避免把未审阅内容直接公开。系统级定时任务需服务器管理员确认后安装：

```cron
*/5 * * * * cd /www/wwwroot/ecg-academy && ./scripts/autocommit.sh >> storage/logs/autocommit.log 2>&1
```

也可以手动执行：

```bash
./scripts/autocommit.sh
```

## 敏感信息

以下文件只存在于服务器本地，已由 `.gitignore` 排除：

- `app/config.local.php`（数据库真实凭据）
- `docs/*.local.md`
- `.ssh/`
- `storage/sessions/`、`storage/logs/`、`storage/cache/`

公开文档只使用占位符。提交前可执行：

```bash
git diff --cached -U0 | grep -E 'PRIVATE KEY|sk-[A-Za-z0-9]{20,}'
```
