import { CopyButton } from "@app/components/v3";
import { ScopeVariant } from "@app/hooks/useScopeVariant";

// Marks the value generated for this connection, in the scope's color like its buttons
export const GENERATED_VALUE_BORDER: Record<ScopeVariant, string> = {
  org: "border-org/25",
  project: "border-project/25",
  "sub-org": "border-sub-org/25",
  av: "border-product-av/30",
  ss: "border-product-ss/30"
};

export const FederatedCredentialValue = ({
  label,
  value,
  className
}: {
  label: string;
  value: string;
  className?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs text-accent">{label}</span>
    <div
      className={`flex items-start gap-2 rounded-md border bg-container py-2 pr-2 pl-3 ${className ?? "border-border"}`}
    >
      <code className="min-w-0 grow font-mono text-xs leading-5 break-all text-foreground">
        {value}
      </code>
      <CopyButton value={value} ariaLabel={`Copy ${label}`} />
    </div>
  </div>
);
