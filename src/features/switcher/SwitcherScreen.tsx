import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { WarningBanner } from "../../components/ui/WarningBanner";
import { useAppState } from "../../app/state";

import { applySwitch, listAssignments, previewSwitchPlan } from "../../services/switcher";
import type { ApplySwitchPayload, CommandResponse, DiscoveredIntegration, IntegrationDiscoveryPayload, SwitchPlanPayload, WarningItem } from "../../types/domain";

const PROVIDER_OPTIONS = ["anthropic", "openai", "google", "ollama", "llamaCpp"] as const;
const MODEL_OPTIONS: Record<string, string[]> = {
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
  openai: ["gpt-4o", "gpt-4o-mini", "o1"],
  google: ["gemini-2.0-flash", "gemini-1.5-pro"],
  ollama: ["llama3.2:3b", "mistral:7b", "qwen2.5-coder:7b"],
  llamaCpp: ["llama-3.2-3b.gguf", "mistral-7b.gguf"],
};

interface PlanState {
  loading: boolean;
  result: CommandResponse<SwitchPlanPayload> | null;
}

interface ApplyState {
  loading: boolean;
  result: CommandResponse<ApplySwitchPayload> | null;
}

interface RowState {
  provider: string;
  model: string;
  plan: PlanState;
  apply: ApplyState;
}

function toStatusTone(status: string) {
  if (status === "connected") return "ok" as const;
  if (status === "attention") return "warn" as const;
  if (status === "missing") return "error" as const;
  return "info" as const;
}

function toWarningItems(warnings: CommandResponse<unknown>["warnings"], prefix: string): WarningItem[] {
  return warnings.map((w) => ({
    id: `${prefix}-${w.code}`,
    title: w.level === "warn" ? "Warning" : w.level === "error" ? "Error" : "Note",
    message: w.message,
    tone: w.level,
  }));
}

function IntegrationRow({
  integration,
  rowState,
  onProviderChange,
  onModelChange,
  onPreview,
  onApply,
}: {
  integration: DiscoveredIntegration;
  rowState: RowState;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onPreview: () => void;
  onApply: () => void;
}) {
  const { setCurrentScreen } = useAppState();
  const plan = rowState.plan.result?.data;
  const applyResult = rowState.apply.result?.data;
  const planWarnings = rowState.plan.result ? toWarningItems(rowState.plan.result.warnings, `plan-${integration.id}`) : [];
  const applyWarnings = rowState.apply.result ? toWarningItems(rowState.apply.result.warnings, `apply-${integration.id}`) : [];

  const canApply = plan?.canApply === true && (plan.changes.length ?? 0) > 0;

  return (
    <Card key={integration.id}>
      <div className="switcher-row">
        <div>
          <div className="row-heading">
            <h3>{integration.tool}</h3>
            <StatusPill tone={toStatusTone(integration.status)}>{integration.status}</StatusPill>
          </div>
          <p>
            {integration.assignedModelLabel} via {integration.providerLabel}
          </p>
          <small>{integration.configPath}</small>
        </div>

        <div className="stack-sm align-end">
          <Button>Copy path</Button>
          <Button variant="ghost">Repair hint</Button>
        </div>
      </div>

      <div className="meta-grid">
        <div>
          <small>Exists</small>
          <strong>{integration.pathExists ? "Yes" : "No"}</strong>
        </div>
        <div>
          <small>Readable</small>
          <strong>{integration.pathReadable ? "Yes" : "No"}</strong>
        </div>
        <div>
          <small>Writable</small>
          <strong>{integration.pathWritable ? "Yes" : "No"}</strong>
        </div>
        <div>
          <small>Discovery</small>
          <strong>{integration.discoveryMethod}</strong>
        </div>
        <div>
          <small>Parser</small>
          <strong>{integration.parserState}</strong>
        </div>
        <div>
          <small>Parser note</small>
          <strong>{integration.parserNote}</strong>
        </div>
      </div>

      <p className="repair-copy">{integration.repairHint}</p>

      <div className="switcher-plan-form">
        <div className="row-heading">
          <strong>Preview switch</strong>
        </div>
        <div className="stack-sm">
          <div className="plan-selects">
            <select value={rowState.provider} onChange={(e) => onProviderChange(e.target.value)}>
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select value={rowState.model} onChange={(e) => onModelChange(e.target.value)}>
              {(MODEL_OPTIONS[rowState.provider] ?? []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <Button variant="primary" onClick={onPreview} disabled={rowState.plan.loading || rowState.apply.loading}>
              {rowState.plan.loading ? "Previewing…" : "Preview plan"}
            </Button>
            <Button
              variant="danger"
              onClick={onApply}
              disabled={!canApply || rowState.apply.loading || rowState.plan.loading}
            >
              {rowState.apply.loading ? "Applying…" : "Apply"}
            </Button>
          </div>

          {plan && (
            <div className="plan-result">
              <div className="row-heading">
                <small>Plan result</small>
                <StatusPill tone={plan.canApply ? "ok" : "error"}>
                  {plan.canApply ? "ready to apply" : "blocked"}
                </StatusPill>
              </div>
              {plan.blockReason && <p className="repair-copy">{plan.blockReason}</p>}
              {plan.changes.length === 0 ? (
                <code>No changes — proposed values match current state.</code>
              ) : (
                plan.changes.map((change) => (
                  <code key={change.key}>
                    {change.key}: {change.from ?? "(none)"} → {change.to}
                  </code>
                ))
              )}
            </div>
          )}

          {applyResult && (
            <div className="plan-result">
              <div className="row-heading">
                <small>Apply result</small>
                <StatusPill tone={applyResult.verified ? "ok" : applyResult.rolledBack ? "warn" : "error"}>
                  {applyResult.verified ? "applied & verified" : applyResult.rolledBack ? "rolled back" : "failed"}
                </StatusPill>
              </div>
              {applyResult.backupPath && <small>Backup: {applyResult.backupPath}</small>}
              {applyResult.changesApplied.map((change) => (
                <code key={change.key}>
                  {change.key}: {change.from ?? "(none)"} → {change.to}
                </code>
              ))}
              {applyResult.verified && (
                <Button variant="ghost" onClick={() => setCurrentScreen("snapshots")}>
                  View diff in Snapshots →
                </Button>
              )}
            </div>
          )}

          {planWarnings.map((w) => (
            <WarningBanner key={w.id} warning={w} />
          ))}
          {applyWarnings.map((w) => (
            <WarningBanner key={w.id} warning={w} />
          ))}
        </div>
      </div>
    </Card>
  );
}

export function SwitcherScreen() {
  const { setCurrentScreen } = useAppState();
  const [assignments, setAssignments] = useState<CommandResponse<IntegrationDiscoveryPayload> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let active = true;

    listAssignments()
      .then((result) => {
        if (!active) return;
        setAssignments(result);
        setLoadFailed(false);

        const initial: Record<string, RowState> = {};
        for (const integration of result.data.integrations) {
          initial[integration.id] = {
            provider: PROVIDER_OPTIONS[0],
            model: MODEL_OPTIONS[PROVIDER_OPTIONS[0]]?.[0] ?? "",
            plan: { loading: false, result: null },
            apply: { loading: false, result: null },
          };
        }
        setRowStates(initial);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  function setProvider(id: string, provider: string) {
    setRowStates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        provider,
        model: MODEL_OPTIONS[provider]?.[0] ?? "",
        plan: { loading: false, result: null },
        apply: { loading: false, result: null },
      } as RowState,
    }));
  }

  function setModel(id: string, model: string) {
    setRowStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], model, plan: { loading: false, result: null }, apply: { loading: false, result: null } } as RowState,
    }));
  }

  async function handlePreview(id: string) {
    const row = rowStates[id];
    if (!row) return;

    setRowStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], plan: { loading: true, result: null }, apply: { loading: false, result: null } } as RowState,
    }));

    const result = await previewSwitchPlan(id, row.provider, row.model);

    setRowStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], plan: { loading: false, result } } as RowState,
    }));
  }

  async function handleApply(id: string) {
    const row = rowStates[id];
    if (!row) return;

    setRowStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], apply: { loading: true, result: null } } as RowState,
    }));

    const result = await applySwitch(id, row.provider, row.model);

    setRowStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], apply: { loading: false, result } } as RowState,
    }));
  }

  if (loadFailed) {
    return (
      <div className="screen-stack">
        <SectionHeader
          title="Switcher"
          description="The integration discovery service failed to load, so config path detection could not be shown."
        />
      </div>
    );
  }

  if (!assignments) {
    return (
      <div className="screen-stack">
        <SectionHeader
          title="Switcher"
          description="Loading integration discovery and config path status."
        />
      </div>
    );
  }

  const warningItems = toWarningItems(assignments.warnings, "switcher");

  return (
    <div className="screen-stack">
      <SectionHeader
        title="Switcher"
        description={`Per-tool provider and model assignment. Discovery covers Claude Code, VS Code, Cursor, Windsurf, Continue.dev and Terminal${assignments.meta.source === "native" ? "" : " · mock preview mode"}.`}
      />

      {warningItems.map((warning) => (
        <WarningBanner key={warning.id} warning={warning} />
      ))}

      <div className="stack-md">
        {assignments.data.integrations.map((integration) => (
          <IntegrationRow
            key={integration.id}
            integration={integration}
            rowState={rowStates[integration.id] ?? { provider: PROVIDER_OPTIONS[0], model: "", plan: { loading: false, result: null }, apply: { loading: false, result: null } }}
            onProviderChange={(p) => setProvider(integration.id, p)}
            onModelChange={(m) => setModel(integration.id, m)}
            onPreview={() => handlePreview(integration.id)}
            onApply={() => handleApply(integration.id)}
          />
        ))}
      </div>
    </div>
  );
}
