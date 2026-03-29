interface InstructionCalloutProps {
  title: string;
  description: string;
  points?: string[];
  tone?: "primary" | "secondary" | "tertiary";
}

const toneStyles = {
  primary: "border-[#bdf2b3] bg-[#f1f9ef] text-[#1f4021]",
  secondary: "border-[#ffd4a3] bg-[#fff6ee] text-[#5c2c00]",
  tertiary: "border-[#ffe7a6] bg-[#fff9e8] text-[#5b4300]",
};

export function InstructionCallout({
  title,
  description,
  points = [],
  tone = "primary",
}: InstructionCalloutProps) {
  return (
    <section className={`rounded-xl border p-4 ${toneStyles[tone]}`} aria-label={`${title} instructions`}>
      <p className="text-xs font-semibold uppercase tracking-wide">How to Use This</p>
      <h3 className="mt-1 text-base font-bold">{title}</h3>
      <p className="mt-1 text-sm">{description}</p>
      {points.length ? (
        <ol className="mt-3 space-y-1 text-sm">
          {points.map((point, index) => (
            <li key={`${title}-${index}`} className="flex gap-2">
              <span className="font-semibold">{index + 1}.</span>
              <span>{point}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
