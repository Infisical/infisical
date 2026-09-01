import { TriangleAlertIcon } from "lucide-react";

import type { ComponentDeprecation } from "../deprecation";

type DeprecationNoticeProps = {
  deprecation: ComponentDeprecation;
  className?: string;
};

export const DeprecationNotice = ({ deprecation, className }: DeprecationNoticeProps) => (
  <aside
    aria-label="Deprecated component"
    className={`rounded-md border border-warning/30 bg-warning/10 p-4 text-foreground ${className ?? ""}`}
    role="note"
  >
    <div className="flex items-center gap-2 text-sm font-medium text-warning">
      <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
      Deprecated component
    </div>
    <div className="mt-2 space-y-1 text-sm">
      <p>{deprecation.reason}</p>
      <p>
        Use{" "}
        <code className="rounded bg-warning/10 px-1 py-0.5 font-mono text-xs">
          {deprecation.replacement}
        </code>{" "}
        instead.
      </p>
      <p className="text-muted">{deprecation.migration}</p>
    </div>
  </aside>
);
