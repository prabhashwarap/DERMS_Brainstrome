/**
 * A secondary series gets 32 px and no axes.
 *
 * Weather inputs and per-unit trends are context, not analysis: they exist to
 * show direction and rough level. Promoting them to full charts with axes and
 * gridlines would give them the same visual weight as the generation stack,
 * which is the one thing on the Now tab that deserves it.
 */

interface Props {
  values: number[];
  /** CSS colour. Defaults to muted ink — sparklines carry no identity. */
  stroke?: string;
  height?: number;
  width?: number;
  className?: string;
  /** Accessible description; the sparkline is decorative without it. */
  label: string;
}

export function Sparkline({
  values,
  stroke = "var(--viz-input)",
  height = 32,
  width = 96,
  className,
  label,
}: Props) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would otherwise divide by zero and render at the top edge;
  // centre it instead, which is also what "no change" should look like.
  const span = max - min || 1;
  const pad = 2;
  const usable = height - pad * 2;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = pad + usable - ((v - min) / span) * usable;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
