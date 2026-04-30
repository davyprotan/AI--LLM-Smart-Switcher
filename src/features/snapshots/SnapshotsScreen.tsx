import { useEffect, useState } from "react";
import { useAppState } from "../../app/state";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { WarningBanner } from "../../components/ui/WarningBanner";
import { captureBaselineSnapshot, listSnapshotDiff, listSnapshots } from "../../services/snapshots";
import { listBackups, revertFromBackup } from "../../services/switcher";
import type {
  BackupEntry,
  CommandResponse,
  RevertPayload,
  SnapshotDiffPayload,
  SnapshotStorePayload,
  WarningItem,
} from "../../types/domain";

export function SnapshotsScreen() {
  const { snapshots, setBaselineCaptured } = useAppState();
  const [snapshotState, setSnapshotState] = useState<CommandResponse<SnapshotStorePayload> | null>(null);
  const [diffState, setDiffState] = useState<CommandResponse<SnapshotDiffPayload> | null>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [revertResults, setRevertResults] = useState<Record<string, CommandResponse<RevertPayload> | null>>({});
  const [reverting, setReverting] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([listSnapshots(), listSnapshotDiff(), listBackups()])
      .then(([snapshotResult, diffResult, backupResult]) => {
        if (!active) return;
        setSnapshotState(snapshotResult);
        setDiffState(diffResult);
        setBackups(backupResult?.data.backups ?? []);
        setLoadFailed(false);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleRevert(backup: BackupEntry) {
    setReverting(backup.id);
    const result = await revertFromBackup(backup.backupPath);
    setRevertResults((prev) => ({ ...prev, [backup.id]: result }));
    setReverting(null);

    if (result?.data.reverted) {
      const [snapshotResult, diffResult] = await Promise.all([listSnapshots(), listSnapshotDiff()]);
      setSnapshotState(snapshotResult);
      setDiffState(diffResult);
    }
  }

  async function handleCaptureBaseline() {
    setCapturing(true);

    try {
      const [snapshotResult, diffResult] = await Promise.all([captureBaselineSnapshot(), listSnapshotDiff()]);
      setSnapshotState(snapshotResult);
      setDiffState(diffResult);
      setLoadFailed(false);
      if (snapshotResult.data.baseline !== null) {
        setBaselineCaptured(true);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setCapturing(false);
    }
  }

  if (loadFailed) {
    return (
      <div className="screen-stack">
        <SectionHeader
          title="Snapshots"
          description="The snapshot service failed to load, so baseline capture state could not be shown."
        />
      </div>
    );
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
                <div className="stack-sm" style={{ marginTop: 16 }}>
                  {baseline.entries.map((entry) => (
                    <div key={entry.id} className="baseline-entry">
                      <div className="row-heading">
                        <strong>{entry.tool}</strong>
                        <StatusPill tone={entry.pathExists ? "ok" : "warn"}>{entry.status}</StatusPill>
                      </div>
                      <p>
                        {entry.providerLabel} · {entry.assignedModelLabel}
                      </p>
                      <small>{entry.configPath}</small>
                      <div className="meta-grid" style={{ marginTop: 12 }}>
                        <div>
                          <small>Checksum</small>
                          <strong>{entry.checksum ?? "Not captured"}</strong>
                        </div>
                        <div>
                          <small>Content bytes</small>
                          <strong>{entry.contentLength ?? 0}</strong>
                        </div>
                        <div>
                          <small>Readable</small>
                          <strong>{entry.pathReadable ? "Yes" : "No"}</strong>
                        </div>
                        <div>
                          <small>Writable</small>
                          <strong>{entry.pathWritable ? "Yes" : "No"}</strong>
                        </div>
                        <div>
                          <small>Parser</small>
                          <strong>{entry.parserState}</strong>
                        </div>
                        <div>
                          <small>Parser note</small>
                          <strong>{entry.parserNote}</strong>
                        </div>
                      </div>
                    </div>
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
          <p>{baseline ? "This compares the current discovery state against the immutable captured baseline." : "Capture a baseline first to compare current state against it."}</p>
          <div className="diff-preview">
            {diffState.data.entries.length > 0 ? (
              diffState.data.entries.map((entry) => (
                <div key={entry.id}>
                  <code>{entry.tool}: {entry.state}</code>
                  <code>changed fields: {entry.changedFields.length > 0 ? entry.changedFields.join(", ") : "none"}</code>
                  <code>provider: {entry.baselineProviderLabel ?? "n/a"} {"->"} {entry.currentProviderLabel ?? "n/a"}</code>
                  <code>model: {entry.baselineModelLabel ?? "n/a"} {"->"} {entry.currentModelLabel ?? "n/a"}</code>
                </div>
              ))
            ) : (
              <code>No captured baseline diff available yet.</code>
            )}
          </div>
          <div className="inline-actions">
            <Button variant="primary">Restore snapshot</Button>
            <Button variant="danger">Revert all</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
