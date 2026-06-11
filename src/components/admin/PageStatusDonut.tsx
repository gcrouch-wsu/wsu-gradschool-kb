interface PageStatusDonutProps {
  published: number;
  draft: number;
  archived: number;
}

const SEGMENTS = [
  { key: "published", label: "Published", color: "#1d6b3a" },
  { key: "draft", label: "Draft", color: "#b45309" },
  { key: "archived", label: "Archived", color: "#6b6466" },
] as const;

export function PageStatusDonut({ published, draft, archived }: PageStatusDonutProps) {
  const values = { published, draft, archived };
  const total = published + draft + archived;
  const radius = 54;
  const stroke = 18;
  const center = 72;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  const arcs =
    total === 0
      ? [{ ...SEGMENTS[2], value: 1, dash: circumference, gap: 0, offset: 0 }]
      : SEGMENTS.map((segment) => {
          const value = values[segment.key];
          const fraction = value / total;
          const dash = fraction * circumference;
          const arc = { ...segment, value, dash, gap: circumference - dash, offset };
          offset += dash;
          return arc;
        }).filter((segment) => segment.value > 0);

  return (
    <div className="admin-donut">
      <div className="admin-donut__chart">
        <svg aria-hidden className="admin-donut__svg" viewBox="0 0 144 144">
          <circle
            className="admin-donut__track"
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            strokeWidth={stroke}
          />
          {arcs.map((segment) => (
            <circle
              key={segment.key}
              className="admin-donut__segment"
              cx={center}
              cy={center}
              fill="none"
              r={radius}
              stroke={segment.color}
              strokeDasharray={`${segment.dash} ${segment.gap}`}
              strokeDashoffset={-segment.offset}
              strokeLinecap="butt"
              strokeWidth={stroke}
              transform={`rotate(-90 ${center} ${center})`}
            />
          ))}
        </svg>
        <div className="admin-donut__center">
          <span className="admin-donut__total">{total}</span>
          <span className="admin-donut__total-label">Pages</span>
        </div>
      </div>

      <ul className="admin-donut__legend">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="admin-donut__legend-item">
            <span aria-hidden className="admin-donut__swatch" style={{ background: segment.color }} />
            <span className="admin-donut__legend-label">{segment.label}</span>
            <span className="admin-donut__legend-value">{values[segment.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
