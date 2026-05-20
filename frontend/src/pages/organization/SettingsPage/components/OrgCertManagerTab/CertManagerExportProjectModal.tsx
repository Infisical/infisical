import { useEffect, useState } from "react";
import { CheckCircle2Icon, InfoIcon } from "lucide-react";

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
  DialogTitle
} from "@app/components/v3";
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

const plural = (n: number, singular: string, pluralForm: string) =>
  `${n} ${n === 1 ? singular : pluralForm}`;

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

  const hasRenames =
    result &&
    result.renamedCertificateAuthorities.length +
      result.renamedCertificatePolicies.length +
      result.renamedCertificateProfiles.length >
      0;

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
                {plural(
                  result.exportedCertificateAuthorities,
                  "certificate authority",
                  "certificate authorities"
                )}
                , {plural(result.exportedCertificatePolicies, "policy", "policies")}, and{" "}
                {plural(result.exportedCertificateProfiles, "profile", "profiles")} from{" "}
                {source?.name ?? ""} were exported to {activeInstance?.name ?? ""}.
                {hasRenames
                  ? " Some resources had name conflicts and were renamed automatically."
                  : ""}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="gap-4">
              <DialogTitle>Export Certificate Manager project</DialogTitle>
              <DialogDescription>
                {activeInstance
                  ? `All certificate authorities, policies, and profiles from ${source?.name ?? ""} will be copied into ${activeInstance.name}.`
                  : "No active Certificate Manager project is configured for this organization. An organization administrator must designate an active project before any export can be performed."}
              </DialogDescription>
            </DialogHeader>

            <Alert variant="info">
              <InfoIcon />
              <AlertDescription>
                External certificate authorities and related profiles are not included in this
                export and will be skipped.
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
                Export to active project
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
