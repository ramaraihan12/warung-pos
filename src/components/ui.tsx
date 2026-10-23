export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-line bg-card ${className}`}>
      {title && <h2 className="border-b border-line px-4 py-2.5 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-card px-4 py-3" data-testid={testId}>
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-0.5 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export const th = 'px-4 py-2 text-left text-xs font-medium text-muted';
export const td = 'px-4 py-2 text-sm';
export const inputClass = 'rounded-md border border-line px-3 py-2 text-sm';
export const primaryButton =
  'rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark';

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-muted">{children}</p>;
}

const wib = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function when(d: Date | string | null | undefined): string {
  return d ? wib.format(new Date(d)) : 'belum pernah';
}
