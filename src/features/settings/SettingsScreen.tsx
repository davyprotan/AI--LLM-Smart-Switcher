import { useAppState } from "../../app/state";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";

export function SettingsScreen() {
  const { repairActions, variations, selectedVariationId, setSelectedVariationId } = useAppState();

  return (
    <div className="screen-stack">
      <SectionHeader
        title="Settings"
        description="Masked API keys, warning thresholds, diagnostics, and repair placeholders."
      />

      <div className="two-column-grid">
        <Card>
          <span className="eyebrow">Credentials</span>
          <h3>Masked provider keys</h3>
          <div className="stack-sm">
            <div className="secret-row">
              <span>Anthropic</span>
              <code>sk-ant-***F3X2</code>
            </div>
            <div className="secret-row">
              <span>OpenAI</span>
              <code>sk-proj-***9aB1</code>
            </div>
            <div className="secret-row">
              <span>Google</span>
              <code>not connected</code>
            </div>
          </div>
        </Card>

        <Card>
          <span className="eyebrow">Thresholds</span>
          <h3>Warning levels</h3>
          <div className="slider-stack">
            <label>
              Cost per day
              <input type="range" min="1" max="100" value="34" readOnly />
            </label>
            <label>
              Latency alert
              <input type="range" min="50" max="500" value="142" readOnly />
            </label>
            <label>
              GPU pressure
              <input type="range" min="10" max="100" value="78" readOnly />
            </label>
          </div>
        </Card>
      </div>

      <div className="two-column-grid">
        <Card>
          <span className="eyebrow">UI Style</span>
          <h3>Compare layout variations</h3>
          <div className="stack-sm">
            {variations.map((variation) => (
              <button
                key={variation.id}
                className={variation.id === selectedVariationId ? "variation-card selected button-reset" : "variation-card button-reset"}
                onClick={() => setSelectedVariationId(variation.id)}
                type="button"
              >
                <strong>{variation.name}</strong>
                <p>{variation.description}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <span className="eyebrow">Diagnostics</span>
          <h3>Repair actions</h3>
          <div className="stack-sm">
            {repairActions.map((action) => (
              <div key={action.id} className="repair-action">
                <div>
                  <strong>{action.label}</strong>
                  <p>{action.description}</p>
                </div>
                <Button>Run</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

