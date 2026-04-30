interface MetricTileProps {
  label: string;
  value: string;
  detail: string;
}

export function MetricTile({ label, value, detail }: MetricTileProps) {
  return (
    <article className="metric-tile">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

