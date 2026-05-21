import type { JSX, ReactNode } from "react";

interface PageWrapperProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}

export const PageWrapper = ({
  title,
  subtitle,
  children,
  action
}: PageWrapperProps): JSX.Element => (
  <section className="px-6 py-6 md:px-8">
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-[13px] text-gray-500">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  </section>
);
