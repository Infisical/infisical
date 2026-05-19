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
import { cn } from "@app/components/v3/utils";
import {
  TCertManagerLegacyInstance,
  TMigrateCertManagerProjectResult,
  useMigrateCertManagerProject
} from "@app/hooks/api/certManagerInstance";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  source: TCertManagerLegacyInstance | null;
  candidates: TCertManagerLegacyInstance[];
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

const RenameList = ({ title, items }: { title: string; items: { from: string; to: string }[] }) => {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium tracking-wide text-accent uppercase">{title}</div>
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

export const CertManagerMigrateProjectModal = ({
  isOpen,
  onOpenChange,
  source,
  candidates
}: Props) => {
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [result, setResult] = useState<TMigrateCertManagerProjectResult | null>(null);
  const migrate = useMigrateCertManagerProject();

  useEffect(() => {
    if (isOpen) {
      setDestinationId(null);
      setResult(null);
    }
  }, [isOpen]);

  const availableDestinations = candidates.filter((c) => c.id !== source?.id);

  const handleMigrate = async () => {
    if (!source || !destinationId) return;
    try {
      const res = await migrate.mutateAsync({
        sourceProjectId: source.id,
        destinationProjectId: destinationId
      });
      setResult(res);
      createNotification({
        type: "success",
        text: `Migrated ${res.migratedCertificateAuthorities} CA(s), ${res.migratedCertificatePolicies} policy(ies), and ${res.migratedCertificateProfiles} profile(s).`
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to migrate project.";
      createNotification({ type: "error", text: detail });
    }
  };

  const destination = destinationId
    ? availableDestinations.find((c) => c.id === destinationId)
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {result ? (
          <>
            <DialogHeader className="gap-4">
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2Icon className="h-5 w-5 text-success" />
                Migration complete
              </DialogTitle>
              <DialogDescription>
                {source?.name} was duplicated into{" "}
                <span className="font-medium text-foreground">
                  {destination?.name ?? "the destination project"}
                </span>
                . The source project was not modified.
              </DialogDescription>
            </DialogHeader>

            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1 text-sm">
              <div className="flex flex-col gap-2">
                <SummaryRow
                  label="Certificate authorities migrated"
                  value={result.migratedCertificateAuthorities}
                />
                <SummaryRow
                  label="Certificate policies migrated"
                  value={result.migratedCertificatePolicies}
                />
                <SummaryRow
                  label="Certificate profiles migrated"
                  value={result.migratedCertificateProfiles}
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
                items={result.renamedCertificateAuthorities.map((r) => ({
                  from: r.originalName,
                  to: r.newName
                }))}
              />
              <RenameList
                title="Policies renamed (name conflicts)"
                items={result.renamedCertificatePolicies.map((r) => ({
                  from: r.originalName,
                  to: r.newName
                }))}
              />
              <RenameList
                title="Profiles renamed (slug conflicts)"
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
              <DialogTitle>Migrate Certificate Manager project</DialogTitle>
              <DialogDescription>
                Duplicate all internal CAs, certificate policies, and certificate profiles from{" "}
                <span className="font-medium text-foreground">
                  {source?.name ?? "this project"}
                </span>{" "}
                into another Certificate Manager project. The source project is not modified.
              </DialogDescription>
            </DialogHeader>

            <Alert variant="info">
              <InfoIcon />
              <AlertDescription>
                External CAs and certificates are not migrated. Profiles using an external CA are
                skipped.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium tracking-wide text-accent uppercase">
                Destination project
              </div>
              <div className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto rounded-sm border border-border bg-mineshaft-800/30 p-1">
                {availableDestinations.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-accent">
                    No other Certificate Manager projects in this organization.
                  </div>
                ) : (
                  availableDestinations.map((c) => {
                    const isPicked = c.id === destinationId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setDestinationId(c.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-sm border border-transparent px-3 py-2 text-left transition-colors",
                          "hover:border-product-pki/30 hover:bg-product-pki/[0.06]",
                          isPicked && "border-product-pki/40 bg-product-pki/[0.08]"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {c.name}
                          </div>
                          <div className="truncate font-mono text-xs text-accent">{c.slug}</div>
                        </div>
                        {isPicked && (
                          <CheckCircle2Icon className="h-4 w-4 shrink-0 text-product-pki" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="project"
                isPending={migrate.isPending}
                isDisabled={!destinationId || availableDestinations.length === 0}
                onClick={handleMigrate}
              >
                Migrate
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
