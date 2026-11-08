# 测试报告

测试日期：2026-11-07 ～ 2026-11-08
环境：PHP 8.4.27 · MySQL 8.4.13 · nginx 1.30.6 · Node 22.23.4 · 内存 3.5 GB

## 总览

| 套件 | 命令 | 结果 |
|---|---|---|
| 内容结构与引用 | `php scripts/validate_content.php` | **46 篇，0 错误，0 警告** |
| ECG 波形引擎 | `node tests/engine.test.mjs` | **15/15 通过** |
| ACLS 状态机 | `php tests/sim.test.php` | **6/6 通过** |
| 播放器/12 导联/标注 | `node tests/playback.test.mjs` | **13/13 通过** |
| 全链路 UI 冒烟 | `node tests/ui-smoke.mjs` | **9/9 组通过，0 控制台错误** |
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
- IV → CPR → 除颤流程；
- 复盘评分/事件读取；
- 症状性心动过缓：阿托品、起搏；
- 高钾：IV、CPR、肾上腺素、钙剂；
- 心动过缓场景电击被拒绝并扣分。

```text
6 passed, 0 failed
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
5. 实验室：两个 ECG 画布，钾滑杆更新；
6. 我的：资料、统计、排行榜渲染；
7. 急救列表：6 个场景；
8. 急救会话：启动场景 200 → 轮询状态 200 → CPR action 200 → 结束 action 200 → 复盘 200 → 显示分数。
9. 12 导联播放、12 导联→节律条切换、教科书面板与正常对照。

```text
UI smoke passed: 9 groups, 0 console errors
```

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

## 7. 浏览器像素验收说明

当前服务器上 Chrome 150 的 headless 截图/DOM 模式在渲染进程卡在 `SwiftShader`（进程处于 `D` 状态），连简单 `data:` 页面截图也会挂起；这是运行环境限制，不是站点 JS 错误。为避免拖垮同机生产站点，没有继续运行浏览器；改用：

- jsdom 执行真实应用模块与 API（覆盖页面渲染和交互）；
- 逐文件 HTTP 200 检查；
- CSS 断点静态审查（390 px / 768 px / 1024 px / 1440 px）；
- 无内联脚本、无外部 CDN、无字体外链，降低真机差异。

**仍建议在真实手机/桌面浏览器做一次人工视觉走查**，重点：12 导联横向滚动、长文章 TOC、模拟器监护仪高度、iOS 安全区底部导航。

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
node tests/engine.test.mjs
node tests/playback.test.mjs
php tests/sim.test.php
node tests/ui-smoke.mjs

# 静态资源
for f in $(cd public && find static -type f); do
  curl -s -o /dev/null -w "$f %{http_code}\n" "<base-url>/$f"
done
```
