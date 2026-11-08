# 测试报告

测试日期：2026-11-07 ～ 2026-11-08
环境：PHP 8.4.27 · MySQL 8.4.13 · nginx 1.30.6 · Node 22.23.4 · 内存 3.5 GB

## 2026-11-08 v2.0.0 回归（20261108aq）

- PHP：每日挑战 9/9、学习考试 7/7、排行榜 2/2、班级作业 3/3、急救 14/14。
- Node：引擎 15/15、播放器 13/13、本地复习/BYOK 4/4。
- jsdom UI 15 组 0 控制台错误；浏览器 390×844：每日挑战全流程 12/12、激活顺序时间轴与 SVG 下载 10/10；三视口审计 0 横向溢出、0 控制台错误。

## 2026-11-08 最终回归（1.6.1 / 20261108ao）

- 内容校验：231 章 / 19 章节 / 185 主题 / 46 篇 ECG 文章，0 错误。
- 题库校验：诊断库 1920 道 + 章节库 1735 道，0 错误；诊断难度 1/2/3 = 320/880/720。
- 引擎 15/15；播放器 13/13；急救状态机 14/14；本地复习/BYOK 4/4；班级作业 3/3；学习考试 7/7；排行榜 2/2；每日挑战 9/9；jsdom UI 15 组 0 控制台错误。
- 浏览器：320×720、390×844、1280×900 共 42 个页面组合，0 横向溢出、0 控制台错误；复习/术语/关于/指南差异/学习考试/排行榜/10 场景/三行电轴/胸导联无回归。
- 12 导联截图确认底边 1 mV 校准标记与 `25 mm/s · 10 mm/mV` 标注。
- 班级作业：管理员创建→学生链接自动出题→提交后匿名统计 1 人/1 次；停用/删除生效；
- 无障碍自检：关键页面无可访问名称缺失的按钮/链接；焦点样式、aria-current、aria-live、降低动画已核对，真实辅助技术用户测试仍待进行。
- PWA：`/sw.js` 返回 application/javascript，`offline.html` 可访问；生产 HTTPS 注册后需在浏览器 Application 面板确认缓存。


## 总览

| 套件 | 命令 | 结果 |
|---|---|---|
| 内容结构与引用 | `php scripts/validate_content.php` | **46 篇诊断内容，0 错误，0 警告** |
| 231 章课程体系 | `php scripts/validate_curriculum.php` | **231 章 / 19 章节，0 错误** |
| 1920 道预生成题库 | `php scripts/validate_bank.php` | **1920 道，0 错误** |
| 1735 道章节题库 | `php scripts/validate_section_bank.php` | **1735 道 / 19 板块，0 错误** |
| 章节答案准确性 | `php scripts/audit_section_bank.php` | **1735 道，0 冲突** |
| ECG 波形引擎 | `node tests/engine.test.mjs` | **15/15 通过** |
| ACLS 状态机 | `php tests/sim.test.php` | **14/14 通过** |
| 本地复习/BYOK | `node tests/study.test.mjs` | **4/4 通过** |
| 班级作业 | `php tests/assignment.test.php` | **3/3 通过** |
| 学习考试/评级/锁定 | `php tests/learning.test.php` | **7/7 通过** |
| 排行榜排序/当前名次 | `php tests/leaderboard.test.php` | **2/2 通过** |
| 每日挑战/连续打卡 | `php tests/daily.test.php` | **9/9 通过** |
| 账号资料/Passkey 参数 | `php tests/profile.test.php` | **8/8 通过** |
| 访客统计/游客清理 | `php tests/traffic.test.php` | **5/5 通过** |
| 播放器/12 导联/标注 | `node tests/playback.test.mjs` | **13/13 通过** |
| 全链路 UI 冒烟 | `node tests/ui-smoke.mjs   # 15 组` | **15/15 组通过，0 控制台错误** |
| 生产 API | curl + 独立 Cookie/CSRF | **通过**（见下） |
| 静态资源 | 逐文件 HTTP 检查 | **全部 200** |
| 无头截图 | Chrome 150 headless | 受环境 SwiftShader 卡死限制，未完成像素级截图 |

## 1. 内容校验

```text
诊断总数: 46
 - foundation: 5
 - premature: 4
 - tachy: 7
 - brady: 3
 - block: 7
 - ischemia: 4
 - electrolyte: 6
 - structural: 4
 - skills: 6
警告 0 条，错误 0 条
```

校验内容：必填字段、章节合法性、ID 唯一性、鉴别诊断引用存在、ECG 合法 rhythm/morphology、st 结构、annotations 数组、难度/关键数字完整性。

## 2. ECG 引擎单测

`tests/engine.test.mjs` 覆盖：

- 正常窦性 8 s / 500 Hz 采样，无 NaN；
- P→R→T 顺序与极性、P/T 振幅；
- 窦缓心率估计；
- 12 导联全部生成；
- PVC 宽 QRS 形态；
- VT 宽 QRS 快节律；
- 房扑 2:1 与锯齿波；
- 房颤不规则性；
- 三度阻滞房室分离与慢心室率；
- 室颤幅度有界；
- 尖端扭转形态；
- 高钾 T 波高尖；
- STEMI ST 抬高；
- 相同 seed 的确定性。

```text
15 checks passed
```

## 3. ACLS 状态机测试

`tests/sim.test.php` 覆盖：

- 启动 VF 场景与监护状态；
- IV 建立需约 6 秒，建立完成前静脉药被拒绝；监护区提供常驻“立即建立 IV/IO 通路”按钮；
- CPR 期间生命体征显示 92–122 次/分的按压伪差频率并逐秒波动，但脉搏保持“无脉”；
- CPR → 充电 3 秒 → 停止按压 → 非同步放电的完整链路；
- 电击后短暂心室静止、观察期与复盘评分/事件读取；
- 症状性心动过缓：阿托品、经皮起搏夺获（监护转为 paced）、阶段转为“已稳定”；
- 高钾：IV、CPR、肾上腺素、钙剂；
- 心动过缓场景电击被拒绝并扣分；
- **长时间未处理**：心率与血压随时间下降，监护频率跟随实时生命体征；
- **超时/死亡评分封顶**：timeout 结局分数 ≤35、Grade D，复盘分数一致。

```text
14 passed, 0 failed
```

## 3.1 题库校验

`data/question_bank.php` 为 1920 道确定性病例（320 道 level 1、880 道 level 2、720 道 level 3；按章节 120–440 道）。校验项：

- 总数 ≥1000；
- 诊断/组合引用均存在于判读课程；
- ID 唯一、seed 为整数、题面与字段非空；
- 题库统计与按章节计数一致。

```text
Question bank: 1920 cases
Errors: 0
```

## 3.2 课程体系与导航

- 19 个章节、231 章；常见核心 140 章、不常见/进阶 90 章；
- 默认按难度排序；每页 24 章，分页避免一次渲染数百张卡片；
- 理论章无 ECG 时仍渲染学习目标、核心概念、判读应用、边界与必须记住；
- 校验脚本检查 ID 唯一、章节引用、难度、urgency、sections 内容、keyPoints。

```text
Curriculum: 231 chapters / 19 sections
Theory topics: 184 · ECG articles: 46
Errors: 0
```

## 4. 播放器 / 12 导联 / 标注测试

`tests/playback.test.mjs` 使用 jsdom + Canvas 2D stub 直接驱动真实 `ECGViewer`：

- 循环覆盖：进度向右推进，持久 trace layer 存在（不清除旧迹）；
- 连续滚动：窗口偏移持续推进（波形向左移动）；
- 12 导联：录播放进度推进；
- 12 导联 → 节律条切换：播放保持，不需要暂停/重播；
- 播放中切换导联：播放保持；
- P/T 标注吸附到真实 P/T 波；
- destroy 清理画布。

```text
Playback tests passed: 13
```

## 5. jsdom 全链路 UI 冒烟

`tests/ui-smoke.mjs` 使用真实浏览器 DOM（jsdom）+ Canvas 2D stub，启动实际前端模块与真实 API：

1. 首页：应用外壳、Hero、实时 ECG 画布；
2. 学习库：46 张诊断卡；
3. 文章页：正常窦性心律标题、完整文章、ECG 画布；
4. 练习：点击开始 → 服务端出题 200 → 选择选项 → 服务端判分 200 → 显示解析与下一题；
5. 实验室：双节律画布 + 标准 12 导联工作台；K/Ca/Mg 滑杆、预设、病例与自测更新；
6. 我的：资料、统计、排行榜渲染；
7. 急救列表：10 个场景（含 PEA 低血容量、低温、LAST、妊娠）；
8. 急救会话：启动场景 200 → 轮询状态 200 → CPR action 200 → 结束 action 200 → 复盘 200 → 显示分数。
9. 12 导联播放、12 导联→节律条切换、教科书面板与正常对照。
10. 理论章无 ECG 渲染；分页第 2 页；急救监护常驻 IV 按钮与按压频率。
11. 管理后台路由对访客显示登录保护表单。

```text
UI smoke passed: 15 groups, 0 console errors
```

## 5.1 管理后台验证

- 管理员密码登录 → `/api/admin/session` 200；访客访问 `/api/admin/session` 403。
- 注册/登录开关：关闭注册后新游客注册返回 403；关闭管理员密码登录后密码入口返回 403。
- WebAuthn：Playwright + CDP 虚拟认证器注册 Passkey，退出后使用 Passkey 重新登录成功；Passkey 仅支持 ES256。
- AI：使用本地 mock OpenAI-compatible `/chat/completions` 保存加密供应商、测试连接、启用后完成一次真实代理调用；随后删除测试供应商。
- 管理 API 的写操作均校验 CSRF，密钥只返回掩码。

## 6. 生产 API 验证

通过 nginx（`<base-url>`）实际请求：

| 用例 | 结果 |
|---|---|
| `GET /api/bootstrap` | 200，创建游客，返回 48 位 CSRF |
| 无 CSRF 的 POST | **419 `csrf_invalid`** |
| 注册（随机用户名） | 200，`isGuest=false` |
| 登出 | 200，随后 bootstrap 创建新游客 |
| 登录 | 200，`isGuest=false` |
| AI 聊天（未配置密钥） | 200，`source=local`、`fallback=true` |
| 组合题 `level=3` | 200，`multiple=true`，6 个选项 |
| 静态 CSS/JS/图标/manifest | 全部 200 |
| HTML 安全头 | CSP / X-Frame-Options / nosniff / Referrer-Policy 均存在 |

## 7. 浏览器像素验收

Chrome 命令行 `--screenshot` 在当前低配环境会卡在 SwiftShader；改用仅安装在 `/tmp/ecg-qa` 的 `playwright-core` + 系统 Chrome，按需启动、用完关闭，避免常驻占用内存。

已完成的截图/布局检查：

- 320 / 375 / 768 / 1440 × 首页、学习、文章、练习、实验室、我的、急救列表：横向溢出均为 **0**；
- 1440×900 与 390×844 急救会话截图：监护仪、阶段徽标、生命体征、IV/充电/CPR 控件布局正常；
- 移动端 CPR dock 固定于底部导航上方，随时可开始/停止按压；
- 12 导联与教科书模式截图（P/PR/QRS/T/QT 标注与对照）。

**仍建议在真实手机/桌面浏览器做一次人工视觉走查**，重点：iOS 安全区、长文章 TOC、低端机 Canvas 帧率。

## 8. 已知限制

- AI 需要管理员在 `app/config.local.php` 或环境变量中配置密钥；未配置时是本地知识库模式。
- 心电图是教学用途的形态学近似，不是诊断级 12 导联仿真。
- 急救评分是教学流程评分，不是临床能力认证。
- 游客进度依赖 Cookie；清除 Cookie 会创建新访客。注册后可跨设备。
- 未做真实患者数据/PHI 处理，符合教学站定位。

## 9. 回归命令

```bash
cd /www/wwwroot/ecg-academy

php scripts/validate_content.php
php scripts/validate_curriculum.php
php scripts/validate_bank.php
node tests/engine.test.mjs
node tests/playback.test.mjs
php tests/sim.test.php
node tests/ui-smoke.mjs   # 15 组

# 静态资源
for f in $(cd public && find static -type f); do
  curl -s -o /dev/null -w "$f %{http_code}\n" "<base-url>/$f"
done
```
