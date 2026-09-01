import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "../../src/components/v3/generic/Alert";
import { cn } from "../../src/components/v3/utils";
import type { ComponentDeprecation } from "../deprecation";

type DeprecationNoticeProps = {
  deprecation: ComponentDeprecation;
  className?: string;
};

export const DeprecationNotice = ({ deprecation, className }: DeprecationNoticeProps) => (
  <Alert
    aria-label="Deprecated component"
    className={cn(
      "items-start border-danger/40 bg-danger/5 py-2 text-inherit [&_[data-slot=alert-description]]:text-inherit",
      className
    )}
    role="note"
  >
    <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-danger" />
    <AlertDescription className="block text-xs leading-5 text-inherit">
      <span className="font-medium">Deprecated.</span> Use{" "}
      <code className="rounded-sm border border-current/20 bg-transparent px-1 py-0.5 font-mono text-2xs text-inherit">
        {deprecation.replacement}
      </code>{" "}
      instead. {deprecation.guidance}
    </AlertDescription>
  </Alert>
);
