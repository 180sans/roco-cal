# 插件诊断日志

诊断功能默认开启，开发版和正式 exe 均会记录，不需要控制台或额外开关。
需要重新构建包含本次修改的 exe/setup；旧安装包不会自动获得此功能。

## 转发给反馈者

1. 关闭旧插件，只启动这次提供的版本，正常绑定游戏窗口。
2. 分别点击插件、点击游戏，再测试 F8、F9 和失效的组合快捷键，记下大致发生时间。F9 会收缩／展开插件，测试后可再次按下恢复。
3. 如果出现界面消失或快捷键无响应，请先保留现场几秒钟，再退出插件。
4. 按 Win+R，输入 `%APPDATA%\com.sans.rocodatebase\diagnostics` 并回车。
5. 将整个 `diagnostics` 文件夹压缩发送，附上游戏客户端名称、失效快捷键、发生时间和操作顺序。也可以从程序现有的配置目录入口进入，再打开 `diagnostics` 子文件夹。

日志写入程序实际使用的用户数据目录。少数环境中如果 APPDATA 被重定向，以程序配置目录为准。

## 记录范围

- `session.start`：程序版本、exe 路径及修改时间、正式／调试模式、Windows 版本、资源目录、用户目录、本进程管理员权限。
- `window.attach_request` / `window.owner_set` / `window.attached`：输入句柄、owner 设置后的实际回读、Win32 错误、目标进程路径和权限。
- `window.foreground` / `window.state_change` / `window.heartbeat`：前台、目标和插件的句柄、进程 ID、标题、窗口类、owner、parent、root、Z 序相邻窗口、可见／最小化状态、位置大小、DPI、样式位、穿透及收缩状态。状态变化时记录，不变时每 15 秒记录心跳。
- `window.mouse_down_sample`：绑定状态下每 100 毫秒采样发现的鼠标左键按下及当时窗口关系。采样可能漏掉极短的点击，不作为“用户未点击”的证据。
- `window.sync_failed` / `window.tracking_failed`：窗口跟踪失败及相关 Win32 错误。
- `shortcut.config_loaded` / `shortcut.register` / `shortcut.reconfigure_result`：配置、每个快捷键是否注册成功、错误码及修改配置的结果。错误码 1409 通常表示热键已被注册。
- `shortcut.hook_install` / `shortcut.hook_observed`：低级键盘钩子的安装情况和已配置快捷键相关按键的观察结果。仅观察配置相关的功能键或带 Ctrl／Alt 的相关主键，不记录普通文字输入。
- `shortcut.received` / `shortcut.skipped` / `shortcut.emit`：全局热键消息是否抵达、是否因未绑定／收缩而跳过、前端事件是否发送成功。
- `frontend.listener.*`：实际业务监听器的挂载、接收、调用和卸载。`dispatched` 表示已调用监听器，不代表异步业务已经成功。
- `frontend.command.*`：绑定、识别、采集和计算等命令的开始、耗时、成功或错误。不记录请求中的图片和战斗数据。
- `frontend.battle.error` / `frontend.target.status`：业务错误和窗口绑定反馈；另有前端焦点、可见性、心跳、未处理异常，以及 Rust panic 和正常退出记录。

## 分析顺序

1. 先对照启动版本、目标 HWND、root、实际 owner 和双方权限，检查绑定对象与关系。
2. 界面消失时区分 `collapsed`、`minimized`、`visible` 和窗口位置。`visible=true` 不等于没有被遮挡；Z 序和前台记录只是判断遮挡的线索。
3. 快捷键先检查注册，再看钩子观察、全局热键接收、事件发送、前端接收及命令结果。
4. 有钩子观察但无全局热键消息，可结合注册冲突、权限、客户端拦截继续判断；无钩子观察也不能单独证明用户没按键。
5. 无前端接收时看监听器是否就绪、是否卸载、前端心跳是否仍在；有接收但无命令时看业务错误和当前页面状态。

## 文件与限制

每个进程使用 `plugin-进程号.jsonl`，并保留 `.jsonl.1` 到 `.jsonl.3` 三个轮转备份，每份约 4 MiB；不同进程的日志分别保留。JSONL 使用 UTF-8，每行包含 UTC 毫秒时间、启动后耗时和进程／线程标识。

日志由独立线程写入；队列满时不会阻塞快捷键，后续行会标记丢弃数量 `droppedBeforeThisRecord`。正常退出尽量排空队列；强制结束、断电、磁盘不可写或原生崩溃可能缺少末尾记录。

日志包含相关进程路径和窗口标题，发送前可自行检查。仅记录诊断状态，不调整窗口层级、绑定策略或快捷键行为。
