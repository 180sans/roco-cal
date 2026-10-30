# 前端代码归属

职责调整复用原实现；共享订阅和计算规则在唯一模块维护。样式删除记录见 U10，页面 JSX、业务参数和状态更新顺序保持原契约。

## 入口与功能

- `App.tsx`：页签组合、应用数据加载、窗口状态与公共上下文。
- `features/battle/TeamBattlePage.tsx`：队伍页面状态、effects、页面布局及 Hook 组合。
- `features/battle/useBattleRecognition.ts`：原识别、OCR 与校准流程；显式接收页面依赖，不新增 state/effect/memo/ref。
- `features/battle/`：技能卡片、加成、Buff、速度、队伍栏与结果展示。
- `features/presets/`：精灵预设管理。
- `features/settings/`：界面配置、尺寸参数和爆发效果配置。
- `features/watch/`：关注技能配置与展示。
- `features/units/`：形态、特性、天分及性格编辑。
- `features/plugin/`：悬浮面板框架、拖拽注册、布局与识别区域配置。

- features/battle/useBattleCalculation.ts：9 个原计算/应用函数；41 项依赖直接接收页面原身份，保留每次 render 的闭包；不新增生命周期。

## 公共实现

- `components/common/`：图标、按钮、字段标签和数字输入框。
- `components/picker/`：统一选择器和技能信息展示。
- `domain/`：已有单位状态转换、精灵索引及常量。
- `shared/errors.ts`：已有错误文本转换。
- shared/pointerTracking.ts：6 处即时拖动的共同监听/停止；调用方保留坐标/边界和是否监听 cancel。长按继续使用 pluginLongPressDrag，不把两者策略强行合并。
- `numericOcr.ts`：主程序与回放共用的数字 OCR 图片预处理；应用保持自己的识别适配和数据目录，不再复制预处理实现。
- `services/`：第一项优化统一的桌面命令、数据类型与 Promise 缓存。

## 请求与保存流程（2026-10-28）

- `services/configSaveQueue.ts`：配置提交、原有保存前/发布前操作及完整配置回写的唯一队列实现；主程序和回放分别创建自己的队列。
- `services/configSaves.ts`：主程序配置保存入口；回放使用自己的 `replay-app/src/configSaves.ts` 适配同一队列机制。页面不直接调用原始保存命令。
- `services/optimisticConfig.ts`：乐观修改的待保存状态、版本与最后成功值；`useOptimisticConfig.ts` 提供主前端 Hook。关注技能、OCR 开关和密度设置不再各写一套回滚算法。
- `services/latestRequest.ts`、`useLatestRequest.ts`：按结果区域管理有效请求，依赖变化与卸载时禁止旧结果、旧错误和旧加载状态回写；不会取消原生后台任务。
- 普通、快捷、敌方攻击、意志力与反推威力会更新同一组结果状态，因此共享结果发布权限；列表、左右速度特性和选择器使用各自独立的请求作用域。
- `domain/battleRequests.ts`：攻守侧别选择及双方队伍加成组装。各命令保留自己的专属字段，OCR 特性候选固定使用我方，敌方技能选择继续复用原对局快照。

## 后续修改规则

1. 在所属文件修改现有实现；其他地方直接导入，不再复制一份。
2. 页面引用公共组件，公共组件不反向引用页面；功能模块不导入 `App.tsx`。
3. 主程序桌面命令通过 `desktopApi`；配置提交使用 `saveConfigPatch`，查询/计算结果使用公共请求作用域。缓存保留现有键和拒绝 Promise 的行为。
4. 图标上下文及缓存只在 `EntityLabel.tsx` 创建；拖拽注册表只在 `PluginPanels.tsx` 创建。
5. `TeamBattlePage` 继续持有页面状态和调度；公共服务负责保存顺序和响应有效性，领域模块负责请求组装，不修改 UI、计算公式与业务参数。
6. 计算/应用流程在 useBattleCalculation，识别与校准流程在 `useBattleRecognition` 维护；页面保留原状态、refs 和回调并传入，Hook 每次 render 创建原闭包，不引入额外缓存或生命周期。

## 样式维护（U10，2026-10-28）

- src/styles.css 维护当前主程序的规则；回放继续拥有自己的独立样式，主样式不再保留旧回放/采样页面的副本。
- 相同组件结构和插件/Portal 主题使用共同选择器列表；尺寸、普通/插件模式和交互状态差异在所属规则维护。修改现有共同声明，不再从文件末尾追加一份覆盖补丁。
- src/ui-tokens.css 仍由既有参数规范生成，不手工统一默认值/范围/回退的差异。
- node scripts/test-styles.mjs 对照固定修改前层叠契约；静态结果不能替代原生界面实测。

## 定向检查

- `node scripts/test-feature-modules.mjs`：模块归属、单例和循环依赖。
- `node scripts/test-shared-numeric-ocr.mjs`：唯一预处理归属、双倍尺寸、灰度像素、透明度和原错误语义。
- `node scripts/test-desktop-api.mjs`：命令、配置保存和缓存契约。
- `node scripts/test-flow-unification.mjs`：保存队列、窗口准备/调整顺序、回放适配、乱序请求、卸载和乐观回滚。
- `node scripts/test-battle-request-unification.mjs`：24 组修改前固定契约、完整请求字段及原状态更新、双方加成、对局快照和跨命令乱序响应。
- 现有回归脚本通过 `scripts/helpers/application-source.mjs` 定位真实源码。
- `node scripts/test-implementation-split.mjs`：对照迁移前固定契约，检查识别函数、页面剩余声明及顺序、原 JSX、依赖接线与 Rust 平台模块。
- 迁移审计可给模块检查脚本追加迁移前 `App.tsx` 路径，逐项比较原声明。

上述流程优化不涉及 UI 调整、业务算法修改或 Rust/Python 职责调整。

## 原生命令与计算规则收尾（2026-10-28）

- src-tauri/src/commands/data.rs：19 个非战斗查询/持久化/推理/文件及计时命令，只调用原 Rust 适配。
- commands/battle.rs：原 10 个战斗与探测命令，调用 runtime/python；battle_commands.rs 的白名单和两条常驻路由不变。
- commands/window.rs：6 个原窗口命令；platform/windows 继续是窗口与采集唯一平台实现，root 保留状态、路径和启动组合。
- Python core/damresult.py::_resolve_usage_values：逐次使用的雷暴追加与按原序 effect 归一化/威力/连击修正唯一入口；powers_only 保留原忽略 combo 算术而仍归一化 key 的差异。
- 回归 33 PASS、0 FAIL、3 项资源 SKIP；固定原页面/插件源码展开契约、864 组 usage 边界和 24 组引擎输出对照。主前端仍有原 configs.json 缺失诊断，不冒充完整应用通过。
- 全部 35 个命令及 root 的窗口创建相关函数可用 test-native-platform.mjs 做独立 metadata 类型检查；此宿主不执行 native、资源、推理或 Python 操作。真实运行时另由原轻量测试验证，不构建完整应用。
