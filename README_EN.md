<div align="center">
<strong>
    <h1>OpenCode Visual Cache</h1>
    Real-time Token Cache Hit Rate · TUI Sidebar Visualization<br>
    Adaptive Theme Colors · Auto-desaturated · Chinese / English
</strong>
<br>

[![Stars](https://img.shields.io/github/stars/Hotakus/opencode-visual-cache?style=flat-square)](https://github.com/Hotakus/opencode-visual-cache/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![中文](https://img.shields.io/badge/中文-README-red?style=flat-square)](README.md)

</div>

---

## Screenshots

<div align="center">
<strong>Collapsed 👇</strong> <br>
<img src="https://raw.githubusercontent.com/Hotakus/opencode-visual-cache/master/assets/collapse.png"></img>
<img src="https://raw.githubusercontent.com/Hotakus/opencode-visual-cache/master/assets/collapse_en.png"></img>
</div>
<div align="center">
<strong>Expanded 👇</strong> <br>
<img src="https://raw.githubusercontent.com/Hotakus/opencode-visual-cache/master/assets/expand.png"></img>
<img src="https://raw.githubusercontent.com/Hotakus/opencode-visual-cache/master/assets/expand_en.png"></img>
</div>

---

## Features

- **Cache Hit Rate**: Real-time `cache_read / total_input × 100%` with adaptive-width progress bar
- **Token Breakdown**: Cache Read / Write / Miss / Output, left-aligned labels, right-aligned values
- **Cost & Savings**: Session cost + cache savings (input_rate − cache_read_rate) × cache_read
- **Model Pricing**: Current model's input / cache-read rates (from provider config)
- **Collapsible**: Click title to fold into one line
- **Adaptive Colors**: ≥85% green · ≥70% orange · <70% red, auto-desaturated from theme
- **Token Distribution**: Per-role (system prompt / user / tool call / tool result / output) live token estimation — no external process required
- **Language**: Auto-detects system locale, switches between Chinese and English

---

## Installation

### Option 1: OpenCode Command (recommended)

Press **`Ctrl + P`** in OpenCode to open the command palette, search **`install plugin`**, then type:

```
opencode-visual-cache@latest
```

Press Enter to install and configure automatically.

### Option 2: Manual

**1. Install the plugin**

```bash
npm install -g opencode-visual-cache@latest
```

**2. Configure TUI plugin**

Create or edit `~/.config/opencode/tui.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-visual-cache@latest"]
}
```

### Restart OpenCode

Open any session — the cache stats panel appears in the sidebar.

---

## Update

Due to a [known OpenCode issue #6774](https://github.com/anomalyco/opencode/issues/6774), the plugin cache locks to the version installed at first setup and does **not** auto-detect newer releases on npm.

To update:

**1. Clear the OpenCode plugin cache**

```powershell
# Windows
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\opencode\packages\opencode-visual-cache@latest"
```

```bash
# macOS / Linux
rm -rf ~/.cache/opencode/packages/opencode-visual-cache@latest
```

**2. Re-install the plugin**

Press **`Ctrl + P`** in OpenCode → `install plugin` → `opencode-visual-cache@latest` → Enter

**3. Restart OpenCode**

---

## Debug

Force English:

```powershell
# Windows PowerShell
$env:CACHE_TUI_LANG="en"; opencode
```

```bash
# macOS / Linux
CACHE_TUI_LANG=en opencode
```

---

## Compatibility

Model-agnostic — works with all OpenCode-compatible AI models (DeepSeek / Claude / GPT etc.).
Token data and pricing are read via OpenCode SDK standard interfaces.

---

## License

MIT
