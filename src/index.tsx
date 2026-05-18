/** @jsxImportSource @opentui/solid */

import type { JSX } from "@opentui/solid"
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiSlotContext,
  TuiSlotPlugin,
  TuiPluginModule,
  TuiThemeCurrent,
} from "@opencode-ai/plugin/tui"
import type { AssistantMessage, Message } from "@opencode-ai/sdk"
import { createMemo, createSignal, Show } from "solid-js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Bun / Node globals — available at runtime in the OpenCode TUI process
declare const process: { env: Record<string, string | undefined> } | undefined

// ── terminal-width helpers ────────────────────────────────────────
// CJK characters occupy 2 terminal columns; padEnd/padStart count
// string length (=1 per char), which breaks alignment with mixed text.

function charColumns(c: string): number {
  const code = c.codePointAt(0) ?? 0
  if (code < 0x20) return 0                              // control
  if (code < 0x7F) return 1                              // ASCII
  if (code < 0xA0) return 0                              // C1 controls
  // East-Asian wide / fullwidth ranges
  if ((code >= 0x1100 && code <= 0x115F) ||              // Hangul Jamo
      (code >= 0x2E80 && code <= 0xA4CF) ||              // CJK Radicals … Yi
      (code >= 0xAC00 && code <= 0xD7A3) ||              // Hangul
      (code >= 0xF900 && code <= 0xFAFF) ||              // CJK Compat
      (code >= 0xFE10 && code <= 0xFE6F) ||              // Vertical / Compat
      (code >= 0xFF01 && code <= 0xFF60) ||              // Fullwidth
      (code >= 0xFFE0 && code <= 0xFFE6) ||              // Fullwidth signs
      (code >= 0x1F300 && code <= 0x1F64F) ||            // Misc Symbols (emoji)
      (code >= 0x20000 && code <= 0x3FFFD))              // SIP / TIP
    return 2
  return 1
}

function visualWidth(s: string): number {
  let w = 0; for (const c of s) w += charColumns(c); return w
}

function visualPadEnd(s: string, cols: number): string {
  const pad = cols - visualWidth(s)
  return pad > 0 ? s + " ".repeat(pad) : s
}

// ── debug: set CACHE_TUI_LANG=en|zh to override auto-detection ──
const DEBUG_LANG = typeof process !== "undefined" ? process.env?.CACHE_TUI_LANG : undefined

// ── language ──────────────────────────────────────────────────────

const LANG_ZH = DEBUG_LANG
  ? DEBUG_LANG === "zh"
  : (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh") }
      catch { return false }
    })()

const T = LANG_ZH ? {
  title:      "缓存统计",
  hit:        "命中率",
  read:       "缓存读:",
  write:      "缓存写:",
  miss:       "未命中:",
  out:        "输出:",
  cost:       "费用:",
  saved:      "累计节省:",
  model:      "模型:",
  rate:       "单价:",
  hitFolded:  "命中",
  inputRate:  "输入",
  cacheRate:  "缓存",
  tok:        "tok",
} as const : {
  title:      "Token Cache",
  hit:        "Hit",
  read:       "Read:",
  write:      "Write:",
  miss:       "Miss:",
  out:        "Out:",
  cost:       "Cost:",
  saved:      "Total Saved:",
  model:      "Model:",
  rate:       "Rate:",
  hitFolded:  "hit",
  inputRate:  "in",
  cacheRate:  "cache",
  tok:        "tok",
} as const

// ── color helpers ────────────────────────────────────────────────

/** Extract { r, g, b } (0–255) from a hex string or RGBA-like object. */
function rgb(raw: unknown): { r: number; g: number; b: number } | null {
  if (typeof raw === "string" && raw.startsWith("#")) {
    const h = raw.slice(1)
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    if (typeof o.r === "number" && typeof o.g === "number" && typeof o.b === "number") {
      // RGBA channels may be 0-1 floats; detect and upscale.
      const scale = o.r > 1 || o.g > 1 || o.b > 1 ? 1 : 255
      return {
        r: Math.round(o.r * scale),
        g: Math.round(o.g * scale),
        b: Math.round(o.b * scale),
      }
    }
  }
  return null
}

/** HSL saturation of an RGB color (0–1). */
function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const delta = max - min
  if (delta === 0) return 0
  const L = (max + min) / 2
  return L <= 0.5 ? delta / (max + min) : delta / (2 - max - min)
}

/**
 * If the colour's saturation exceeds `maxSat`, pull it toward grey
 * until saturation drops to maxSat.  Returns a hex string.
 */
function desaturateTo(raw: unknown, maxSat: number, fallback: string): string {
  const c = rgb(raw)
  if (!c) return fallback
  const sat = saturation(c.r, c.g, c.b)
  if (sat <= maxSat) {
    // already muted — return as hex
    return "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")
  }
  // binary search the right amount of grey to mix in
  let lo = 0, hi = 1
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    const nr = Math.round(c.r + ((c.r * 0.299 + c.g * 0.587 + c.b * 0.114) - c.r) * mid)
    const ng = Math.round(c.g + ((c.r * 0.299 + c.g * 0.587 + c.b * 0.114) - c.g) * mid)
    const nb = Math.round(c.b + ((c.r * 0.299 + c.g * 0.587 + c.b * 0.114) - c.b) * mid)
    if (saturation(nr, ng, nb) > maxSat) lo = mid
    else hi = mid
  }
  const grey = c.r * 0.299 + c.g * 0.587 + c.b * 0.114
  const nr = Math.round(c.r + (grey - c.r) * hi)
  const ng = Math.round(c.g + (grey - c.g) * hi)
  const nb = Math.round(c.b + (grey - c.b) * hi)
  return "#" + [nr, ng, nb].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")
}

// Morandi fallbacks — used when a theme colour cannot be resolved
const FALLBACK = {
  primary: "#8B9DAF",
  text:    "#C5C5BB",
  muted:   "#7A7A72",
  success: "#9CAF8B",
  warning: "#C5B88D",
  error:   "#B08A8A",
  border:  "#6B6B63",
} as const

/** Morandi ceiling — colours above this saturation get pulled down. */
const MAX_SAT = 0.28

function progressBar(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  const empty = Math.max(0, width - filled)
  return "\u2588".repeat(filled) + "\u2591".repeat(empty)
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 10_000) return Math.round(n / 1_000) + "K"
  return n.toLocaleString("en-US")
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function fmtCost(n: number): string {
  if (n >= 1) return "$" + n.toFixed(2)
  if (n >= 0.01) return "$" + n.toFixed(3)
  return "$" + n.toFixed(4)
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

const MIN_PANEL_WIDTH = 20
const DEFAULT_PANEL_WIDTH = 26
/** Horizontal space eaten by border (1+1) + padding (2+2). */
const GUTTER = 2 + 4

function TokenCachePanel(props: {
  theme: TuiThemeCurrent
  api: TuiPluginApi
  sessionId: string
}): JSX.Element {
  const [panelWidth, setPanelWidth] = createSignal(DEFAULT_PANEL_WIDTH)
  const [open, setOpen] = createSignal(true)

  // ── scan session messages reactively ──
  // SolidJS createMemo re-evaluates whenever the underlying
  // api.state.session state changes — no event listener needed.
  const data = createMemo(() => {
    const msgs = props.api.state.session.messages(props.sessionId) as Message[]

    let input = 0
    let read = 0
    let write = 0
    let output = 0
    let cost = 0
    let pid = ""
    let mid = ""

    for (const msg of msgs) {
      if (msg.role !== "assistant") continue
      const t = (msg as AssistantMessage).tokens
      input += num(t.input)
      read   += num(t.cache?.read)
      write  += num(t.cache?.write)
      output += num(t.output)
      cost   += num((msg as AssistantMessage).cost)
      if ((msg as AssistantMessage).providerID && (msg as AssistantMessage).modelID) {
        pid = (msg as AssistantMessage).providerID
        mid = (msg as AssistantMessage).modelID
      }
    }

    // cost savings from cache hits
    let saved = 0
    let inputRate = 0
    let cacheReadRate = 0
    if (read > 0 && pid && mid) {
      for (const provider of props.api.state.provider) {
        if (provider.id !== pid) continue
        const model = provider.models[mid]
        if (!model?.cost) continue
        inputRate = num(model.cost.input)
        cacheReadRate = num(model.cost.cache?.read)
        const diff = inputRate - cacheReadRate
        if (diff > 0) saved = (read * diff) / 1_000_000
        break
      }
    }

    // `input` from the API represents fresh (non-cached) tokens.
    // Total context = fresh + cache.read.
    const totalInput = input + read
    const hitRate = totalInput > 0 ? (read / totalInput) * 100 : 0
    const model = mid.split("/").pop() ?? mid
    const hasPricing = inputRate > 0 || cacheReadRate > 0

    return {
      hitRate, read, write, freshInput: input, output,
      cost, saved, model, inputRate, cacheReadRate, hasPricing,
      hasData: read > 0 || write > 0 || input > 0 || output > 0 || cost > 0,
    }
  })

  const d = () => data()

  // ── colours ──
  // Pull from the current theme, auto-desaturate if too punchy,
  // fall back to Morandi when a key is missing from the theme.
  const pal = createMemo(() => {
    const t = props.theme as Record<string, unknown>
    const sat = (k: string, fb: string) => desaturateTo(t[k], MAX_SAT, fb)
    return {
      primary:   sat("primary",   FALLBACK.primary),
      text:      sat("text",      FALLBACK.text),
      muted:     sat("textMuted", FALLBACK.muted),
      success:   sat("success",   FALLBACK.success),
      warning:   sat("warning",   FALLBACK.warning),
      error:     sat("error",     FALLBACK.error),
      border:    sat("border",    FALLBACK.border),
    }
  })

  const hitColor = createMemo(() => {
    const r = d().hitRate
    if (r >= 85) return pal().success
    if (r >= 70) return pal().warning
    return pal().error
  })

  const sep = createMemo(() => "\u2500".repeat(Math.max(1, panelWidth() - GUTTER)))
  const barW = createMemo(() => {
    const overhead = visualWidth(T.hit) + 1 + 2 + 1 + /*pct*/5 + GUTTER
    return Math.max(3, panelWidth() - overhead)
  })
  const bar = createMemo(() => progressBar(d().hitRate, barW()))
  const pct = createMemo(() => d().hitRate.toFixed(1) + "%")

  // left-align label, right-align value — auto-fill space between
  const justify = (label: string, value: string, unit = ""): string => {
    const gauge = panelWidth() - GUTTER
    const used = visualWidth(label) + visualWidth(value) + (unit ? visualWidth(unit) + 1 : 0)
    const gap = Math.max(1, gauge - used)
    return label + " ".repeat(gap) + value + (unit ? " " + unit : "")
  }

  return (
    <Show when={d().hasData}>
      <box
        border
        borderColor={pal().border}
        paddingTop={0}
        paddingBottom={0}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="column"
        gap={0}
        onSizeChange={function () {
          const w = Math.max(MIN_PANEL_WIDTH, this.width)
          setPanelWidth((prev) => (prev === w ? prev : w))
        }}
      >
        {/* collapsible header */}
        <text onMouseUp={() => setOpen((o) => !o)}>
          <span style={{ fg: pal().muted }}>{open() ? "\u25bc " : "\u25b6 "}</span>
          <span style={{ fg: pal().primary }}><b>{T.title}</b></span>
          <Show when={!open()}>
            <span>
              {" ".repeat(Math.max(1, panelWidth() - GUTTER - 2 - visualWidth(T.title) - visualWidth(pct() + " " + T.hitFolded)))}
            </span>
            <span style={{ fg: hitColor() }}>{pct()} {T.hitFolded}</span>
          </Show>
        </text>

        <Show when={open()}>
          <text fg={pal().muted}>{sep()}</text>

          {/* hit rate + bar — inline to avoid box spacing */}
          <text>
            <span style={{ fg: pal().text }}>{T.hit} </span>
            <span style={{ fg: hitColor() }}>[{bar()}] </span>
            <span style={{ fg: pal().text }}>{pct()}</span>
          </text>

          {/* token breakdown */}
          <Show when={d().read > 0}>
            <text fg={pal().muted}>
              {justify(T.read,  fmt(d().read),         T.tok)}
            </text>
          </Show>
          <Show when={d().write > 0}>
            <text fg={pal().muted}>
              {justify(T.write, fmt(d().write),        T.tok)}
            </text>
          </Show>
          <text fg={pal().muted}>
            {justify(T.miss,  fmt(d().freshInput),   T.tok)}
          </text>
          <text fg={pal().muted}>
            {justify(T.out,   fmt(d().output),       T.tok)}
          </text>

          <text fg={pal().muted}>{sep()}</text>

          {/* cost */}
          <text fg={pal().text}>
            {justify(T.cost,  fmtCost(d().cost))}
          </text>

          {/* saved */}
          <Show when={d().saved > 0}>
            <text>
              <span style={{ fg: pal().muted }}>{T.saved}</span>
              <span>{" ".repeat(Math.max(1, panelWidth() - GUTTER - visualWidth(T.saved) - visualWidth("~" + fmtCost(d().saved))))}</span>
              <span style={{ fg: pal().success }}>~{fmtCost(d().saved)}</span>
            </text>
          </Show>

          {/* model */}
          <text fg={pal().muted}>
            {justify(T.model, d().model)}
          </text>

          {/* rates */}
          <Show when={d().hasPricing}>
            <text fg={pal().muted}>
              {justify(T.rate, "$" + d().inputRate.toFixed(2) + "/M " + T.inputRate)}
            </text>
            <Show when={d().cacheReadRate > 0}>
              <text fg={pal().muted}>
                {justify("", "$" + d().cacheReadRate.toFixed(2) + "/M " + T.cacheRate)}
              </text>
            </Show>
          </Show>
        </Show>
      </box>
    </Show>
  )
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

function createSidebarSlot(api: TuiPluginApi): TuiSlotPlugin {
  return {
    order: 55,
    slots: {
      sidebar_content(ctx: TuiSlotContext, input: { session_id: string }): JSX.Element {
        return (
          <TokenCachePanel
            theme={ctx.theme.current}
            api={api}
            sessionId={input.session_id}
          />
        )
      },
    },
  }
}

const tui: TuiPlugin = async (api: TuiPluginApi) => {
  api.slots.register(createSidebarSlot(api))
}

const mod: TuiPluginModule & { id: string } = {
  id: "opencode-visual-cache",
  tui,
}

export default mod
