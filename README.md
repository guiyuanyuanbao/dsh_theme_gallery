# 画廊 Gallery — DSH 壁纸主题插件

给 DeepSeek Harness Web 界面换壁纸，并为每一张图片单独求解一整套配色。

内置三张壁纸，也可以上传自己的图片或粘贴图片链接 —— 配色从图片像素本身算出来。

![三套内置主题](preview.png)

## 特性

| | |
|---|---|
| **壁纸** | 3 张内置图，外加任意你添加的图；每张都带浅色与深色两套完整配色（113 个 alias token） |
| **添加壁纸** | 上传文件、拖入页面、或粘贴图片链接；配色在浏览器里从图片像素实时求解 |
| **配色如何生效** | `theme.overrideTokens()` 叠加一层 token，浅色/深色/跟随系统仍由「外观」控制 |
| **背景** | 画在 `<html>` 上，作为画布层 |
| **切换入口** | 只在设置里，侧边栏不注册任何切换按钮 |
| **设置页** | 壁纸选择器（带预览）、添加流程、压暗、模糊、四个页面的独立不透明度、删除 |
| **持久化** | 选中项、压暗、模糊、各页面不透明度都是 Host `Config` 字段，写在 `$DSH_PROFILE_DIR/cordis.patch.yml`；壁纸库在 `$DSH_HOME/theme-gallery/v1/` |
| **预绘制** | Host 注入 head 脚本与样式表，保存的壁纸在首次绘制前就位，不会闪一下 |

内置三张图：

| Slug | 标题 | 源图 | 主色相 | 暗部占比 | 中位色 | 高光 |
|---|---|---|---|---|---|---|
| `shatter` | 碎镜 Shatter | `sources/shatter.png` | 225° | 30% | `#323f6c` | `#f0f5fc` |
| `portrait` | 逆光 Portrait | `sources/portrait.png` | 225° | 57% | `#212334` | `#fafcff` |
| `stage` | 舞台 Stage | `sources/stage.png` | 235° | 58% | `#161526` | `#bac2ff` |

## 安装

这是一个 DSH profile 插件包。`package.json` 里的 `dsh.bundle.patch` 让它自行挂载，不需要手工编辑 profile 的 `cordis.patch.yml`。

### 从 GitHub URL 安装（推荐）

```
plugin_manager install_bundle
  target: https://github.com/guiyuanyuanbao/dsh_theme_gallery.git
```

或命令行：

```bash
dsh plugin --profile <profile> install https://github.com/guiyuanyuanbao/dsh_theme_gallery.git
```

### 本地克隆后安装

```bash
git clone https://github.com/guiyuanyuanbao/dsh_theme_gallery.git
```

然后用 `plugin_manager` 的 `install_bundle`，`target` 指向克隆出来的绝对路径。

### 手工加入 profile

在 `$DSH_PROFILE_DIR/package.json` 的 `dependencies` 里加一行，再装一次：

```json
{
  "dependencies": {
    "dsh-theme-gallery": "github:guiyuanyuanbao/dsh_theme_gallery"
  }
}
```

### 装完之后

Host 那一半需要重启 DSH 才生效。纯前端改动刷新页面即可。

### 版本要求

| 要求 | 范围 |
|---|---|
| `engines.dsh` | `>=0.2.0-rc.2 <0.3.0-0` |
| `@deepseek-ai/dsh-home-paths` | `>=0.2.0-rc.2 <0.3.0-0` |
| `@deepseek-ai/schemastery` | `~3.18.4` |

从 git 或 tarball 安装时，安装器无法在下载前预检版本，只能装完再校验。版本不满足时会报 `incompatible-version`。

## 使用

- **切换壁纸** —— 设置 → 壁纸，点一张卡片。卡片显示的就是那张壁纸本身，点下去立刻应用它的配色。
- **调整观感** —— 同一页有压暗程度、背景模糊，以及每个页面的不透明度。
- **让某个页面更好读** —— 把它的不透明度滑块往右拉。`0%` 完全透明、`100%` 完全不透明，所以「太透」就往**上**调。
- **恢复求解值** —— 点「恢复求解值」，把当前壁纸的不透明度退回配色求解时实测的值。
- **添加壁纸** —— 选文件、拖入、或粘贴链接后点「从链接添加」。分析通常一两秒，保存后自动选中。

每个壁纸的设置按主题分别记忆。没调整过的壁纸停在它自己的求解值上。

### 四个不透明度滑块

| 滑块 | 作用元素 | 重述的 token |
|---|---|---|
| 设置面板 | `[role="dialog"]` | `--dsw-alias-bg-layer-2` |
| 侧边栏 | `[class*=sidebarCol]` | `--dsw-specific-sidebar-fill` |
| 聊天页面 | `[class*=root][data-phase]` | `--dsw-alias-bg-base` |
| 输入框 | 输入框座位下的 `[class*=card]` | `--dsw-specific-input-major` |

四个页面用的是不同的全局 token，所以只能分别调；改一个共享 token 会把四个一起压平。

插件只给这四个页面本身重新上色。除此之外不碰任何元素：输入框座位（`[data-composer-seat]`）上那条 `transparent → bg-base` 渐变遮罩、以及各个 `*_frame` 部件自己的底色，都留给 DSH 原样绘制。

聊天页面用 `[data-phase]` 定位，因为它只出现在会话根节点上——也就是真正画 `bg-base` 的那一个元素。早先用的是 `[class*=frame]`，它会顺带命中聊天视图、回合导航、附件缩放、子代理卡片、右侧栏和文档预览里共七八个同样叫 `*_frame` 的部件，并在它们已经画好的底色上再叠一层。

输入框之所以能独立调节，是因为 DSH 本来就用 `--dsw-specific-input-major` 画它，而求解给这个 token 的透明度（0.59–0.69）与聊天页面的 `bg-base`（0.44）不同。

## 工作原理

### 配色是求解出来的

每张图先被分析出主色相、明暗分布、中位色与高光，然后对 113 个 token 逐个求解透明度：在给定的对比度下限下，求出最透的那个值。这样壁纸能透出来，文字又还看得清。

求解结果在 `tools/palette.json`，生成的 token 表在 `theme-data.js`（内置图）和浏览器端（自定义图）。

### 壁纸跟随明暗模式

配色按浅色/深色各解一套。系统切到深色，壁纸跟着换到深色那套。插件的 token 层始终覆盖在当前主题之上，不接管「外观」那一行的所有权。

### 浏览器求解，Host 落盘

```
   ┌─ 浏览器 ───────────────────────┐        ┌─ Host ──────────────────────┐
   │ canvas 解码图片                 │        │                             │
   │ 重采样到 2560px                 │        │                             │
   │ 分析像素 ─► 求解配色            │  POST  │ 校验、写入图片与配色、        │
   │ 重新编码为 JPEG                 │ ─────► │ 更新 index.json              │
   └────────────────────────────────┘        └─────────────────────────────┘
```

Host 是 Node，没有图片解码器。浏览器有 `createImageBitmap` 和 `getImageData`，能解用户手上几乎所有格式，而且它正是要绘制这张图的解码器，所以配色就是从用户最终看到的那些像素推出来的。

抓取 URL 由 Host 做：浏览器的跨域限制会让大部分图片链接直接失败。抓取有大小上限、内容类型嗅探和超时。

### 不透明度是绝对的

`0%` 完全透明，`100%` 完全不透明，在任何主题、任何页面上含义都一样。

实现上有一点必须做对：

```css
background-color: color-mix(in srgb,
  rgb(from var(--dsw-alias-bg-layer-2) r g b / 1) var(--dsh-gallery-opacity-panel, 100%),
  transparent);
```

`color-mix` 对 `transparent` 是**缩放** alpha（产出 `alpha × P/100`），所以直接混合 token 只能让它更透明，永远到不了需要的不透明度。`rgb(from C r g b / 1)` 丢掉 token 自己的 alpha，只取颜色通道，于是混合结果正好是请求的值。

不支持相对颜色语法或 `color-mix` 的浏览器会丢弃整条声明，回落到求解值。

## 项目结构

```
dsh_theme_gallery/
├── package.json          dsh.bundle.patch / dsh.client / files / engines / peerDependencies
├── cordis.patch.yml      这个 bundle 挂载的那一行
├── index.js              Host：Config、路由、预绘制注入
├── api.js                Host：自定义主题 API 与校验
├── store.js              Host：磁盘上的壁纸库、URL 抓取
├── theme-data.js         内置三张图生成的配色表
├── client.js             浏览器端：求解器、画布、设置页（生成文件，不要手改）
├── assets/               三张壁纸，2560px JPEG q82（随包安装）
├── sources/              三张原始 PNG（随仓库分发，不随包安装）
├── preview.png           上面那张总览图
├── tools/                构建与验证工具（不随包安装）
└── README.md
```

`package.json` 的 `files` 字段决定哪些文件随包安装：`assets/` 会，`sources/` 和 `tools/` 不会。

## 构建与验证

需要 Python 3.10+（`numpy`、`pillow`）与 Node 18+。

```bash
python tools/build_palettes.py    # 从原始图重建配色与 client.js
python tools/build_preview.py     # 重新生成总览图

python tools/verify.py
python tools/verify-compat.py
python tools/verify-scrim-defects.py
python tools/verify-guard.py
node tools/verify-solver.mjs
node tools/verify-inlined.mjs
node tools/_runstore.mjs
node tools/_runapi.mjs
node tools/_rune2e.mjs
node tools/verify-behaviour.mjs client.js
node --check client.js
```

部分检查要读 DSH 自己的文件（主题样式表、peer 依赖）。它们会自动探测本机安装，找不到时跳过并说明。要指定位置：

```bash
DSH_ROOT=/path/to/node_modules/@deepseek-ai/dsh python tools/verify.py
```

`client.js` 由 `tools/client.template.js` 加上配色表和求解器拼接而成，手改会在下次构建时被覆盖，`verify.py` 也会拒绝。

## 许可

代码以 MIT 许可发布，见 [LICENSE](LICENSE)。

`assets/` 与 `sources/` 里的壁纸图片版权归原作者所有，仅作示例用途。
