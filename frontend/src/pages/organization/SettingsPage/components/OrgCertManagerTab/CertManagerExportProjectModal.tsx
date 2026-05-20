import { useEffect, useState } from "react";
import { CheckCircle2Icon, CircleHelpIcon, InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  TCertManagerLegacyInstance,
  TExportCertManagerProjectResult,
  useExportCertManagerProject
} from "@app/hooks/api/certManagerInstance";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  source: TCertManagerLegacyInstance | null;
  activeInstance: TCertManagerLegacyInstance | null;
};

const SummaryRow = ({ label, value, muted }: { label: string; value: number; muted?: boolean }) => (
  <div
    className={cn(
      "flex items-center justify-between rounded-sm border border-border px-3 py-2",
      muted && "opacity-70"
    )}
  >
    <span className="text-foreground">{label}</span>
    <span className="font-mono text-sm font-medium">{value}</span>
  </div>
);

const RenameList = ({
  title,
  tooltip,
  items
}: {
  title: string;
  tooltip: string;
  items: { from: string; to: string }[];
}) => {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent uppercase">
        <span>{title}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`About ${title}`}
              className="text-accent transition-colors hover:text-foreground"
            >
              <CircleHelpIcon className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs normal-case">{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((item) => (
          <li
            key={`${item.from}->${item.to}`}
            className="flex items-center gap-2 rounded-sm border border-border bg-mineshaft-800/30 px-3 py-1.5 font-mono text-xs"
          >
            <span className="text-foreground">{item.from}</span>
            <span className="text-accent">→</span>
            <span className="text-foreground">{item.to}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const CertManagerExportProjectModal = ({
  isOpen,
  onOpenChange,
  source,
  activeInstance
}: Props) => {
  const [result, setResult] = useState<TExportCertManagerProjectResult | null>(null);
  const exportMutation = useExportCertManagerProject();
  const { reset: resetMutation } = exportMutation;

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      resetMutation();
    }
  }, [isOpen, resetMutation]);

  const handleExport = async () => {
    if (!source) return;
    try {
      const res = await exportMutation.mutateAsync({ sourceProjectId: source.id });
      setResult(res);
      createNotification({
        type: "success",
        text: `Exported ${res.exportedCertificateAuthorities} CA(s), ${res.exportedCertificatePolicies} policy(ies), and ${res.exportedCertificateProfiles} profile(s).`
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to export project.";
      createNotification({ type: "error", text: detail });
    }
  };

  const canExport = Boolean(source && activeInstance && source.id !== activeInstance.id);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {result ? (
          <>
            <DialogHeader className="gap-4">
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2Icon className="h-5 w-5 text-success" />
                Export complete
              </DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{source?.name}</span> was exported
                into the active instance{" "}
                <span className="font-medium text-foreground">{activeInstance?.name ?? ""}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1 text-sm">
              <div className="flex flex-col gap-2">
                <SummaryRow
                  label="Certificate authorities exported"
                  value={result.exportedCertificateAuthorities}
                />
                <SummaryRow
                  label="Certificate policies exported"
                  value={result.exportedCertificatePolicies}
                />
                <SummaryRow
                  label="Certificate profiles exported"
                  value={result.exportedCertificateProfiles}
                />
                {result.skippedCertificateProfiles > 0 && (
                  <SummaryRow
                    label="Certificate profiles skipped (external CA)"
                    value={result.skippedCertificateProfiles}
                    muted
                  />
                )}
              </div>

              <RenameList
                title="Certificate authorities renamed (name conflicts)"
                tooltip="A certificate authority with this name already exists in the active instance. Certificate authority names must be unique within a project, so the exported copy was assigned a new, unique name to avoid the collision."
                items={result.renamedCertificateAuthorities.map((r) => ({
                  from: r.originalName,
                  to: r.newName
                }))}
              />
              <RenameList
                title="Policies renamed (name conflicts)"
                tooltip="A certificate policy with this name already exists in the active instance. Certificate policy names must be unique within a project, so the exported copy was assigned a new, unique name to avoid the collision."
                items={result.renamedCertificatePolicies.map((r) => ({
                  from: r.originalName,
                  to: r.newName
                }))}
              />
              <RenameList
                title="Profiles renamed (slug conflicts)"
                tooltip="A certificate profile with this slug already exists in the active instance. Certificate profile slugs must be unique within a project, so the exported copy was assigned a new, unique slug to avoid the collision."
                items={result.renamedCertificateProfiles.map((r) => ({
                  from: r.originalSlug,
                  to: r.newSlug
                }))}
              />
            </div>

            <DialogFooter>
              <Button variant="project" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="gap-4">
              <DialogTitle>Export Certificate Manager project</DialogTitle>
              <DialogDescription>
                {activeInstance ? (
                  <>
                    This will duplicate every internal certificate authority, certificate policy,
                    and certificate profile from{" "}
                    <span className="font-medium text-foreground">{source?.name}</span> into your
                    organization&apos;s active Certificate Manager instance,{" "}
                    <span className="font-medium text-foreground">{activeInstance.name}</span>.
                    Existing resources in{" "}
                    <span className="font-medium text-foreground">{source?.name}</span> are not
                    removed by this export, but as it is scheduled for retirement, all subsequent
                    work should be performed in the active instance.
                  </>
                ) : (
                  <>
                    No active Certificate Manager instance is configured for this organization. An
                    organization administrator must designate an active instance before any export
                    can be performed.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <Alert variant="info">
              <InfoIcon />
              <AlertDescription>
                External certificate authorities are not included in this export. Any profile bound
                to one is skipped.
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="project"
                isPending={exportMutation.isPending}
                isDisabled={!canExport}
                onClick={handleExport}
              >
                Export
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
