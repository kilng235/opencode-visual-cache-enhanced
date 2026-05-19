<div align="center">
<strong>
    <h1>OpenCode Visual Cache</h1>
    实时 Token 缓存命中率 · TUI 侧边栏可视化<br>
    自适应主题色 · 自动低饱和设计语言 · 支持中/英双语
</strong>
<br>

[![Stars](https://img.shields.io/github/stars/Hotakus/opencode-visual-cache?style=flat-square)](https://github.com/Hotakus/opencode-visual-cache/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![English](https://img.shields.io/badge/English-README-blue?style=flat-square)](README_EN.md)

</div>

---

## 图片展示

<div align="center"> 
<strong>支持折叠，节省侧边栏占用👇</strong> <br>
<img src="https://raw.githubusercontent.com/Hotakus/opencode-visual-cache/master/assets/example2.png"></img>
</div>
<div align="center"> 
<strong>展开👇</strong> <br>
<img src="https://raw.githubusercontent.com/Hotakus/opencode-visual-cache/master/assets/example1.png"></img>
</div>

---
## 功能

- **缓存命中率**：实时计算并显示缓存命中率，自适应宽度进度条
- **Token 明细**：缓存读 / 缓存写 / 未命中 / 输出，标签左对齐 · 数据右对齐
- **费用与节省**：Session 累计费用 + 缓存命中带来的费用节省
- **模型定价**：显示当前模型的输入 / 缓存读单价（从 provider 配置动态读取）
- **折叠面板**：点击标题折叠为一行，节省侧边栏空间
- **颜色自适应**：命中率 ≥85% 绿 · ≥70% 橙 · <70% 红，颜色从主题色自动去饱和
- **语言适配**：自动检测系统语言

---

## 安装

### 方式一：OpenCode 命令安装（推荐）

在 OpenCode 中按 **`Ctrl + P`** 打开命令面板，搜索 **`install plugin`**，输入：

```
opencode-visual-cache@latest
```

回车即可完成安装与配置。

### 方式二：手动安装

**1. 安装插件**

```bash
npm install -g opencode-visual-cache@latest
```

**2. 配置 TUI 插件**

创建或编辑 `~/.config/opencode/tui.jsonc`：

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-visual-cache@latest"]
}
```

### 重启 OpenCode

进入任意 session，侧边栏即可看到缓存统计面板。

---

## 更新

由于 [OpenCode 已知问题 #6774](https://github.com/anomalyco/opencode/issues/6774)，插件缓存会锁死在首次安装时的版本，不会自动检测 npm 上的新版本。

更新步骤：

**1. 清除 OpenCode 插件缓存**

```powershell
# Windows
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\opencode\packages\opencode-visual-cache@latest"
```

```bash
# macOS / Linux
rm -rf ~/.cache/opencode/packages/opencode-visual-cache@latest
```

**2. 重新安装插件**

在 OpenCode 中按 **`Ctrl + P`** → `install plugin` → `opencode-visual-cache@latest` → 回车

**3. 重启 OpenCode**

---

## 调试

强制英文（Windows PowerShell）：

```powershell
$env:CACHE_TUI_LANG="en"; opencode
```

---

## 兼容性

代码完全模型无关，支持所有 OpenCode 兼容的 AI 模型（DeepSeek / Claude / GPT 等）。
Token 数据和定价信息均通过 OpenCode SDK 标准接口获取。

---

## License

MIT
