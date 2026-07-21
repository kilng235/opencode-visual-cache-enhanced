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
import type { UserMessage, AssistantMessage, Message } from "@opencode-ai/sdk"
import type {
  Part,
  TextPart,
  ToolPart,
  FilePart,
  ReasoningPart,
} from "@opencode-ai/sdk/v2"
import { createMemo, createSignal, createEffect, onMount, onCleanup, Show, untrack } from "solid-js"
import { PLUGIN_VERSION } from "./_version"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Bun / Node globals — available at runtime in the OpenCode TUI process
declare const process: { env: Record<string, string | undefined> } | undefined
declare function require(id: string): any

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

/** Truncate `s` to fit within `maxCols` visual columns, appending "…" when cut. */
function truncateVisual(s: string, maxCols: number): string {
  if (visualWidth(s) <= maxCols) return s
  let result = "", w = 0
  for (const c of s) {
    const cw = charColumns(c)
    if (w + cw > maxCols - 1) { result += "\u2026"; break }
    result += c; w += cw
  }
  return result
}

// ── language override (env: CACHE_TUI_LANG) ──
const DEBUG_LANG = typeof process !== "undefined" ? process.env?.CACHE_TUI_LANG : undefined

// ── language ──────────────────────────────────────────────────────

const LANG_ZH = DEBUG_LANG
  ? DEBUG_LANG === "zh"
  : (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh") }
      catch { return false }
    })()

const ZH_T = {
  title:      "缓存统计",
  hit:        "命中率",
  totalHit:   "总命中:",
  read:       "缓存读:",
  write:      "缓存写:",
  miss:       "未命中:",
  out:        "输出:",
  cost:       "费用:",
  saved:      "累计节省:",
  model:      "模型:",
  provider:   "提供商:",
  rate:       "单价:",
  hitFolded:  "命中",
  inputRate:  "输入",
  cacheRate:  "缓存",
  writeRate:  "写入",
  noData:    "等待缓存数据...",
  tok:        "tok",
  distTitle:  "估算 Token 分布",
  distSys:    "系统提示:",
  distUser:   "用户:",
  distAgent:  "Agent 指令:",
  distTool:   "Tool 调用:",
  distRes:    "Tool 结果:",
  distTotal:  "总计:",
  distOut:    "输出:",
  secDetail:  "明细",
  secModel:   "模型",
  secSkills:  "已加载技能",
  secBalance: "余额",
  balTotal:   "总余额:",
  balGranted: "赠送:",
  balTopped:  "充值:",
  balNoKey:   "未配置 API Key",
  balLoading: "查询中...",
  balError:   "查询失败",
  secModels:  "模型记录",
  mdlCalls:   "次",
  secGit:     "Git",
  gitBranch:  "分支:",
  gitModified:"修改:",
  gitStaged:  "暂存:",
  gitUntracked:"未跟踪:",
  gitClean:   "工作区干净",
  gitAhead:   "领先:",
  gitBehind:  "落后:",
  gitNoRepo:  "非 Git 仓库",
  secDuration: "时长",
  duration:   "运行时间:",
} as const

const EN_T = {
  title:      "Token Cache",
  hit:        "Hit",
  totalHit:   "Total Hit:",
  read:       "Read:",
  write:      "Write:",
  miss:       "Miss:",
  out:        "Out:",
  cost:       "Cost:",
  saved:      "Total Saved:",
  model:      "Model:",
  provider:   "Provider:",
  rate:       "Rate:",
  hitFolded:  "hit",
  inputRate:  "in",
  cacheRate:  "cache",
  writeRate:  "write",
  noData:    "Waiting for cache data...",
  tok:        "tok",
  distTitle:  "Estimated Token Dist.",
  distSys:    "System:",
  distUser:   "User:",
  distAgent:  "Agent Instr:",
  distTool:   "Tool Call:",
  distRes:    "Tool Result:",
  distTotal:  "Total:",
  distOut:    "Output:",
  secDetail:  "Detail",
  secModel:   "Model",
  secSkills:  "Loaded Skills",
  secBalance: "Balance",
  balTotal:   "Total:",
  balGranted: "Granted:",
  balTopped:  "Topped-up:",
  balNoKey:   "No API Key set",
  balLoading: "Fetching...",
  balError:   "Fetch failed",
  secModels:  "Model Log",
  mdlCalls:   "calls",
  secGit:     "Git",
  gitBranch:  "Branch:",
  gitModified:"Modified:",
  gitStaged:  "Staged:",
  gitUntracked:"Untracked:",
  gitClean:   "Working tree clean",
  gitAhead:   "Ahead:",
  gitBehind:  "Behind:",
  gitNoRepo:  "Not a Git repo",
  secDuration: "Duration",
  duration:   "Elapsed:",
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
  /**
   * Binary search for the optimal grey-mix ratio α (0…1).
   *
   * 12 iterations → 1/2^12 ≈ 1/4096 resolution.  The downstream RGB
   * channels are only 0–255 (8 bit), so 8 iterations (1/256) would
   * technically suffice; 12 is intentionally over-budget — the extra
   * precision costs almost nothing and guarantees the saturation probe
   * converges to within a fraction of an 8‑bit step, eliminating
   * colour banding in edge cases.
   */
  // BT.601 luma (perceptual brightness used as the grey anchor)
  const luma = c.r * 0.299 + c.g * 0.587 + c.b * 0.114
  let lo = 0, hi = 1
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    const nr = Math.round(c.r + (luma - c.r) * mid)
    const ng = Math.round(c.g + (luma - c.g) * mid)
    const nb = Math.round(c.b + (luma - c.b) * mid)
    if (saturation(nr, ng, nb) > maxSat) lo = mid
    else hi = mid
  }
  const nr = Math.round(c.r + (luma - c.r) * hi)
  const ng = Math.round(c.g + (luma - c.g) * hi)
  const nb = Math.round(c.b + (luma - c.b) * hi)
  return "#" + [nr, ng, nb].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")
}

/** Darken a hex colour by multiplying each channel by `factor` (0–1). */
function dimColor(hex: string, factor = 0.5): string {
  const c = rgb(hex)
  if (!c) return hex
  const r = Math.round(c.r * factor)
  const g = Math.round(c.g * factor)
  const b = Math.round(c.b * factor)
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")
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

/**
 * Desaturation ceiling for the Morandi-style palette.
 *
 * Morandi colours float around 0.15–0.30 saturation in HSL space.
 * 0.28 sits near the upper end of that range: it strips the aggressive
 * punch from high-saturation themes (Dracula, Solarized …) while
 * preserving enough colour identity that green / orange / red hit-rate
 * coding stays distinguishable.
 *
 * Lower → more grey, harder to tell colours apart.
 * Higher → bright themes bleed through and defeat the muted look.
 */
const MAX_SAT = 0.28

function progressBar(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  const empty = Math.max(0, width - filled)
  return "\u2588".repeat(filled) + "\u2591".repeat(empty)
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 10_000) return (n / 1_000).toFixed(1) + "K"
  return n.toLocaleString("en-US")
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function fmtCost(n: number, symbol = "$", rate = 1): string {
  const v = n * rate
  if (v >= 1) return symbol + v.toFixed(2)
  if (v >= 0.01) return symbol + v.toFixed(3)
  return symbol + v.toFixed(4)
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":")
}

// ── token estimation ──
// Character-based BPE approximation.  Default ratios (~4 ASCII or ~1.5 CJK
// chars per token) work well for natural language but systematically
// under-count tokens in JSON and source code where every punctuation mark
// tends to be its own token.  Detect these cases and tighten the ratio.
// See: GPT-4 / Claude tokenizer behaviour with structured text.

function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0
  let ascii = 0
  let cjk = 0
  for (const c of text) {
    const code = c.codePointAt(0) ?? 0
    if (code >= 0x4E00 && code <= 0x9FFF) cjk++       // CJK Unified
    else if (code >= 0x3040 && code <= 0x30FF) cjk++   // Hiragana/Katakana
    else if (code >= 0xAC00 && code <= 0xD7A3) cjk++   // Hangul
    else if (code >= 0x1100 && code <= 0x11FF) cjk++   // Hangul Jamo
    else if (code >= 0x2E80 && code <= 0x2EFF) cjk++   // CJK Radicals
    else ascii++
  }

  // Real BPE tokenizers (cl100k_base, o200k_base) average ~3.5-4.0
  // ASCII chars/token for both JSON and source code — close to prose.
  // The old 2.0 / 2.5 ratios matched minified-JS extremes, not typical
  // payloads, and systematically over-estimated token counts.
  const trimmed = text.trimStart()
  // Strip markdown code-fence prefix so that ```json … is detected as JSON
  const strippedFence = trimmed.replace(/^\x60{3}\w*\s*\n?/, "")
  const jsonLike = (strippedFence.startsWith("{") || strippedFence.startsWith("["))
    && /"[^"]+"\s*:/.test(text)
  const codeLike = !jsonLike
    && /```|^import |^export |^function |^const |^let |^var |^class |^interface |^type |^def |^fn |^pub |^use |^mod |^package /m.test(text)

  const asciiPerToken = jsonLike ? 3.5 : codeLike ? 3.5 : 4
  return Math.max(1, Math.ceil(ascii / asciiPerToken + cjk / 1.0))
}

interface TokenDist {
  system: number   // UserMessage.system
  user: number     // user message text/file parts
  agent: number    // SubtaskPart.prompt + ReasoningPart.text
  toolCall: number // ToolPart.input (actual tool params)
  toolResult: number // ToolPart completed output / error
  output: number   // AssistantMessage.tokens.output (fallback)
  apiOutput: number // StepFinishPart.tokens.output (API exact, preferred)
  apiInput: number  // StepFinishPart.tokens.input (API exact total context)
  stepCost: number
}

// ---------------------------------------------------------------------------
// DeepSeek Balance
// ---------------------------------------------------------------------------

interface DeepSeekBalance {
  currency: string
  total: string
  granted: string
  toppedUp: string
}

interface BalanceState {
  status: "idle" | "loading" | "ok" | "error"
  data: DeepSeekBalance | null
  lastFetch: number
}

const BALANCE_POLL_MS = 5 * 60 * 1000 // 5 minutes

async function fetchDeepSeekBalance(apiKey: string): Promise<DeepSeekBalance> {
  const res = await fetch("https://api.deepseek.com/user/balance", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as {
    is_available?: boolean
    balance_infos?: { currency: string; total_balance: string; granted_balance: string; topped_up_balance: string }[]
  }
  const info = json.balance_infos?.[0]
  if (!info) throw new Error("No balance info")
  return {
    currency: info.currency ?? "CNY",
    total: info.total_balance ?? "0",
    granted: info.granted_balance ?? "0",
    toppedUp: info.topped_up_balance ?? "0",
  }
}

// ---------------------------------------------------------------------------
// Git status
// ---------------------------------------------------------------------------

interface GitStatus {
  branch: string
  modified: number
  staged: number
  untracked: number
  ahead: number
  behind: number
  files: string[]
  isRepo: boolean
}

const GIT_POLL_MS = 30 * 1000 // 30 seconds
const GIT_MAX_FILES = 15 // cap displayed file list

function fetchGitStatus(): GitStatus {
  try {
    const { execSync } = require("child_process")
    const opts = { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] as const }
    let branch = ""
    try {
      branch = execSync("git branch --show-current", opts).toString().trim()
    } catch {
      // detached HEAD or not a repo
      try {
        branch = execSync("git rev-parse --short HEAD", opts).toString().trim()
      } catch {
        return { branch: "", modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0, files: [], isRepo: false }
      }
    }
    const porcelain = execSync("git status --porcelain", opts).toString()
    let modified = 0, staged = 0, untracked = 0
    const files: string[] = []
    for (const line of porcelain.split("\n")) {
      if (line.length < 4) continue
      const x = line[0], y = line[1]
      const filePath = line.slice(3).trim()
      if (x === "?" && y === "?") { untracked++; files.push(filePath); continue }
      if (x !== " " && x !== "?") { staged++; files.push(filePath) }
      else if (y !== " " && y !== "?") { modified++; files.push(filePath) }
    }
    // ahead/behind remote
    let ahead = 0, behind = 0
    try {
      const counts = execSync(`git rev-list --left-right --count origin/${branch}...HEAD`, opts).toString().trim()
      const parts = counts.split(/\s+/)
      if (parts.length === 2) { behind = parseInt(parts[0], 10) || 0; ahead = parseInt(parts[1], 10) || 0 }
    } catch { /* no remote tracking */ }
    return { branch, modified, staged, untracked, ahead, behind, files: files.slice(0, GIT_MAX_FILES), isRepo: true }
  } catch {
    return { branch: "", modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0, files: [], isRepo: false }
  }
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

/** Signals shared between the TUI component and slash commands.
 *  Created in the `tui` function scope so they do not survive module reload —
 *  the component re-creates them on mount and restores user config from kv. */
interface PanelSignals {
  currencySymbol: () => string
  setCurrencySymbol: (v: string) => void
  exchangeRate: () => number
  setExchangeRate: (v: number) => void
  langZH: () => boolean
  setLangZH: (v: boolean) => void
  sectionDetail: () => boolean
  setSectionDetail: (v: boolean) => void
  sectionModel: () => boolean
  setSectionModel: (v: boolean) => void
  sectionDist: () => boolean
  setSectionDist: (v: boolean) => void
  sectionSkills: () => boolean
  setSectionSkills: (v: boolean) => void
  borderVisible: () => boolean
  setBorderVisible: (v: boolean) => void
  sectionBalance: () => boolean
  setSectionBalance: (v: boolean) => void
  sectionModels: () => boolean
  setSectionModels: (v: boolean) => void
  sectionGit: () => boolean
  setSectionGit: (v: boolean) => void
  sectionDuration: () => boolean
  setSectionDuration: (v: boolean) => void
  /** When set, the panel renders stats for this session instead of the main one. */
  overrideSessionId: () => string | undefined
  setOverrideSessionId: (v: string | undefined) => void
}

const CURRENCIES: Record<string, string> = {
  USD: "$", CNY: "¥", EUR: "€", JPY: "JP¥", GBP: "£", KRW: "₩",
}
/** Approximate USD exchange rates — used as defaults when switching currency.
 *  Users can override via /cache-rate.  Last updated 2026-05. */
const DEFAULT_RATES: Record<string, number> = {
  USD: 1, CNY: 7.2, EUR: 0.92, JPY: 150, GBP: 0.79, KRW: 1350,
}

const MIN_PANEL_WIDTH = 20
const DEFAULT_PANEL_WIDTH = 26

/** ── layout measurement constants (visual columns) ── */
const LABEL_GAP = 1        // label（如 "Hit"）后面的空格
const BAR_BRACKETS = 2     // "[" + "]" 包围进度条
const BAR_GAP = 1          // "]" 后面的空格
const PCT_FIXED_WIDTH = 5  // "XX.X%" 固定 5 字符宽度
const HEADER_PREFIX = 2    // 折叠态标题行：▶/▼ 图标 + 后面的空格
const UNIT_GAP = 1         // 计量单位前的空格（如 "tok"）


function TokenCachePanel(props: {
  theme: TuiThemeCurrent
  api: TuiPluginApi
  sessionId: string
  signals: PanelSignals
}): JSX.Element {
  const [panelWidth, setPanelWidth] = createSignal(DEFAULT_PANEL_WIDTH)
  const [open, setOpen] = createSignal(true)
  const [detailOpen, setDetailOpen] = createSignal(true)
  const [modelOpen, setModelOpen] = createSignal(true)
  const [distOpen, setDistOpen] = createSignal(false)
  const [skillsOpen, setSkillsOpen] = createSignal(true)
  const [balanceOpen, setBalanceOpen] = createSignal(true)
  const [modelsOpen, setModelsOpen] = createSignal(true)
  const [gitOpen, setGitOpen] = createSignal(true)
  const [gitFilesOpen, setGitFilesOpen] = createSignal(false)
  const [durationOpen, setDurationOpen] = createSignal(true)
  const [sessionTimeCreated, setSessionTimeCreated] = createSignal(0)
  const [elapsedSeconds, setElapsedSeconds] = createSignal(0)
  let boxEl: any

  // ── shared signals (de-structured so internal code is unchanged) ──
  const {
    currencySymbol, setCurrencySymbol,
    exchangeRate, setExchangeRate,
    langZH, setLangZH,
    sectionDetail, setSectionDetail,
    sectionModel, setSectionModel,
    sectionDist, setSectionDist,
    sectionSkills, setSectionSkills,
    borderVisible, setBorderVisible,
    sectionBalance, setSectionBalance,
    sectionModels, setSectionModels,
    sectionGit, setSectionGit,
    sectionDuration, setSectionDuration,
  } = props.signals

  // ── reactive translation (follows langZH signal) ──
  const t = createMemo(() => langZH() ? ZH_T : EN_T)

  // ── scan session messages reactively ──
  // SolidJS createMemo re-evaluates whenever the underlying
  // api.state.session state changes — no event listener needed.

  // ── distribution cache ────────────────────────────────────────
  // When data() re-computes before api.state.part() is warm (e.g. after
  // a view switch), hasDistData flips to false and the distribution
  // block disappears.  Keep the last valid snapshot so the UI stays
  // stable until the next successful computation arrives.
  const [lastDist, setLastDist] = createSignal<TokenDist>({
    system: 0, user: 0, agent: 0, toolCall: 0, toolResult: 0,
    output: 0, apiOutput: 0, apiInput: 0, stepCost: 0,
  })
  const [lastHasDist, setLastHasDist] = createSignal(false)

  const [dataSignal, setDataSignal] = createSignal<any>({
    hitRate: 0, read: 0, write: 0, freshInput: 0, output: 0,
    cost: 0, saved: 0, model: "", inputRate: 0, cacheReadRate: 0, cacheWriteRate: 0,
    hasPricing: false, hasData: false, trend: 0, hasTrendData: false,
    providerName: "", sessionHitRate: 0,
    dist: { system: 0, user: 0, agent: 0, toolCall: 0, toolResult: 0, output: 0, apiOutput: 0, apiInput: 0, stepCost: 0 },
    hasDistData: false,
    skills: [] as { name: string; tokens: number }[],
    hasSkills: false,
  })
  const [refreshTick, setRefreshTick] = createSignal(0)

  // ── DeepSeek balance polling ──────────────────────────────────
  const [balanceState, setBalanceState] = createSignal<BalanceState>({
    status: "idle", data: null, lastFetch: 0,
  })

  const pollBalance = async () => {
    const key = props.api.kv.get<string>(`${KV_PREFIX}.ds_key`, "")
    if (!key) { setBalanceState({ status: "idle", data: null, lastFetch: 0 }); return }
    const now = Date.now()
    const prev = balanceState()
    if (prev.status === "ok" && now - prev.lastFetch < BALANCE_POLL_MS) return // cache still fresh
    setBalanceState({ ...prev, status: "loading" })
    try {
      const data = await fetchDeepSeekBalance(key)
      setBalanceState({ status: "ok", data, lastFetch: Date.now() })
    } catch {
      setBalanceState({ ...prev, status: "error" })
    }
  }

  // ── Git status polling ────────────────────────────────────────
  const [gitState, setGitState] = createSignal<GitStatus>({
    branch: "", modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0, files: [], isRepo: false,
  })

  const pollGit = () => {
    setGitState(fetchGitStatus())
  }

  // ── auto-clear override when the user navigates to a different main session ──
  let lastMainSid = props.sessionId
  createEffect(() => {
    const sid = props.sessionId
    if (sid !== lastMainSid) {
      lastMainSid = sid
      if (props.signals.overrideSessionId()) {
        props.signals.setOverrideSessionId(undefined)
        props.api.kv.set(`${KV_PREFIX}.session`, "")
      }
    }
  })

  createEffect(() => {
    const sid = props.signals.overrideSessionId() ?? props.sessionId
    void refreshTick()
    void partVersion()

    // 自然追踪 messages 和 provider（SDK 数据就绪时自动重新执行）
    const msgs = props.api.state.session.messages(sid) as Message[]
    const session = typeof props.api.state.session.get === "function"
      ? props.api.state.session.get(sid)
      : undefined

    // 提取会话创建时间（用于计时器）
    if (session?.time?.created) setSessionTimeCreated(session.time.created)

    // 累计值优先使用 Session 聚合字段（数据库级，不受 sync 层 limit:100 截断）
    // 若字段不存在（旧版本 SDK），降级到消息遍历累加
    let input  = session?.tokens?.input ?? 0
    let read   = session?.tokens?.cache?.read ?? 0
    let write  = session?.tokens?.cache?.write ?? 0
    let output = session?.tokens?.output ?? 0
    let cost   = session?.cost ?? 0
    let pid    = session?.model?.providerID ?? ""
    let mid    = session?.model?.id ?? ""

    const fallbackTokens = session?.tokens == null
    const fallbackCost   = session?.cost == null
    const fallbackModel  = !pid || !mid

    let prevMsgHitRate = -1, lastMsgHitRate = -1
    const modelUsage = new Map<string, { tokens: number; calls: number }>()
    for (const msg of msgs) {
      if (msg.role !== "assistant") continue
      const t = (msg as AssistantMessage).tokens; if (!t) continue
      const mit = num(t.input) + num(t.cache?.read), mrt = num(t.cache?.read)
      if (mit > 0) {
        prevMsgHitRate = lastMsgHitRate; lastMsgHitRate = (mrt / mit) * 100
      }
      // Track per-model token usage
      const msgModel = (msg as AssistantMessage).modelID || mid
      if (msgModel) {
        const entry = modelUsage.get(msgModel) ?? { tokens: 0, calls: 0 }
        entry.tokens += num(t.input) + num(t.cache?.read) + num(t.output)
        entry.calls += 1
        modelUsage.set(msgModel, entry)
      }
      if (fallbackTokens) {
        input += num(t.input); read += num(t.cache?.read); write += num(t.cache?.write); output += num(t.output)
      }
      if (fallbackCost) {
        cost += num((msg as AssistantMessage).cost)
      }
      if (fallbackModel && (msg as AssistantMessage).providerID && (msg as AssistantMessage).modelID) {
        pid = (msg as AssistantMessage).providerID; mid = (msg as AssistantMessage).modelID
      }
    }
    let saved = 0, inputRate = 0, cacheReadRate = 0, cacheWriteRate = 0
    if (read > 0 && pid && mid && Array.isArray(props.api.state.provider)) for (const provider of props.api.state.provider) {
      if (provider.id !== pid) continue
      const model = provider.models[mid]; if (!model?.cost) continue
      inputRate = num(model.cost.input); cacheReadRate = num(model.cost.cache?.read); cacheWriteRate = num(model.cost.cache?.write)
      if (inputRate > cacheReadRate) saved = (read * (inputRate - cacheReadRate)) / 1_000_000
      break
    }
    const hitRate = lastMsgHitRate >= 0 ? lastMsgHitRate : 0
    const freshTotal = input + read, sessionHitRate = freshTotal > 0 ? (read / freshTotal) * 100 : 0
    const model = mid.split("/").pop() ?? mid, hasPricing = inputRate > 0 || cacheReadRate > 0 || cacheWriteRate > 0
    const hasTrendData = prevMsgHitRate >= 0 && lastMsgHitRate >= 0
    const trend = hasTrendData ? lastMsgHitRate - prevMsgHitRate : 0, providerName = pid || ""

    // untrack 只包裹已知触发死锁的 API
    const distData = untrack(() => {
      let dist: TokenDist = { system: 0, user: 0, agent: 0, toolCall: 0, toolResult: 0, output: 0, apiOutput: 0, apiInput: 0, stepCost: 0 }
      let hasDistData = false
      const loadedSkills = new Map<string, { name: string; tokens: number }>()
      try {
        const cfg = props.api.state.config as Record<string, unknown>
        const agentName = String(session?.agent ?? (cfg as any)?.default_agent ?? "build")
        const agents = cfg?.agent as Record<string, unknown> | undefined
        const agentCfg = agents?.[agentName] as Record<string, unknown> | undefined
        const sysPrompt = typeof agentCfg?.prompt === "string" ? agentCfg.prompt : ""
        if (sysPrompt) dist.system = estimateTokens(sysPrompt)
        let lastAssMsg: AssistantMessage | undefined
        for (const msg of msgs) {
          if (msg.role === "user") {
            const um = msg as UserMessage; if (um.system) dist.system += estimateTokens(um.system)
            let parts: readonly Part[] = []; try { parts = props.api.state.part(msg.id) } catch {}
            for (const p of parts) {
              if (p.type === "text" && !(p as any).synthetic && !(p as any).ignored) dist.user += estimateTokens((p as any).text)
              else if (p.type === "file") { const fp = p as any; if (fp.source?.text?.value) dist.user += estimateTokens(fp.source.text.value) }
            }
          } else if (msg.role === "assistant") {
            const am = msg as AssistantMessage
            dist.output += num(am.tokens?.output)
            let parts: readonly Part[] = []; try { parts = props.api.state.part(msg.id) } catch {}
            for (const p of parts) {
              if (p.type === "tool") {
                const tp = p as any; let rawInput = ""
                try { rawInput = tp.state.raw ?? (tp.state.input != null ? JSON.stringify(tp.state.input) : "") } catch {}
                if (rawInput) dist.toolCall += estimateTokens(rawInput)
                if (tp.state.status === "completed") { const c = tp.state; if (c.output) dist.toolResult += estimateTokens(c.output) }
                else if (tp.state.status === "error") { const e = tp.state; if (e.error) dist.toolResult += estimateTokens(e.error) }
                if (tp.tool === "skill" && tp.state.status === "completed") {
                  // TUI SDK strips tool metadata — extract skill name from well-known output format.
                  // Cross-validated against api.client.app.skills() when available.
                  let name: string | undefined = tp.state.metadata?.name
                  if (typeof name !== "string") {
                    const m = typeof tp.state.output === "string"
                      ? tp.state.output.match(/^#{1,2}\s*Skill:\s*(.+)/m)
                      : null
                    if (m) name = m[1].trim()
                  }
                  if (typeof name === "string") {
                    const tokens = typeof tp.state.output === "string" ? estimateTokens(tp.state.output) : 0
                    const existing = loadedSkills.get(name)
                    if (!existing || existing.tokens < tokens) {
                      loadedSkills.set(name, { name, tokens })
                    }
                  }
                }
              } else if (p.type === "reasoning") dist.agent += estimateTokens((p as any).text)
              else if (p.type === "subtask") { const sub = p as any; dist.agent += estimateTokens(sub.prompt || sub.description || "") }
            }
          }
        }
        // 从后往前找最后一条有 token 数据的 assistant 消息（避免取到 streaming 中未填充的消息）
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role !== "assistant") continue
          const t = (msgs[i] as AssistantMessage).tokens
          if (t && (t.input > 0 || (t.cache?.read ?? 0) > 0)) { lastAssMsg = msgs[i] as AssistantMessage; break }
        }
        // 取最后一条有数据消息的总输入（含缓存读）作为当前 context 大小
        dist.apiInput = num(lastAssMsg?.tokens?.input) + num(lastAssMsg?.tokens?.cache?.read)
        dist.apiOutput = num(lastAssMsg?.tokens?.output)
        hasDistData = dist.system + dist.user + dist.agent + dist.toolCall + dist.toolResult > 0 || dist.apiOutput > 0 || dist.apiInput > 0
      } catch {}
      const finalDist = hasDistData ? dist : lastDist(), finalHasDist = hasDistData || lastHasDist()
      const skills = [...loadedSkills.values()]
      return { finalDist, finalHasDist, skills }
    })

    setDataSignal({
      hitRate, read, write, freshInput: input, output, cost, saved, model,
      inputRate, cacheReadRate, cacheWriteRate, hasPricing,
      hasData: read > 0 || write > 0 || input > 0 || output > 0 || cost > 0,
      trend, hasTrendData, providerName, sessionHitRate,
      dist: distData.finalDist, hasDistData: distData.finalHasDist,
      skills: distData.skills, hasSkills: distData.skills.length > 0,
      modelUsage: [...modelUsage.entries()].map(([name, u]) => ({ name, tokens: u.tokens, calls: u.calls })),
    })
  })

  const data = createMemo(() => {
    return dataSignal()
  })

  // Persist the last valid distribution so that data() can fall back
  // to it while api.state.part() is re-hydrating after a view switch.
  createEffect(() => {
    const d = data()
    if (d.hasDistData) {
      setLastDist({ ...d.dist })
      setLastHasDist(true)
      // Also persist across component remounts (view switches)
      try { props.api.kv.set(`${KV_PREFIX}.dist_snapshot`, { ...d.dist }) } catch {}
    }
  })

  // ── token distribution (in-process via api.state.part) ──
  const [partVersion, setPartVersion] = createSignal(0)

  // Persist fold state to api.kv
  const KV_PREFIX = "cache_panel"
  const persistFold = (key: string, val: boolean) => {
    try { props.api.kv.set(`${KV_PREFIX}.${key}`, val) } catch {}
  }

  onMount(() => {
    // Reset panelWidth on (re)mount so the layout uses a clean
    // default until onSizeChange measures the live box dimensions.
    setPanelWidth(DEFAULT_PANEL_WIDTH)

    // Restore fold state from persisted storage (non-critical — fire and forget)
    try {
      setOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.open`, false)))
      setDetailOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.detail`, true)))
      setModelOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.model`, true)))
      setDistOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.dist`, false)))
      setSkillsOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.skills`, true)))
      setBalanceOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.balance`, true)))
      setModelsOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.models`, true)))
      setGitOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.git`, true)))
      setGitFilesOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.gitfiles`, false)))
      setDurationOpen(Boolean(props.api.kv.get(`${KV_PREFIX}.duration`, true)))
    } catch {}

    // Restore user config (currency, rate, section visibility).
    // Try synchronously first (kv is usually ready on mount), fall back to
    // polling if the module was reloaded and kv hasn't initialised yet.
    const doRestore = () => {
      try {
        const sym = props.api.kv.get<string>(`${KV_PREFIX}.currency`)
        const rate = props.api.kv.get<number>(`${KV_PREFIX}.rate`)
        if (typeof sym === "string") setCurrencySymbol(sym)
        if (typeof rate === "number" && rate > 0) setExchangeRate(rate)
        setSectionDetail(Boolean(props.api.kv.get(`${KV_PREFIX}.section.detail`, true)))
        setSectionModel(Boolean(props.api.kv.get(`${KV_PREFIX}.section.model`, true)))
        setSectionDist(Boolean(props.api.kv.get(`${KV_PREFIX}.section.dist`, true)))
        setSectionSkills(Boolean(props.api.kv.get(`${KV_PREFIX}.section.skills`, true)))
        setSectionBalance(Boolean(props.api.kv.get(`${KV_PREFIX}.section.balance`, true)))
        setSectionModels(Boolean(props.api.kv.get(`${KV_PREFIX}.section.models`, true)))
        setSectionGit(Boolean(props.api.kv.get(`${KV_PREFIX}.section.git`, true)))
        setSectionDuration(Boolean(props.api.kv.get(`${KV_PREFIX}.section.duration`, true)))
        const bv = props.api.kv.get<boolean>(`${KV_PREFIX}.border`, true)
        setBorderVisible(bv !== false)
        // Restore language preference
        const savedLang = props.api.kv.get<string>(`${KV_PREFIX}.lang`)
        if (savedLang === "zh" || savedLang === "en") {
          setLangZH(savedLang === "zh")
        }
        // Restore distribution snapshot so the token distribution block
        // doesn't blank out while api.state.part() re-hydrates.
        const cachedDist = props.api.kv.get<TokenDist>(`${KV_PREFIX}.dist_snapshot`)
        if (cachedDist) {
          setLastDist(cachedDist)
          setLastHasDist(true)
        }
      } catch {
        // kv read failed — signals stay at defaults
      }
      // Re-measure panel width after config signals have settled
      if (boxEl && typeof boxEl.width === "number" && boxEl.width > 0) {
        setPanelWidth(Math.max(MIN_PANEL_WIDTH, boxEl.width))
      }
    }

    if (props.api.kv.ready) {
      doRestore()
    } else {
      // Poll kv.ready with a 1-second timeout to avoid infinite busy-wait
      // on platforms where kv initialisation may be delayed (Linux single-thread
      // mode, session switch storms, etc.).
      const MAX_POLL = 100
      let tries = 0
      const pollRestore = () => {
        if (!props.api.kv.ready) {
          if (++tries > MAX_POLL) { doRestore(); return }
          setTimeout(pollRestore, 10)
          return
        }
        doRestore()
      }
      pollRestore()
    }

    // Debounce partVersion updates so that event bursts during session
    // switching / streaming don't cause data() to re-compute on every
    // single event (up to hundreds per second on Linux single-thread).
    let partTimer: ReturnType<typeof setTimeout> | undefined
    const bumpPartVersion = () => {
      clearTimeout(partTimer)
      partTimer = setTimeout(() => setPartVersion((v) => v + 1), 100)
    }
    const unsubPart = props.api.event.on("message.part.updated", () => { bumpPartVersion(); setRefreshTick(v => v + 1) })
    const unsubMsg = props.api.event.on("message.updated", () => { bumpPartVersion(); setRefreshTick(v => v + 1) })
    const unsubSession = props.api.event.on("session.updated", () => { setRefreshTick(v => v + 1) })
    setRefreshTick(v => v + 1)

    // ── DeepSeek balance: initial fetch + periodic poll ──
    pollBalance()
    const balanceTimer = setInterval(pollBalance, BALANCE_POLL_MS)

    // ── Git status: initial fetch + periodic poll ──
    pollGit()
    const gitTimer = setInterval(pollGit, GIT_POLL_MS)

    // ── session duration timer ──
    const durationTimer = setInterval(() => {
      const created = sessionTimeCreated()
      if (created > 0) setElapsedSeconds(Math.floor((Date.now() - created) / 1000))
    }, 1000)

    onCleanup(() => { clearTimeout(partTimer); clearInterval(balanceTimer); clearInterval(gitTimer); clearInterval(durationTimer); unsubPart(); unsubMsg(); unsubSession() })
  })

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
    const r = data().hitRate
    if (r >= 85) return pal().success
    if (r >= 70) return pal().warning
    return pal().error
  })

  /** Horizontal space eaten by border (1+1 when visible) + padding (2+2 when visible). */
  const gutter = createMemo(() => borderVisible() ? 6 : 0)

  const sep = createMemo(() => "\u2500".repeat(Math.max(1, panelWidth() - gutter())))
  function trendLabel(t: number): string {
    return (t > 0 ? "\u2191" : t < 0 ? "\u2193" : "-") + (t !== 0 ? Math.abs(t).toFixed(1) + "%" : "")
  }

  const barW = createMemo(() => {
    const trendSpace = data().hasTrendData ? LABEL_GAP + visualWidth(trendLabel(data().trend)) : 0
    const overhead = visualWidth(t().hit) + LABEL_GAP + BAR_BRACKETS + BAR_GAP + PCT_FIXED_WIDTH + trendSpace + gutter()
    return Math.max(3, panelWidth() - overhead)
  })
  const bar = createMemo(() => progressBar(data().hitRate, barW()))
  const pct = createMemo(() => (Math.floor(data().hitRate * 10) / 10).toFixed(1) + "%")

  // When border visibility changes the box dimensions shift, which
  // may not reliably trigger onSizeChange across (re)mount cycles.
  // Force panelWidth to resync with the live box after every change.
  createEffect(() => {
    borderVisible()
    if (boxEl && typeof boxEl.width === "number" && boxEl.width > 0) {
      const w = Math.max(MIN_PANEL_WIDTH, boxEl.width)
      setPanelWidth((prev) => (prev === w ? prev : w))
    }
  })

  // left-align label, right-align value — auto-fill space between
  const justify = (label: string, value: string, unit = ""): string => {
    const gauge = panelWidth() - gutter()
    const used = visualWidth(label) + visualWidth(value) + (unit ? visualWidth(unit) + UNIT_GAP : 0)
    const gap = Math.max(1, gauge - used)
    return label + " ".repeat(gap) + value + (unit ? " " + unit : "")
  }

  return (
    <box
      border={borderVisible()}
      {...(borderVisible() ? { borderColor: pal().border } : {})}
      paddingTop={0}
      paddingBottom={0}
      paddingLeft={borderVisible() ? 2 : 0}
      paddingRight={borderVisible() ? 2 : 0}
      flexDirection="column"
      gap={0}
      ref={boxEl}
      onSizeChange={() => {
        // boxEl.width may be undefined before the first measurement — guard with 0
        const w = boxEl ? Math.max(MIN_PANEL_WIDTH, boxEl.width ?? 0) : DEFAULT_PANEL_WIDTH
        setPanelWidth((prev) => (prev === w ? prev : w))
      }}
    >
      {/* collapsible header */}
      <text onMouseUp={() => setOpen((o) => { const n = !o; persistFold("open", n); return n })}>
        <span style={{ fg: pal().muted }}>{open() ? "\u25bc " : "\u25b6 "}</span>
        <span style={{ fg: pal().primary }}>
            <b>{t().title}</b>
            <Show when={open()}>
              <span style={{ fg: dimColor(pal().muted, 0.75) }}> v{PLUGIN_VERSION}</span>
            </Show>
          </span>
        <Show when={!open() && data().hasData}>
          <Show when={data().hasTrendData}>
            <span>
              {" ".repeat(Math.max(1, panelWidth() - gutter() - HEADER_PREFIX - visualWidth(t().title) - visualWidth(pct() + " " + t().hitFolded + " " + trendLabel(data().trend))))}
            </span>
            <span style={{ fg: hitColor() }}>{pct()} {t().hitFolded}</span>
            <span style={{ fg: data().trend !== 0 ? (data().trend > 0 ? pal().success : pal().error) : pal().text }}>
              {" "}{trendLabel(data().trend)}
            </span>
          </Show>
          <Show when={!data().hasTrendData}>
            <span>
              {" ".repeat(Math.max(1, panelWidth() - gutter() - HEADER_PREFIX - visualWidth(t().title) - visualWidth(pct() + " " + t().hitFolded)))}
            </span>
            <span style={{ fg: hitColor() }}>{pct()} {t().hitFolded}</span>
          </Show>
        </Show>
      </text>

      <Show when={open()}>
        <Show when={props.signals.overrideSessionId()}>
          {(() => {
            const prefix = "  \u21b3 " + (langZH() ? "\u5B50\u4EE3\u7406: " : "Sub: ")
            const maxSidW = Math.max(6, panelWidth() - visualWidth(prefix))
            return (
              <text>
                <span style={{ fg: pal().muted }}>{prefix}</span>
                <span style={{ fg: pal().text }}>{truncateVisual(props.signals.overrideSessionId()!, maxSidW)}</span>
              </text>
            )
          })()}
        </Show>
        <Show when={data().hasData} fallback={
          <>
            <text fg={pal().muted}>{sep()}</text>
            <text>
              <span style={{ fg: pal().muted }}>{"> "}</span>
              <span style={{ fg: pal().muted }}>{t().noData}</span>
            </text>
          </>
        }>
          <text fg={pal().muted}>{sep()}</text>

          {/* hit rate + bar — inline to avoid box spacing */}
          <text>
            <span style={{ fg: pal().text }}>{t().hit} </span>
            <span style={{ fg: hitColor() }}>[{bar()}] </span>
            <span style={{ fg: pal().text }}>{pct()}</span>
            <Show when={data().hasTrendData}>
              <span style={{ fg: data().trend !== 0 ? (data().trend > 0 ? pal().success : pal().error) : pal().text }}>
                {" "}{trendLabel(data().trend)}
              </span>
            </Show>
          </text>

          {/* session cumulative hit rate */}
          <text fg={pal().muted}>
            {justify(t().totalHit, (Math.floor(data().sessionHitRate * 10) / 10).toFixed(1) + "%")}
          </text>

          {/* ── duration section (collapsible, default open) ── */}
          <Show when={sectionDuration()}>
          <text onMouseUp={() => setDurationOpen((o) => { const n = !o; persistFold("duration", n); return n })}>
            <span style={{ fg: pal().muted }}>{durationOpen() ? "\u25bc " : "\u25b6 "}</span>
            <span style={{ fg: pal().primary }}><b>{t().secDuration}</b></span>
            <span style={{ fg: pal().muted }}>{sep().slice(visualWidth((durationOpen() ? "\u25bc " : "\u25b6 ") + t().secDuration))}</span>
          </text>
          <Show when={durationOpen()}>
            <text fg={pal().muted}>
              {justify(t().duration, formatDuration(elapsedSeconds()))}
            </text>
          </Show>
          </Show>

          {/* ── detail section (collapsible, default open) ── */}
          <Show when={sectionDetail()}>
          <text onMouseUp={() => setDetailOpen((o) => { const n = !o; persistFold("detail", n); return n })}>
            <span style={{ fg: pal().muted }}>{detailOpen() ? "\u25bc " : "\u25b6 "}</span>
            <span style={{ fg: pal().primary }}><b>{t().secDetail}</b></span>
            <span style={{ fg: pal().muted }}>{sep().slice(visualWidth((detailOpen() ? "\u25bc " : "\u25b6 ") + t().secDetail))}</span>
          </text>

          <Show when={detailOpen()}>
            <Show when={data().read > 0}>
              <text fg={pal().muted}>
                {justify(t().read,  fmt(data().read),         t().tok)}
              </text>
            </Show>
            <Show when={data().write > 0}>
              <text fg={pal().muted}>
                {justify(t().write, fmt(data().write),        t().tok)}
              </text>
            </Show>
            <text fg={pal().muted}>
              {justify(t().miss,  fmt(data().freshInput),   t().tok)}
            </text>
            <text fg={pal().muted}>
              {justify(t().out,   fmt(data().output),       t().tok)}
            </text>
            <Show when={data().saved > 0}>
              <text>
                <span style={{ fg: pal().muted }}>{t().saved}</span>
                <span>{" ".repeat(Math.max(1, panelWidth() - gutter() - visualWidth(t().saved) - visualWidth("~" + fmtCost(data().saved, currencySymbol(), exchangeRate()))))}</span>
                <span style={{ fg: pal().success }}>~{fmtCost(data().saved, currencySymbol(), exchangeRate())}</span>
              </text>
            </Show>
          </Show>
          </Show>

          {/* ── model section (collapsible, default open) ── */}
          <Show when={sectionModel()}>
          {<text onMouseUp={() => setModelOpen((o) => { const n = !o; persistFold("model", n); return n })}>
            <span style={{ fg: pal().muted }}>{modelOpen() ? "\u25bc " : "\u25b6 "}</span>
            <span style={{ fg: pal().primary }}><b>{t().secModel}</b></span>
            <span style={{ fg: pal().muted }}>{sep().slice(visualWidth((modelOpen() ? "\u25bc " : "\u25b6 ") + t().secModel))}</span>
          </text>}

          <Show when={modelOpen()}>
            <text fg={pal().text}>
              {justify(t().cost,  fmtCost(data().cost, currencySymbol(), exchangeRate()))}
            </text>
            <Show when={data().providerName}>
              <text fg={pal().muted}>
                {justify(t().provider, data().providerName)}
              </text>
            </Show>
            <text fg={pal().muted}>
              {justify(t().model, data().model)}
            </text>
            <Show when={data().hasPricing}>
              <text fg={pal().muted}>
                {justify(t().rate, currencySymbol() + (data().inputRate * exchangeRate()).toFixed(2) + "/M " + t().inputRate)}
              </text>
              <Show when={data().cacheReadRate > 0}>
                <text fg={pal().muted}>
                  {justify("", currencySymbol() + (data().cacheReadRate * exchangeRate()).toFixed(2) + "/M " + t().cacheRate)}
                </text>
              </Show>
              <Show when={data().cacheWriteRate > 0}>
                <text fg={pal().muted}>
                  {justify("", currencySymbol() + (data().cacheWriteRate * exchangeRate()).toFixed(2) + "/M " + t().writeRate)}
                </text>
            </Show>
          </Show>
          </Show>
        </Show>

          {/* ── token distribution (collapsible, default closed) ── */}
          <Show when={sectionDist()}>
          <Show when={data().hasDistData}>
            {<text onMouseUp={() => setDistOpen((o) => { const n = !o; persistFold("dist", n); return n })}>
              <span style={{ fg: pal().muted }}>{distOpen() ? "\u25bc " : "\u25b6 "}</span>
              <span style={{ fg: pal().primary }}><b>{t().distTitle}</b></span>
              <span style={{ fg: pal().muted }}>{sep().slice(visualWidth((distOpen() ? "\u25bc " : "\u25b6 ") + t().distTitle))}</span>
            </text>}
            <Show when={distOpen()}>
            <Show when={data().dist.system > 0}>
              <text fg={pal().muted}>
                {justify(t().distSys, fmt(data().dist.system), t().tok)}
              </text>
            </Show>
            <Show when={data().dist.user > 0}>
              <text fg={pal().muted}>
                {justify(t().distUser, fmt(data().dist.user), t().tok)}
              </text>
            </Show>
            <Show when={data().dist.agent > 0}>
              <text fg={pal().muted}>
                {justify(t().distAgent, fmt(data().dist.agent), t().tok)}
              </text>
            </Show>
            <Show when={data().dist.toolCall > 0}>
              <text fg={pal().muted}>
                {justify(t().distTool, fmt(data().dist.toolCall), t().tok)}
              </text>
            </Show>
            <Show when={data().dist.toolResult > 0}>
              <text fg={pal().muted}>
                {justify(t().distRes, fmt(data().dist.toolResult), t().tok)}
              </text>
            </Show>
            <text fg={pal().text}>
              {justify(t().distTotal, fmt(data().dist.apiInput), t().tok)}
            </text>
            </Show>
          </Show>
          </Show>

          {/* ── loaded skills (collapsible, default open) ── */}
          <Show when={sectionSkills()}>
          <Show when={data().hasSkills}>
            {<text onMouseUp={() => setSkillsOpen((o) => { const n = !o; persistFold("skills", n); return n })}>
              <span style={{ fg: pal().muted }}>{skillsOpen() ? "\u25bc " : "\u25b6 "}</span>
              <span style={{ fg: pal().primary }}><b>{t().secSkills}</b></span>
              <span style={{ fg: pal().muted }}> ({data().skills.length})</span>
              <span style={{ fg: pal().muted }}>{sep().slice(visualWidth((skillsOpen() ? "\u25bc " : "\u25b6 ") + t().secSkills + ` (${data().skills.length})`))}</span>
            </text>}
            <Show when={skillsOpen()}>
                {data().skills.map((sk: { name: string; tokens: number }) => {
                  const rightW = visualWidth(fmt(sk.tokens)) + UNIT_GAP + visualWidth(t().tok)
                  const maxLabel = Math.max(4, panelWidth() - gutter() - rightW - 1)
                  const label = truncateVisual(sk.name, maxLabel)
                  return (
                    <text fg={pal().muted}>
                      {justify(label, fmt(sk.tokens), t().tok)}
                    </text>
                  )
                })}
            </Show>
          </Show>
          </Show>

          {/* ── DeepSeek balance (collapsible, default open) ── */}
          <Show when={sectionBalance()}>
            {<text onMouseUp={() => setBalanceOpen((o) => { const n = !o; persistFold("balance", n); return n })}>
              <span style={{ fg: pal().muted }}>{balanceOpen() ? "\u25bc " : "\u25b6 "}</span>
              <span style={{ fg: pal().primary }}><b>{t().secBalance}</b></span>
              <span style={{ fg: pal().muted }}>{sep().slice(visualWidth((balanceOpen() ? "\u25bc " : "\u25b6 ") + t().secBalance))}</span>
            </text>}
            <Show when={balanceOpen()}>
              <Show when={balanceState().status === "idle"}>
                <text fg={pal().muted}>
                  <span style={{ fg: pal().muted }}>{"> "}</span>
                  <span>{t().balNoKey}</span>
                </text>
              </Show>
              <Show when={balanceState().status === "loading"}>
                <text fg={pal().muted}>
                  <span style={{ fg: pal().muted }}>{"> "}</span>
                  <span>{t().balLoading}</span>
                </text>
              </Show>
              <Show when={balanceState().status === "error"}>
                <text fg={pal().error}>
                  <span style={{ fg: pal().muted }}>{"> "}</span>
                  <span>{t().balError}</span>
                </text>
              </Show>
              <Show when={balanceState().status === "ok" && balanceState().data}>
                {(() => {
                  const b = balanceState().data!
                  const sym = b.currency === "CNY" ? "\u00a5" : b.currency === "USD" ? "$" : b.currency + " "
                  return (
                    <text fg={pal().text}>
                      {justify(t().balTotal, sym + b.total)}
                    </text>
                  )
                })()}
              </Show>
            </Show>
          </Show>

          {/* ── model usage log (collapsible, default open) ── */}
          <Show when={sectionModels()}>
          <Show when={data().modelUsage && data().modelUsage.length > 0}>
            {<text onMouseUp={() => setModelsOpen((o) => { const n = !o; persistFold("models", n); return n })}>
              <span style={{ fg: pal().muted }}>{modelsOpen() ? "\u25bc " : "\u25b6 "}</span>
              <span style={{ fg: pal().primary }}><b>{t().secModels}</b></span>
              <span style={{ fg: pal().muted }}> ({data().modelUsage.length})</span>
              <span style={{ fg: pal().muted }}>{sep().slice(visualWidth((modelsOpen() ? "\u25bc " : "\u25b6 ") + t().secModels + ` (${data().modelUsage.length})`))}</span>
            </text>}
            <Show when={modelsOpen()}>
              {data().modelUsage.map((m: { name: string; tokens: number; calls: number }) => {
                const shortName = m.name.split("/").pop() ?? m.name
                const rightStr = fmt(m.tokens) + " " + t().tok
                const callsStr = `${m.calls}${t().mdlCalls}`
                const rightW = visualWidth(rightStr) + UNIT_GAP + visualWidth(callsStr)
                const maxLabel = Math.max(4, panelWidth() - gutter() - rightW - 2)
                const label = truncateVisual(shortName, maxLabel)
                return (
                  <text fg={pal().muted}>
                    {label} {" ".repeat(Math.max(1, panelWidth() - gutter() - visualWidth(label) - rightW))}{rightStr} {callsStr}
                  </text>
                )
              })}
            </Show>
          </Show>
          </Show>

          {/* ── git status (collapsible, default open) ── */}
          <Show when={sectionGit()}>
            {<text onMouseUp={() => setGitOpen((o) => { const n = !o; persistFold("git", n); return n })}>
              <span style={{ fg: pal().muted }}>{gitOpen() ? "\u25bc " : "\u25b6 "}</span>
              <span style={{ fg: pal().primary }}><b>{t().secGit}</b></span>
              <span style={{ fg: pal().muted }}>{sep().slice(visualWidth((gitOpen() ? "\u25bc " : "\u25b6 ") + t().secGit))}</span>
            </text>}
            <Show when={gitOpen()}>
              <Show when={!gitState().isRepo}>
                <text fg={pal().muted}>
                  <span style={{ fg: pal().muted }}>{"> "}</span>
                  <span>{t().gitNoRepo}</span>
                </text>
              </Show>
              <Show when={gitState().isRepo}>
                <text fg={pal().text}>
                  {justify(t().gitBranch, truncateVisual(gitState().branch, Math.max(6, panelWidth() - gutter() - visualWidth(t().gitBranch) - 1)))}
                </text>
                <Show when={gitState().modified + gitState().staged + gitState().untracked === 0}>
                  <text fg={pal().success}>
                    <span style={{ fg: pal().muted }}>{"> "}</span>
                    <span>{t().gitClean}</span>
                  </text>
                </Show>
                <Show when={gitState().modified > 0}>
                  <text fg={pal().muted}>
                    {justify(t().gitModified, String(gitState().modified))}
                  </text>
                </Show>
                <Show when={gitState().staged > 0}>
                  <text fg={pal().muted}>
                    {justify(t().gitStaged, String(gitState().staged))}
                  </text>
                </Show>
                <Show when={gitState().untracked > 0}>
                  <text fg={pal().muted}>
                    {justify(t().gitUntracked, String(gitState().untracked))}
                  </text>
                </Show>
                <Show when={gitState().ahead > 0}>
                  <text fg={pal().success}>
                    {justify(t().gitAhead, "\u2191" + gitState().ahead)}
                  </text>
                </Show>
                <Show when={gitState().behind > 0}>
                  <text fg={pal().warning}>
                    {justify(t().gitBehind, "\u2193" + gitState().behind)}
                  </text>
                </Show>
                <Show when={gitState().files.length > 0}>
                  <text onMouseUp={() => setGitFilesOpen((o) => { const n = !o; persistFold("gitfiles", n); return n })}>
                    <span style={{ fg: pal().muted }}>{gitFilesOpen() ? "\u25bc " : "\u25b6 "}</span>
                    <span style={{ fg: pal().muted }}>{gitState().files.length} files</span>
                  </text>
                  <Show when={gitFilesOpen()}>
                    {gitState().files.map((f: string) => {
                      const short = f.length > panelWidth() - gutter() - 2 ? "\u2026" + f.slice(-(panelWidth() - gutter() - 3)) : f
                      return (
                        <text fg={pal().muted}>
                          {"  "}{short}
                        </text>
                      )
                    })}
                  </Show>
                </Show>
              </Show>
            </Show>
          </Show>
        </Show>
      </Show>
    </box>
  )
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

function createSidebarSlot(api: TuiPluginApi, signals: PanelSignals): TuiSlotPlugin {
  let lastSlotSid = ""
  return {
    order: 55,
    slots: {
      sidebar_content(ctx: TuiSlotContext, input: { session_id: string }): JSX.Element {
        // ── auto-clear override when the user navigates to a different main session ──
        if (input.session_id !== lastSlotSid) {
          lastSlotSid = input.session_id
          if (signals.overrideSessionId()) {
            signals.setOverrideSessionId(undefined)
            api.kv.set("cache_panel.session", "")
          }
        }
        return (
          <TokenCachePanel
            theme={ctx.theme.current}
            api={api}
            sessionId={input.session_id}
            signals={signals}
          />
        )
      },
    },
  }
}

const tui: TuiPlugin = async (api: TuiPluginApi) => {
  // ── shared panel signals ──────────────────────────────────────
  const [currencySymbol, setCurrencySymbol] = createSignal("$")
  const [exchangeRate, setExchangeRate] = createSignal(1)
  const [sectionDetail, setSectionDetail] = createSignal(true)
  const [sectionModel, setSectionModel] = createSignal(true)
  const [sectionDist, setSectionDist] = createSignal(true)
  const [sectionSkills, setSectionSkills] = createSignal(true)
  const [sectionBalance, setSectionBalance] = createSignal(true)
  const [sectionModels, setSectionModels] = createSignal(true)
  const [sectionGit, setSectionGit] = createSignal(true)
  const [sectionDuration, setSectionDuration] = createSignal(true)
  const [borderVisible, setBorderVisible] = createSignal(true)
  const [langZH, setLangZH] = createSignal(LANG_ZH)
  const [overrideSessionId, setOverrideSessionId] = createSignal<string | undefined>(undefined)

  const signals: PanelSignals = {
    currencySymbol, setCurrencySymbol,
    exchangeRate, setExchangeRate,
    langZH, setLangZH,
    sectionDetail, setSectionDetail,
    sectionModel, setSectionModel,
    sectionDist, setSectionDist,
    sectionSkills, setSectionSkills,
    sectionBalance, setSectionBalance,
    sectionModels, setSectionModels,
    sectionGit, setSectionGit,
    sectionDuration, setSectionDuration,
    borderVisible, setBorderVisible,
    overrideSessionId, setOverrideSessionId,
  }

  api.slots.register(createSidebarSlot(api, signals))

  // ── slash commands for runtime config ──
  const KV_PREFIX = "cache_panel"
  api.command?.register(() => [
    {
      title: "Cache: Set Currency",
      value: "cache.currency",
      description: "Change the currency unit for cost display",
      slash: { name: "cache-currency" },
      onSelect: (dialog) => {
        dialog?.replace(() => (
          <api.ui.DialogSelect
            title="Select Currency"
            options={Object.entries(CURRENCIES).map(([code, sym]) => ({
              title: `${code}  (${sym})`,
              value: code,
            }))}
            onSelect={(opt) => {
              const sym = CURRENCIES[opt.value] ?? "$"
              const defRate = DEFAULT_RATES[opt.value] ?? 1
              api.kv.set(`${KV_PREFIX}.currency`, sym)
              api.kv.set(`${KV_PREFIX}.rate`, defRate)
              signals.setCurrencySymbol(sym)
              signals.setExchangeRate(defRate)
              api.ui.toast({ message: `Currency: ${opt.value} (${sym}), rate: ${defRate}` })
              dialog?.clear()
            }}
          />
        ))
      },
    },
    {
      title: "Cache: Set Exchange Rate",
      value: "cache.rate",
      description: "Set the exchange rate multiplier for the selected currency",
      slash: { name: "cache-rate" },
      onSelect: (dialog) => {
        dialog?.replace(() => (
          <api.ui.DialogPrompt
            title="Exchange Rate"
            description={() => <text>Enter the exchange rate from USD to your currency (e.g. 7.2 for CNY)</text>}
            placeholder="1.0"
            value={String(api.kv.get<number>(`${KV_PREFIX}.rate`, 1))}
            onConfirm={(val) => {
              const n = parseFloat(val)
              if (n > 0) {
                api.kv.set(`${KV_PREFIX}.rate`, n)
                signals.setExchangeRate(n)
                api.ui.toast({ message: `Exchange rate set to ${n}` })
              }
              dialog?.clear()
            }}
          />
        ))
      },
    },
    {
      title: "Cache: Toggle Section",
      value: "cache.section",
      description: "Show or hide a sidebar section",
      slash: { name: "cache-section" },
      onSelect: (dialog) => {
        const detailOn = Boolean(api.kv.get(`${KV_PREFIX}.section.detail`, true))
        const modelOn  = Boolean(api.kv.get(`${KV_PREFIX}.section.model`, true))
        const distOn   = Boolean(api.kv.get(`${KV_PREFIX}.section.dist`, true))
        const skillsOn = Boolean(api.kv.get(`${KV_PREFIX}.section.skills`, true))
        const balanceOn = Boolean(api.kv.get(`${KV_PREFIX}.section.balance`, true))
        const modelsOn = Boolean(api.kv.get(`${KV_PREFIX}.section.models`, true))
        const gitOn    = Boolean(api.kv.get(`${KV_PREFIX}.section.git`, true))
        const durationOn = Boolean(api.kv.get(`${KV_PREFIX}.section.duration`, true))
        const borderOn = Boolean(api.kv.get(`${KV_PREFIX}.border`, true))
        dialog?.replace(() => (
          <api.ui.DialogSelect
            title="Toggle Section"
            options={[
              { title: `Token Detail    [${detailOn ? "ON" : "OFF"}]`,  value: "detail" },
              { title: `Model & Pricing [${modelOn  ? "ON" : "OFF"}]`,  value: "model" },
              { title: `Token Dist.     [${distOn   ? "ON" : "OFF"}]`,  value: "dist" },
              { title: `Loaded Skills   [${skillsOn ? "ON" : "OFF"}]`,  value: "skills" },
              { title: `DS Balance      [${balanceOn ? "ON" : "OFF"}]`, value: "balance" },
              { title: `Model Log       [${modelsOn ? "ON" : "OFF"}]`,  value: "models" },
              { title: `Git Status      [${gitOn    ? "ON" : "OFF"}]`,  value: "git" },
              { title: `Duration        [${durationOn ? "ON" : "OFF"}]`, value: "duration" },
              { title: `Panel Border    [${borderOn ? "ON" : "OFF"}]`,  value: "border" },
            ]}
            onSelect={(opt) => {
              if (opt.value === "border") {
                const cur = Boolean(api.kv.get(`${KV_PREFIX}.border`, true))
                api.kv.set(`${KV_PREFIX}.border`, !cur)
                signals.setBorderVisible(!cur)
                api.ui.toast({ message: `Panel border ${!cur ? "shown" : "hidden"}` })
              } else {
                const key = `${KV_PREFIX}.section.${opt.value}`
                const cur = Boolean(api.kv.get(key, true))
                api.kv.set(key, !cur)
                if (opt.value === "detail") signals.setSectionDetail(!cur)
                if (opt.value === "model")  signals.setSectionModel(!cur)
                if (opt.value === "dist")   signals.setSectionDist(!cur)
                if (opt.value === "skills") signals.setSectionSkills(!cur)
                if (opt.value === "balance") signals.setSectionBalance(!cur)
                if (opt.value === "models") signals.setSectionModels(!cur)
                if (opt.value === "git")    signals.setSectionGit(!cur)
                if (opt.value === "duration") signals.setSectionDuration(!cur)
                api.ui.toast({ message: `${opt.value} section ${!cur ? "shown" : "hidden"}` })
              }
              dialog?.clear()
            }}
          />
        ))
      },
    },
    {
      title: "Cache: Show Config",
      value: "cache.config",
      description: "Display the current plugin configuration",
      slash: { name: "cache-config" },
      onSelect: (dialog) => {
        const sym = api.kv.get<string>(`${KV_PREFIX}.currency`) ?? "$"
        const rate = api.kv.get<number>(`${KV_PREFIX}.rate`) ?? 1
        const detail = Boolean(api.kv.get(`${KV_PREFIX}.section.detail`, true))
        const model = Boolean(api.kv.get(`${KV_PREFIX}.section.model`, true))
        const dist = Boolean(api.kv.get(`${KV_PREFIX}.section.dist`, true))
        const skills = Boolean(api.kv.get(`${KV_PREFIX}.section.skills`, true))
        api.ui.toast({
          title: "Cache Panel Config",
          message: `Currency: ${sym}  |  Rate: ${rate}  |  Detail: ${detail ? "ON" : "OFF"}  |  Model: ${model ? "ON" : "OFF"}  |  Dist: ${dist ? "ON" : "OFF"}  |  Skills: ${skills ? "ON" : "OFF"}`,
          duration: 8000,
        })
        dialog?.clear()
      },
    },
    {
      title: "Cache: Switch Language",
      value: "cache.lang",
      description: "Switch between Chinese and English display",
      slash: { name: "cache-lang" },
      onSelect: (dialog) => {
        const cur = langZH()
        dialog?.replace(() => (
          <api.ui.DialogSelect
            title="Display Language"
            options={[
              { title: `中文    ${cur ? "\u2713" : ""}`, value: "zh" },
              { title: `English ${cur ? "" : "\u2713"}`, value: "en" },
            ]}
            onSelect={(opt) => {
              const zh = opt.value === "zh"
              api.kv.set(`${KV_PREFIX}.lang`, opt.value)
              setLangZH(zh)
              api.ui.toast({ message: zh ? "语言已切换为中文" : "Switched to English" })
              dialog?.clear()
            }}
          />
        ))
      },
    },
    {
      title: "Cache: Debug Skills Detection",
      value: "cache.debug-skills",
      description: "Dump all tool parts found in the current session for skill detection debugging",
      slash: { name: "cache-debug-skills" },
      onSelect: () => {
        const rt = api.route.current
        if (rt.name !== "session" || !rt.params) {
          api.ui.toast({ message: "Please run this command inside a session", variant: "warning" })
          return
        }
        const sid = String(rt.params.sessionID)
        const msgs = api.state.session.messages(sid)
        const byTool: Record<string, number> = {}
        const skillParts: string[] = []
        for (const msg of msgs) {
          if (msg.role !== "assistant") continue
          let parts: readonly any[] = []
          try { parts = api.state.part(msg.id) } catch {}
          for (const p of parts) {
            if (p.type === "tool") {
              const t = String(p.tool ?? "?")
              byTool[t] = (byTool[t] ?? 0) + 1
              if (t === "skill") {
                const meta = p.state?.metadata
                const rootMeta = p.metadata
                skillParts.push(`state.metadata=${JSON.stringify(meta)} | root.metadata=${JSON.stringify(rootMeta)} | state.title="${p.state?.title}" | state.output[:80]="${String(p.state?.output ?? "").slice(0, 80)}"`)
              }
            }
          }
        }
        const summary = Object.entries(byTool).map(([k, v]) => `${k}: ${v}`).join(" | ")
        const extra = skillParts.length > 0 ? "\n\nSkill parts:\n" + skillParts.join("\n") : "\n\n⚠ No skill tool parts found — AI may be reading SKILL.md instead. Try: 'Use the skill tool to load karpathy-guidelines'"
        api.ui.toast({
          title: `Tool Summary (${Object.keys(byTool).length} types)`,
          message: summary + extra,
          duration: 15000,
        })
      },
    },
    {
      title: "Cache: Sub-Agent Stats",
      value: "cache.session",
      description: "View token cache statistics for a sub-agent by session ID",
      slash: { name: "cache-session" },
      onSelect: (dialog) => {
        // ── 扫描当前主 session 的子代理 session ID 列表 ──
        const rt = api.route.current
        const parentSid = rt.name === "session" && rt.params ? String(rt.params.sessionID) : ""
        const SUBAGENT_TOOLS = new Set(["task", "delegate", "call_omo_agent"])

        interface ChildEntry { title: string; value: string; description: string }
        const children: ChildEntry[] = []
        if (parentSid) {
          try {
            const msgs = api.state.session.messages(parentSid)
            for (const msg of msgs) {
              if (msg.role !== "assistant") continue
              let parts: readonly Part[] = []
              try { parts = api.state.part(msg.id) } catch {}
              for (const p of parts) {
                if (p.type !== "tool") continue
                const tool = String((p as ToolPart).tool ?? "")
                if (!SUBAGENT_TOOLS.has(tool)) continue
                const st = (p as any).state as Record<string, unknown> | undefined
                const stMeta = st?.metadata as Record<string, unknown> | undefined
                const subSid = stMeta?.session_id ?? stMeta?.sessionId
                if (!subSid) continue
                const sidStr = String(subSid)
                const input = st?.input as Record<string, unknown> | undefined
                const agent = String((p as any).subagent_type ?? input?.subagent_type ?? input?.category ?? tool)
                const prompt = String(input?.prompt ?? "")
                const desc = input?.description ? String(input.description) : ""
                const title = desc || prompt.replace(/\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || agent
                children.push({ title, value: sidStr, description: `${agent} · ${sidStr.slice(0, 24)}…` })
              }
            }
          } catch {}
        }

        // 去重
        const seen = new Set<string>()
        const unique = children.filter(c => { if (seen.has(c.value)) return false; seen.add(c.value); return true })

        if (unique.length > 0) {
          // ── 有子代理 → DialogSelect 列表选择 ──
          const zh = langZH()
          const currentSid = signals.overrideSessionId() ?? api.kv.get<string>(`${KV_PREFIX}.session`, "")
          const options = unique.map((c, i) => ({
            title: `${i + 1}. ${c.title}`,
            value: c.value,
            description: c.description,
          }))
          // 首尾各放一个"回到主会话"，长列表时顶部底部均可直达
          const backValue = "__main__"
          const backTitle = `\u2500 ${zh ? "\u56DE\u5230\u4E3B\u4F1A\u8BDD" : "Back to Main"}`
          options.unshift({ title: backTitle, value: backValue, description: "" })
          options.push({ title: backTitle, value: backValue, description: "" })
          const currentIdx = currentSid ? options.findIndex(o => o.value === currentSid) : -1
          dialog?.replace(() => (
            <api.ui.DialogSelect
              title={zh ? "选择子代理" : "Select Sub-Agent"}
              options={options}
              current={currentIdx >= 0 ? options[currentIdx].value : undefined}
              onSelect={(opt) => {
                if (opt.value === backValue) {
                  signals.setOverrideSessionId(undefined)
                  api.kv.set(`${KV_PREFIX}.session`, "")
                  api.ui.toast({ message: zh ? "已切回主会话" : "Switched to main session" })
                } else {
                  signals.setOverrideSessionId(opt.value)
                  api.kv.set(`${KV_PREFIX}.session`, opt.value)
                  api.ui.toast({ message: (zh ? "已切换至子代理: " : "Showing sub-agent: ") + opt.value.slice(0, 24) + "\u2026" })
                }
                dialog?.clear()
              }}
            />
          ))
        } else {
          // ── 无子代理 → DialogPrompt 手动粘贴 ──
          const zh = langZH()
          dialog?.replace(() => (
            <api.ui.DialogPrompt
              title={signals.overrideSessionId() ? zh ? "切换子代理" : "Switch Sub" : zh ? "查看子代理缓存" : "View Sub Cache"}
              description={() => <text>{zh ? "未找到子代理，请手动粘贴 Session ID" : "No sub-agents found. Paste a Session ID manually"}</text>}
              placeholder="ses_..."
              value={signals.overrideSessionId() ?? api.kv.get<string>(`${KV_PREFIX}.session`, "") ?? ""}
              onConfirm={(val) => {
                const sid = val.trim()
                if (sid) {
                  signals.setOverrideSessionId(sid)
                  api.kv.set(`${KV_PREFIX}.session`, sid)
                  api.ui.toast({ message: (langZH() ? "已切换至子代理: " : "Showing sub-agent: ") + sid.slice(0, 24) + "\u2026" })
                }
                dialog?.clear()
              }}
              onCancel={() => dialog?.clear()}
            />
          ))
        }
      },
    },
    {
      title: "Cache: Set DeepSeek API Key",
      value: "cache.balance.key",
      description: "Set or update the DeepSeek API key for balance display",
      slash: { name: "cache-balance-key" },
      onSelect: (dialog) => {
        const zh = langZH()
        const current = api.kv.get<string>(`${KV_PREFIX}.ds_key`, "")
        dialog?.replace(() => (
          <api.ui.DialogPrompt
            title={zh ? "DeepSeek API Key" : "DeepSeek API Key"}
            description={() => <text>{zh ? "输入 DeepSeek API Key 以显示账户余额（留空则清除）" : "Enter your DeepSeek API key to show account balance (leave empty to clear)"}</text>}
            placeholder="sk-..."
            value={current}
            onConfirm={(val) => {
              const key = val.trim()
              api.kv.set(`${KV_PREFIX}.ds_key`, key)
              if (key) {
                api.ui.toast({ message: zh ? "API Key 已保存，正在查询余额..." : "API Key saved, fetching balance..." })
              } else {
                api.ui.toast({ message: zh ? "API Key 已清除" : "API Key cleared" })
              }
              dialog?.clear()
            }}
            onCancel={() => dialog?.clear()}
          />
        ))
      },
    },
    {
      title: "Cache: Back to Main",
      value: "cache.session.back",
      description: "Return to main session stats",
      slash: { name: "cache-session-back" },
      onSelect: (dialog) => {
        signals.setOverrideSessionId(undefined)
        api.kv.set(`${KV_PREFIX}.session`, "")
        api.ui.toast({ message: langZH() ? "已切回主会话" : "Switched to main session" })
        dialog?.clear()
      },
    },
  ])
}

const mod: TuiPluginModule & { id: string } = {
  id: "opencode-visual-cache",
  tui,
}

export default mod
