# 进度与交付状态

> 最后更新：2026-11-08。项目已完整交付并通过自动化验收。
> 新目录：`/www/wwwroot/ecg-academy`；数据库：`ecg_academy`；未触碰任何现有生产目录。

## 完成清单

- [x] 环境调研：PHP 8.4 / MySQL 8.4 / nginx / 资源限制 / 浏览器限制
- [x] 新建独立目录与 git
- [x] 数据库 `ecg_academy` 与 7 张表（users / user_progress / quiz_attempts / sim_sessions / sim_runs / auth_throttle / ai_usage）
- [x] 文档：README / PROJECT / ARCHITECTURE / DESIGN / RESEARCH / DATABASE / AI / API / TESTING / DEPLOYMENT / MEDICAL
- [x] 19 个章节、229 章课程（40 种判读诊断 + 183 个理论/病例专题）
- [x] 40 种诊断的 ECG 规格、标注、机制、标准、鉴别、处理、易错点
- [x] ECG 波形引擎（500 Hz、节律、早搏、阻滞、电解质、VT/VF/TdP、12 导联）
- [x] Canvas 渲染器（网格、扫描、标注、悬停测量、12 导联、双主题）
- [x] PHP API（会话/CSRF/注册登录、诊断、进度、判分、统计、排行榜）
- [x] 1200 道确定性预生成题库（40 诊断 × 25 + 8 组合 × 25，含校验脚本）
- [x] 服务端出题（单诊断/多诊断组合、干扰项、判分、XP、错题解析）
- [x] 6 个 ACLS 场景（VF、无脉 VT、不稳定 SVT、快速房颤、症状性心动过缓、高钾 PEA）
- [x] 动态生理：未处理时 HR/BP/SpO₂/ETCO₂ 与阶段持续演变；VF 粗颤→细颤；高钾 QRS 增宽→正弦波；起搏夺获
- [x] 急救操作时序：6 秒 IV/IO、3 秒充电、停止按压后放电、电击后短暂静止；超时/死亡评分封顶 ≤35 且 Grade D
- [x] 电解质实验室（K/Ca 滑杆、实时 ECG、危险分级、处理）
- [x] AI 兼容代理（错因解析、专项计划、急救复盘、文章问答；本地降级）
- [x] 双主题与手机/平板/桌面响应式
- [x] 循环覆盖 / 连续滚动双播放模式；12 导联录播放；切换模式/导联保持播放
- [x] 教科书模式（P/PR/QRS/T/QT 波形标注 + 正常对照）
- [x] 移动端满宽单列、44px 触控、16px 输入、安全区与移动操作面板重排
- [x] 生产 nginx vhost（新增文件）与部署环境可访问
- [x] 管理后台：数据库 settings、管理员密码 + WebAuthn Passkey、注册/登录开关、AI 多供应商/多模型、用户启停/角色/密码重置、审计日志
- [x] 课程导航：常见/不常见分离、默认难度排序、每页 24 章分页
- [x] 测试：内容 0 错误；课程 229/0 错误；题库 1200/0 错误；引擎 15/15；播放器 13/13；状态机 11/11；UI 冒烟 11/11；管理 API 通过
- [x] 医学手册导出 `docs/MEDICAL.md`（182 KB）

## 关键信息

- 数据库：`127.0.0.1:3306` / `ecg_academy`（真实账号密码只保存在本地 `app/config.local.php` 与 `docs/DATABASE.local.md`，均已 gitignore）
- 生产入口：由部署环境提供（公开文档不记录服务器地址）
- nginx：`/www/server/panel/vhost/nginx/ecg-academy.conf`（仅新增）
- PHP-FPM：`unix:/tmp/php-cgi-84.sock`
- Web 根：`/www/wwwroot/ecg-academy/public`
- 会话：`storage/sessions/`，`ECGLABSESS`
- AI：默认未配置密钥，本地模式；配置方式见 `docs/AI.md`

## 后续可迭代方向

1. 真机像素级走查（本机 Chrome headless 受 SwiftShader 限制；jsdom 已覆盖 DOM/交互）。
2. 为更多诊断增加多形态变体与电生理级 12 导联校准。
3. 增加错题本/收藏、教师班级、更多 ACLS 场景（PEA 低血容量、低温、局麻药中毒）。
4. AI 配置管理页（管理员），以及按用户 BYOK 的演示模式。
5. PWA 离线缓存与多语言（英文界面）。

## 注意

- 服务器内存有限：不要常驻 Playwright/Puppeteer；测试用 CLI + jsdom，浏览器逐个启动。
- 所有内容为教学用途，不替代临床判断。
- 修改静态资源后需更新 `app/config.php` 的 `asset_version` 以绕过 7 天缓存。
