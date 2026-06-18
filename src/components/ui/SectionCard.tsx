import type { ReactNode } from 'react';

interface SectionCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export default function SectionCard({ title, description, children, actions }: SectionCardProps) {
  return (
    <section className="glass rounded-2xl border border-slate-100 p-6 shadow-sm dark:border-slate-800">
      {title || description || actions ? (
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            {title ? <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h2> : null}
            {description ? <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
