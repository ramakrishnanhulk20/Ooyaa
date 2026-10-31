/** The stamp-ring logotype mark: outer circle + inner concentric ring. */
export function StampRing({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="9" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="11" cy="11" r="6.3" stroke="var(--ink)" strokeWidth="1" />
    </svg>
  );
}
