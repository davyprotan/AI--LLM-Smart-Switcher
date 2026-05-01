export type ScreenId =
  | "dashboard"
  | "hardware"
  | "models"
  | "switcher"
  | "snapshots"
  | "settings"
  | "benchmark";

export type ProviderId = "anthropic" | "openai" | "google" | "ollama" | "llamaCpp";

export type StatusTone = "ok" | "warn" | "error" | "info" | "idle";
export type NativeSource = "native" | "mock";
export type WarningLevel = "info" | "warn" | "error";
export type IntegrationStatus = "connected" | "attention" | "missing" | "unsupported";
export type ParserState = "explicit" | "inferred" | "missing" | "invalid";

export interface NavigationItem {
  id: ScreenId;
  label: string;
  icon: string;
}

export interface WarningItem {
  id: string;
  title: string;
  message: string;
  tone: Exclude<StatusTone, "idle">;
}

export interface SessionMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
}

export interface HardwareGauge {
  id: string;
  label: string;
  used: number;
  total: number;
  unit: string;
  detail: string;
}

export interface HardwareProfile {
  os: string;
  gpu: {
    name: string;
    vendor: string;
    vramGb: number | null;
    driver: string;
  };
  cpu: {
    name: string;
    cores: number;
    threads: number;
    architecture?: string;
    frequencyGhz?: number | null;
  };
  memory: {
    totalGb: number;
    freeGb: number;
  };
  disk: {
    totalGb: number;
    freeGb: number;
  };
}

export interface RecommendationTier {
  id: string;
  label: string;
  rationale: string;
  models: string[];
}

export interface ModelCatalogItem {
  id: string;
  name: string;
  provider: string;
  family: string;
  contextWindow: string;
  installSize: string;
  vramRequirementGb: number | null;
  installStatus: "installed" | "available" | "warning";
  performanceHint: string;
  warning?: string | null;
}

export interface ModelCatalogPayload {
  ollamaAvailable: boolean;
  models: ModelCatalogItem[];
}

export interface ModelPullProgress {
  model: string;
  status: string;
  total: number | null;
  completed: number | null;
  error: string | null;
  done: boolean;
}

export interface ModelPullResult {
  model: string;
  success: boolean;
  error: string | null;
}

export interface ToolAssignment {
  id: string;
  tool: string;
  provider: ProviderId;
  assignedModel: string;
  configPath: string;
  status: "connected" | "attention" | "missing";
  repairHint: string;
}

export interface SnapshotItem {
  id: string;
  name: string;
  createdAt: string;
  summary: string;
  includes: string[];
  isDefault?: boolean;
}

export interface UiVariation {
  id: string;
  name: string;
  description: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "OK" | "SYS";
  message: string;
}

export interface BenchmarkResult {
  id: string;
  modelName: string;
  latencyMs: number;
  throughput: string;
  cost: string;
  verdict: string;
}

export interface RepairAction {
  id: string;
  label: string;
  description: string;
}

export interface CommandWarning {
  code: string;
  level: WarningLevel;
  message: string;
}

export interface CommandMeta {
  area: string;
  source: NativeSource;
  generatedAtEpochMs: number;
}

export interface CommandResponse<T> {
  data: T;
  warnings: CommandWarning[];
  meta: CommandMeta;
}

export interface HardwareScanPayload {
  profile: HardwareProfile;
  gauges: HardwareGauge[];
  recommendations: RecommendationTier[];
}

export interface DiscoveredIntegration {
  id: string;
  tool: string;
  configPath: string;
  status: IntegrationStatus;
  providerLabel: string;
  assignedModelLabel: string;
  repairHint: string;
  pathExists: boolean;
  pathReadable: boolean;
  pathWritable: boolean;
  discoveryMethod: string;
  parserState: ParserState;
  parserNote: string;
}

export interface IntegrationDiscoveryPayload {
  integrations: DiscoveredIntegration[];
}

export interface BaselineSnapshotEntry {
  id: string;
  tool: string;
  configPath: string;
  status: IntegrationStatus;
  providerLabel: string;
  assignedModelLabel: string;
  pathExists: boolean;
  pathReadable: boolean;
  pathWritable: boolean;
  discoveryMethod: string;
  parserState: ParserState;
  parserNote: string;
  checksum: string | null;
  contentLength: number | null;
}

export interface BaselineSnapshot {
  id: string;
  createdAt: string;
  storagePath: string;
  entries: BaselineSnapshotEntry[];
}

export interface SnapshotStorePayload {
  baseline: BaselineSnapshot | null;
}

export interface SnapshotDiffEntry {
  id: string;
  tool: string;
  state: "unchanged" | "changed" | "missingCurrent" | "newCurrent";
  changedFields: string[];
  baselineProviderLabel: string | null;
  currentProviderLabel: string | null;
  baselineModelLabel: string | null;
  currentModelLabel: string | null;
  baselineChecksum: string | null;
  currentChecksum: string | null;
}

export interface SnapshotDiffPayload {
  baselineId: string | null;
  entries: SnapshotDiffEntry[];
}

export interface SwitchChange {
  key: string;
  from: string | null;
  to: string;
}

export interface SwitchPlanPayload {
  toolId: string;
  tool: string;
  configPath: string;
  pathExists: boolean;
  pathReadable: boolean;
  pathWritable: boolean;
  currentProvider: string | null;
  currentModel: string | null;
  proposedProvider: string;
  proposedModel: string;
  changes: SwitchChange[];
  canApply: boolean;
  blockReason: string | null;
}

export interface ApplySwitchPayload {
  toolId: string;
  tool: string;
  configPath: string;
  backupPath: string | null;
  changesApplied: SwitchChange[];
  verified: boolean;
  rolledBack: boolean;
}

export interface BackupEntry {
  id: string;
  toolId: string;
  configPath: string;
  backupPath: string;
  createdAt: string;
  sizeBytes: number;
}

export interface BackupListPayload {
  backups: BackupEntry[];
}

export interface RevertPayload {
  backupPath: string;
  configPath: string;
  toolId: string;
  reverted: boolean;
}

export interface BenchmarkSpec {
  provider: string;
  model: string;
}

export interface BenchmarkResultEntry {
  provider: string;
  modelName: string;
  latencyMs: number;
  throughputTokensPerSec: number | null;
  totalTokens: number | null;
  error: string | null;
}

export interface BenchmarkRunPayload {
  prompt: string;
  results: BenchmarkResultEntry[];
}

export interface TelemetryPayload {
  cpuUsagePct: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  timestampMs: number;
}
