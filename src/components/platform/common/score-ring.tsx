interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  tone?: "neutral" | "success" | "warning" | "critical";
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toneClasses(tone: ScoreRingProps["tone"]) {
  if (tone === "success") {
    return {
      track: "stroke-emerald-100",
      progress: "stroke-emerald-500",
      text: "text-emerald-700",
      label: "text-emerald-800",
    };
  }

  if (tone === "warning") {
    return {
      track: "stroke-amber-100",
      progress: "stroke-amber-500",
      text: "text-amber-700",
      label: "text-amber-800",
    };
  }

  if (tone === "critical") {
    return {
      track: "stroke-rose-100",
      progress: "stroke-rose-600",
      text: "text-rose-700",
      label: "text-rose-800",
    };
  }

  return {
    track: "stroke-slate-200",
    progress: "stroke-blue-600",
    text: "text-slate-800",
    label: "text-slate-700",
  };
}

export function ScoreRing({
  score,
  size = 64,
  strokeWidth = 8,
  label,
  tone = "neutral",
}: ScoreRingProps) {
  const safeScore = clampScore(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeScore / 100);
  const palette = toneClasses(tone);

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${safeScore} out of 100`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          className={palette.track}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className={palette.progress}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          className={`text-sm font-black ${palette.text}`}
        >
          {safeScore}
        </text>
      </svg>
      {label ? <span className={`text-[11px] font-semibold ${palette.label}`}>{label}</span> : null}
    </div>
  );
}
