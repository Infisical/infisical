import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

const STATUS: Record<
  string,
  { label: string; tone: "ok" | "bad" | "neutral"; icon: "check-c" | "alert-c" | "sync" }
> = {
  running: { label: "Running", tone: "neutral", icon: "sync" },
  completed: { label: "Healthy", tone: "ok", icon: "check-c" },
  failed: { label: "Failed", tone: "bad", icon: "alert-c" }
};

const RUN_LABELS: Record<string, string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed"
};

export const DiscoveryStatus = ({
  status,
  error,
  run = false
}: {
  status?: string | null;
  error?: string | null;
  run?: boolean;
}) => {
  const meta = status ? STATUS[status] : undefined;
  if (!meta)
    return (
      <StatusText icon="minus" size="sm">
        {run ? (status ?? "Unknown") : "Never scanned"}
      </StatusText>
    );
  const label = run ? (RUN_LABELS[status!] ?? meta.label) : meta.label;
  const text = (
    <StatusText
      size="sm"
      tone={meta.tone}
      {...(status === "running" ? { loading: true } : { icon: meta.icon })}
      tabIndex={status === "failed" && error ? 0 : undefined}
    >
      {label}
    </StatusText>
  );
  return status === "failed" && error && !run ? <Tooltip content={error}>{text}</Tooltip> : text;
};
