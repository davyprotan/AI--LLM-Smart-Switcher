import { useState } from "react";
import { useAppState } from "../../app/state";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { WarningBanner } from "../../components/ui/WarningBanner";
import { captureBaselineSnapshot } from "../../services/snapshots";
import { revertFromBackup } from "../../services/switcher";
import type {
  BackupEntry,
  BaselineSnapshotEntry,
  CommandResponse,
  RevertPayload,
  SnapshotDiffEntry,
  WarningItem,
} from "../../types/domain";

export function SnapshotsScreen() {
  const {
    snapshots,
    setBaselineCaptured,
    snapshotStore: snapshotState,
    snapshotDiff: diffState,
    backupList: backups,
    refreshSnapshotStore,
    refreshSnapshotDiff,
    refreshBackupList,
  } = useAppState();
  const [revertResults, setRevertResults] = useState<Record<string, CommandResponse<RevertPayload> | null>>({});
  const [reverting, setReverting] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  async function handleRevert(backup: BackupEntry) {
    setReverting(backup.id);
    const result = await revertFromBackup(backup.backupPath);
    setRevertResults((prev) => ({ ...prev, [backup.id]: result }));
    setReverting(null);

    if (result?.data.reverted) {
      // The revert mutated the on-disk config; re-prime the shared caches
      // so any other screen reading them sees the updated state too.
      await Promise.all([refreshSnapshotStore(), refreshSnapshotDiff(), refreshBackupList()]);
    }
  }

  async function handleCaptureBaseline() {
    setCapturing(true);

    try {
      const result = await captureBaselineSnapshot();
      // Push the just-captured baseline into the cache and refresh the diff.
      await Promise.all([refreshSnapshotStore(), refreshSnapshotDiff()]);
      if (result.data.baseline !== null) {
        setBaselineCaptured(true);
      }
    } finally {
      setCapturing(false);
    }
  }

  if (!snapshotState || !diffState) {
    return (
      <div className="screen-stack">
        <SectionHeader
          title="Snapshots"
          description="Loading baseline snapshot state and placeholder named snapshots."
        />
      </div>
    );
  }

  const warningItems: WarningItem[] = snapshotState.warnings.map((warning) => ({
    id: warning.code,
    title: warning.level === "warn" ? "Snapshot warning" : warning.level === "error" ? "Snapshot error" : "Snapshot note",
    message: warning.message,
    tone: warning.level,
  }));

  const baseline = snapshotState.data.baseline;
  const diffWarnings: WarningItem[] = diffState.warnings.map((warning) => ({
    id: `diff-${warning.code}`,
    title: warning.level === "warn" ? "Diff warning" : warning.level === "error" ? "Diff error" : "Diff note",
    message: warning.message,
    tone: warning.level,
  }));

  return (
    <div className="screen-stack">
      <SectionHeader
        title="Snapshots"
        description={`Save, diff, restore, and baseline-capture structure. Native snapshot storage is currently ${snapshotState.meta.source === "native" ? "active" : "mocked for preview mode"}.`}
        action={
          <Button variant="primary" onClick={handleCaptureBaseline} disabled={capturing}>
            {capturing ? "Capturing baseline..." : "Capture baseline"}
          </Button>
        }
      />

      {warningItems.map((warning) => (
        <WarningBanner key={warning.id} warning={warning} />
      ))}
      {diffWarnings.map((warning) => (
        <WarningBanner key={warning.id} warning={warning} />
      ))}

      <div className="two-column-grid">
        <div className="stack-md">
          <Card>
            <div className="card-header">
              <div>
                <span className="eyebrow">Baseline Snapshot</span>
                <h3>{baseline ? "Original state captured" : "No baseline captured yet"}</h3>
              </div>
              {baseline ? <StatusPill tone="ok">baseline</StatusPill> : <StatusPill tone="warn">pending</StatusPill>}
            </div>
            {baseline ? (
              <>
                <p>Captured at {baseline.createdAt}</p>
                <small>{baseline.storagePath}</small>
                <div className="stack-md" style={{ marginTop: 16 }}>
                  {baseline.entries.map((entry) => (
                    <BaselineEntryRow key={entry.id} entry={entry} />
                  ))}
                </div>
              </>
            ) : (
              <p>
                Capture the baseline before any future write support is added. This stores discovery metadata and local text
                backups for supported configs in an app-managed snapshot file.
              </p>
            )}
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <span className="eyebrow">Backup Library</span>
                <h3>{backups.length > 0 ? `${backups.length} backup${backups.length !== 1 ? "s" : ""}` : "No backups yet"}</h3>
              </div>
            </div>
            {backups.length === 0 ? (
              <p>Backups are created automatically each time you apply a switch. They appear here for one-click revert.</p>
            ) : (
              <div className="stack-md">
                {backups.map((backup) => {
                  const revertResult = revertResults[backup.id];
                  const isReverting = reverting === backup.id;
                  return (
                    <div key={backup.id} className="backup-row">
                      <div>
                        <div className="row-heading">
                          <strong>{backup.toolId}</strong>
                          {revertResult && (
                            <StatusPill tone={revertResult.data.reverted ? "ok" : "error"}>
                              {revertResult.data.reverted ? "reverted" : "failed"}
                            </StatusPill>
                          )}
                        </div>
                        <small>{backup.configPath}</small>
                        <small>{backup.createdAt} · {backup.sizeBytes} bytes</small>
                      </div>
                      <Button
                        variant="danger"
                        onClick={() => handleRevert(backup)}
                        disabled={isReverting}
                      >
                        {isReverting ? "Reverting…" : "Revert"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <span className="eyebrow">Named Snapshot Library</span>
            <h3>Placeholder library</h3>
            <p>These remain mock examples for the broader snapshot UX until named snapshot persistence is implemented.</p>
          </Card>

          {snapshots.map((snapshot) => (
            <Card key={snapshot.id}>
              <div className="card-header">
                <div>
                  <span className="eyebrow">{snapshot.createdAt}</span>
                  <h3>{snapshot.name}</h3>
                </div>
                {snapshot.isDefault ? <StatusPill tone="ok">default</StatusPill> : null}
              </div>
              <p>{snapshot.summary}</p>
              <ul className="plain-list">
                {snapshot.includes.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <Card>
          <span className="eyebrow">Diff Preview</span>
          <h3>{diffState.data.entries.length > 0 ? "Current vs baseline" : "No baseline diff yet"}</h3>
          <p>{baseline ? "Compares the current discovery state against the immutable captured baseline." : "Capture a baseline first to compare current state against it."}</p>
          {diffState.data.entries.length > 0 ? (
            <div className="diff-rows">
              {diffState.data.entries.map((entry) => (
                <DiffRow key={entry.id} entry={entry} />
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function BaselineEntryRow({ entry }: { entry: BaselineSnapshotEntry }) {
  return (
    <div className="baseline-row">
      <div className="baseline-row-head">
        <div>
          <strong>{entry.tool}</strong>
          <small className="mono">{entry.configPath}</small>
        </div>
        <StatusPill tone={entry.pathExists ? "ok" : "warn"}>{entry.status}</StatusPill>
      </div>
      <p className="baseline-row-summary">
        {entry.providerLabel} · {entry.assignedModelLabel}
      </p>
      {entry.pathExists ? (
        <dl className="baseline-row-details">
          <div>
            <dt>Checksum</dt>
            <dd className="mono truncate">{entry.checksum ?? "Not captured"}</dd>
          </div>
          <div>
            <dt>Bytes</dt>
            <dd>{entry.contentLength ?? 0}</dd>
          </div>
          <div>
            <dt>Read / Write</dt>
            <dd>
              {entry.pathReadable ? "yes" : "no"} / {entry.pathWritable ? "yes" : "no"}
            </dd>
          </div>
          <div>
            <dt>Parser</dt>
            <dd>{entry.parserState}</dd>
          </div>
        </dl>
      ) : (
        <small className="baseline-row-note">{entry.parserNote}</small>
      )}
    </div>
  );
}

function DiffRow({ entry }: { entry: SnapshotDiffEntry }) {
  const tone = entry.state === "unchanged" ? "idle" : entry.state === "changed" ? "warn" : "info";
  const provFrom = entry.baselineProviderLabel ?? "—";
  const provTo = entry.currentProviderLabel ?? "—";
  const modelFrom = entry.baselineModelLabel ?? "—";
  const modelTo = entry.currentModelLabel ?? "—";
  const providerLine =
    provFrom === provTo ? provFrom : `${provFrom} → ${provTo}`;
  const modelLine = modelFrom === modelTo ? modelFrom : `${modelFrom} → ${modelTo}`;
  return (
    <div className="diff-row">
      <div className="diff-row-head">
        <strong>{entry.tool}</strong>
        <StatusPill tone={tone}>{entry.state}</StatusPill>
      </div>
      <small>provider: {providerLine}</small>
      <small>model: {modelLine}</small>
      {entry.changedFields.length > 0 && (
        <small className="diff-row-fields">changed: {entry.changedFields.join(", ")}</small>
      )}
    </div>
  );
}
