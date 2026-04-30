import { useState } from "react";
import { Button } from "../ui/Button";

interface Props {
  onCapture: () => Promise<void>;
  onDismiss: () => void;
}

export function FirstRunBanner({ onCapture, onDismiss }: Props) {
  const [capturing, setCapturing] = useState(false);

  async function handleCapture() {
    setCapturing(true);
    try {
      await onCapture();
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="first-run-banner">
      <div className="first-run-banner-body">
        <strong>No config baseline captured yet</strong>
        <p>
          Capture a snapshot of your current tool configs before your first switch — this enables
          safe diffs and one-click rollback.
        </p>
      </div>
      <div className="first-run-banner-actions">
        <Button variant="primary" onClick={handleCapture} disabled={capturing}>
          {capturing ? "Capturing…" : "Capture baseline"}
        </Button>
        <button className="button-reset first-run-dismiss" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
