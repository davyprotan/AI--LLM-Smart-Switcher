import type {
  ActivityLogEntry,
  BenchmarkResult,
  HardwareGauge,
  HardwareProfile,
  ModelCatalogItem,
  RecommendationTier,
  RepairAction,
  SessionMetric,
  SnapshotItem,
  ToolAssignment,
  WarningItem,
} from "../types/domain";

export const APP_VERSION = "0.1.0";

// Real warnings are surfaced per-screen by the service layer (e.g. "Ollama not
// running" from listModels). The global list starts empty so the TopBar badge
// reflects reality rather than placeholder copy.
export const WARNINGS: WarningItem[] = [];

// Card structure stays so the user sees what metrics will land here once
// real session telemetry is wired. Values are neutral em-dashes until then.
export const SESSION_METRICS: SessionMetric[] = [
  { id: "tokens", label: "Live Tokens", value: "—", detail: "Awaiting session telemetry" },
  { id: "latency", label: "Latency", value: "—", detail: "Awaiting first request" },
  { id: "cost", label: "Cost", value: "—", detail: "Cost tracking pending" },
  { id: "throughput", label: "Throughput", value: "—", detail: "Awaiting first request" },
];

export const HARDWARE_PROFILE: HardwareProfile = {
  os: "Detected locally in next pass",
  gpu: {
    name: "Placeholder GPU",
    vendor: "Auto-detect planned",
    vramGb: 16,
    driver: "native probe pending",
  },
  cpu: {
    name: "Placeholder CPU",
    cores: 12,
    threads: 20,
  },
  memory: {
    totalGb: 32,
    freeGb: 12,
  },
  disk: {
    totalGb: 1024,
    freeGb: 418,
  },
};

// No mock fallback gauges — Dashboard now shows a "waiting" state until real
// telemetry arrives, so users never see fake numbers.
export const HARDWARE_GAUGES: HardwareGauge[] = [];

export const RECOMMENDATION_TIERS: RecommendationTier[] = [
  {
    id: "optimal",
    label: "Optimal",
    rationale: "Best fit for quality-heavy local or hybrid coding tasks on this hardware tier.",
    models: ["Llama 3.3 70B", "Claude Sonnet 4.5", "GPT-4o"],
  },
  {
    id: "balanced",
    label: "Balanced",
    rationale: "Good latency-quality balance for interactive development and repair workflows.",
    models: ["DeepSeek Coder 33B", "Gemini 2.0 Flash", "Qwen 2.5 Coder 7B"],
  },
  {
    id: "fast",
    label: "Fast",
    rationale: "Best suited for autocomplete, terminal tasks, and lower VRAM systems.",
    models: ["Mistral 7B", "Claude Haiku 4.5", "GPT-4o mini"],
  },
];

export const MODELS: ModelCatalogItem[] = [
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    family: "Claude",
    contextWindow: "200K",
    installSize: "API",
    vramRequirementGb: null,
    installStatus: "installed",
    performanceHint: "Strong coding baseline",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    family: "Claude",
    contextWindow: "200K",
    installSize: "API",
    vramRequirementGb: null,
    installStatus: "installed",
    performanceHint: "Fast low-cost routing",
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    family: "Claude",
    contextWindow: "200K",
    installSize: "API",
    vramRequirementGb: null,
    installStatus: "available",
    performanceHint: "High-end reasoning",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    family: "GPT",
    contextWindow: "128K",
    installSize: "API",
    vramRequirementGb: null,
    installStatus: "installed",
    performanceHint: "General-purpose premium",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    family: "GPT",
    contextWindow: "128K",
    installSize: "API",
    vramRequirementGb: null,
    installStatus: "installed",
    performanceHint: "Fast fallback option",
  },
  {
    id: "o3",
    name: "o3",
    provider: "openai",
    family: "OpenAI reasoning",
    contextWindow: "200K",
    installSize: "API",
    vramRequirementGb: null,
    installStatus: "available",
    performanceHint: "Deep reasoning workflow",
  },
  {
    id: "gemini-2-0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    family: "Gemini",
    contextWindow: "1M",
    installSize: "API",
    vramRequirementGb: null,
    installStatus: "installed",
    performanceHint: "Large-context fast path",
  },
  {
    id: "gemini-1-5-pro",
    name: "Gemini 1.5 Pro",
    provider: "google",
    family: "Gemini",
    contextWindow: "2M",
    installSize: "API",
    vramRequirementGb: null,
    installStatus: "available",
    performanceHint: "Very large context",
  },
  {
    id: "gemini-2-5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    family: "Gemini",
    contextWindow: "1M+",
    installSize: "API",
    vramRequirementGb: null,
    installStatus: "available",
    performanceHint: "Reasoning-focused compare slot",
  },
  {
    id: "llama-3-3-70b",
    name: "Llama 3.3 70B",
    provider: "ollama",
    family: "Llama",
    contextWindow: "128K",
    installSize: "42 GB",
    vramRequirementGb: 40,
    installStatus: "warning",
    performanceHint: "Great local quality when it fits",
    warning: "May require quantization or partial offload on mid-tier GPUs.",
  },
  {
    id: "mistral-7b",
    name: "Mistral 7B",
    provider: "ollama",
    family: "Mistral",
    contextWindow: "32K",
    installSize: "4.1 GB",
    vramRequirementGb: 6,
    installStatus: "installed",
    performanceHint: "Fast local starter",
  },
  {
    id: "deepseek-coder-33b",
    name: "DeepSeek Coder 33B",
    provider: "ollama",
    family: "DeepSeek",
    contextWindow: "16K",
    installSize: "19 GB",
    vramRequirementGb: 20,
    installStatus: "available",
    performanceHint: "Local coding specialist",
  },
  {
    id: "qwen2-5-coder-7b",
    name: "Qwen 2.5 Coder 7B",
    provider: "llamaCpp",
    family: "Qwen",
    contextWindow: "32K",
    installSize: "4.7 GB",
    vramRequirementGb: 6,
    installStatus: "available",
    performanceHint: "Portable coder fallback",
  },
  {
    id: "llama-3-2-3b-gguf",
    name: "Llama 3.2 3B GGUF",
    provider: "llamaCpp",
    family: "Llama",
    contextWindow: "128K",
    installSize: "2.0 GB",
    vramRequirementGb: 3,
    installStatus: "available",
    performanceHint: "Good for low-VRAM hardware",
  },
  {
    id: "phi-4-14b",
    name: "Phi-4 14B",
    provider: "llamaCpp",
    family: "Phi",
    contextWindow: "16K",
    installSize: "8.2 GB",
    vramRequirementGb: 10,
    installStatus: "available",
    performanceHint: "Compact reasoning option",
  },
];

export const TOOL_ASSIGNMENTS: ToolAssignment[] = [
  {
    id: "claude-code",
    tool: "Claude Code",
    provider: "anthropic",
    assignedModel: "Claude Sonnet 4.5",
    configPath: "~/.claude/config.json",
    status: "connected",
    repairHint: "Verify provider endpoint fallback and writable config permissions.",
  },
  {
    id: "vscode",
    tool: "VS Code",
    provider: "openai",
    assignedModel: "GPT-4o mini",
    configPath: "~/.continue/config.json",
    status: "connected",
    repairHint: "Confirm extension-specific provider schema before write support lands.",
  },
  {
    id: "cursor",
    tool: "Cursor",
    provider: "anthropic",
    assignedModel: "Claude Haiku 4.5",
    configPath: "~/.cursor/mcp.json",
    status: "missing",
    repairHint: "Auto-discovery for Cursor config paths will be added next.",
  },
  {
    id: "windsurf",
    tool: "Windsurf",
    provider: "google",
    assignedModel: "Gemini 2.0 Flash",
    configPath: "~/.codeium/windsurf/config.json",
    status: "connected",
    repairHint: "Add validation once provider switching logic is wired.",
  },
  {
    id: "jetbrains",
    tool: "JetBrains",
    provider: "openai",
    assignedModel: "GPT-4o",
    configPath: "~/.config/JetBrains/ai.json",
    status: "attention",
    repairHint: "Permission repair action will eventually set access and restore backups.",
  },
  {
    id: "terminal",
    tool: "Terminal",
    provider: "ollama",
    assignedModel: "Mistral 7B",
    configPath: "~/.llm-switcher/config.yaml",
    status: "connected",
    repairHint: "Provider aliasing and endpoint overrides still need implementation.",
  },
  {
    id: "neovim",
    tool: "Neovim",
    provider: "llamaCpp",
    assignedModel: "Qwen 2.5 Coder 7B",
    configPath: "~/.config/nvim/lua/plugins/llm.lua",
    status: "missing",
    repairHint: "Neovim profile generation is planned for the next pass.",
  },
];

export const SNAPSHOTS: SnapshotItem[] = [
  {
    id: "baseline",
    name: "Baseline Claude",
    createdAt: "2026-04-20 09:00",
    summary: "Restores Claude Code and premium API defaults.",
    includes: ["Anthropic keys", "Claude Code mapping", "VS Code fallback"],
    isDefault: true,
  },
  {
    id: "local-first",
    name: "Local-first",
    createdAt: "2026-04-19 14:22",
    summary: "Prefers Ollama and llama.cpp where compatible.",
    includes: ["Ollama endpoint", "Terminal mapping", "VRAM-aware warning rules"],
  },
  {
    id: "budget",
    name: "Budget Mode",
    createdAt: "2026-04-18 07:48",
    summary: "Routes lightweight tasks to low-cost or local options.",
    includes: ["GPT-4o mini", "Gemini Flash", "Mistral 7B"],
  },
];

// Real activity log streaming will be wired in a follow-up. Until then the
// Dashboard simply doesn't render this card.
export const ACTIVITY_LOG: ActivityLogEntry[] = [];

export const BENCHMARK_RESULTS: BenchmarkResult[] = [
  {
    id: "bench-1",
    modelName: "Claude Sonnet 4.5",
    latencyMs: 142,
    throughput: "28.4 tok/s",
    cost: "$0.016",
    verdict: "Best overall quality",
  },
  {
    id: "bench-2",
    modelName: "GPT-4o mini",
    latencyMs: 96,
    throughput: "81.0 tok/s",
    cost: "$0.004",
    verdict: "Best cost-performance",
  },
  {
    id: "bench-3",
    modelName: "Mistral 7B",
    latencyMs: 61,
    throughput: "94.0 tok/s",
    cost: "Local",
    verdict: "Best offline speed",
  },
];

export const REPAIR_ACTIONS: RepairAction[] = [
  {
    id: "scan-configs",
    label: "Rescan config paths",
    description: "Planned native command to rediscover tool configs before writing changes.",
  },
  {
    id: "validate-keys",
    label: "Validate API keys",
    description: "Will verify stored credentials and surface provider-specific repair hints.",
  },
  {
    id: "restore-defaults",
    label: "Restore original defaults",
    description: "Will revert provider assignments and backup files back to the captured baseline.",
  },
];

