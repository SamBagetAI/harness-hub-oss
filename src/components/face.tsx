/**
 * The mock's avatar: a square tile with two eyes and a mouth. Each harness
 * gets its own expression, worked out from its slug so it never changes.
 */
export function Face({ slug, size = 40 }: { slug: string; size?: number }) {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const eye = 1.6 + (h % 40) / 10; // 1.6 to 5.5
  const curve = 39 + ((h >> 6) % 10); // mouth from flat-ish to a smile
  const half = 5 + ((h >> 10) % 4);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" fill="var(--tile)" />
      <ellipse cx="23" cy="28" rx="3" ry={eye} fill="var(--ink)" />
      <ellipse cx="41" cy="28" rx="3" ry={eye} fill="var(--ink)" />
      <path
        d={`M${32 - half} 40 Q32 ${curve} ${32 + half} 40`}
        stroke="var(--ink)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
