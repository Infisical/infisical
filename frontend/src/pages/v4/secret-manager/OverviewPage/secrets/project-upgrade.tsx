import { useEffect, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";

import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";

const IN_PROGRESS = "IN_PROGRESS";
const FAILED = "FAILED";

const CHECKLIST = [
  { key: "cli", label: "Infisical CLI is v0.25.0 or above" },
  { key: "operator", label: "Infisical Kubernetes Operator is v0.7.0 or above" },
  { key: "approvals", label: "All open approval and access requests are closed or merged" }
] as const;

export function ProjectUpgradeState({
  projectId,
  upgradeStatus,
  onRefetch
}: {
  projectId: string;
  upgradeStatus?: string | null;
  onRefetch: () => unknown;
}) {
  const adapter = useV4Adapter("secrets");
  const isAdmin = adapter.useIsProjectAdmin(projectId);
  const migrate = adapter.useMigrateProjectToV3();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const upgrading = upgradeStatus === IN_PROGRESS;
  useEffect(() => {
    if (!upgrading) return undefined;
    const timer = window.setInterval(onRefetch, 2000);
    return () => window.clearInterval(timer);
  }, [upgrading, onRefetch]);
  const close = () => {
    setOpen(false);
    setChecked([]);
  };
  return (
    <>
      <EmptyState
        icon="lock"
        title={upgrading ? "Upgrading the secrets engine" : "Secrets engine upgrade required"}
        description="Existing secret fetching keeps working. The upgrade takes 1 to 2 minutes with no downtime."
        actions={
          <Stack gap={12} align="center">
            {upgradeStatus === FAILED && (
              <Alert tone="bad">The upgrade failed. Contact Infisical support for help.</Alert>
            )}
            <Button
              disabledReason={
                isAdmin ? undefined : "Only project admins can upgrade the secrets engine"
              }
              loading={upgrading || migrate.isPending}
              loadingLabel="Upgrading"
              onClick={() => setOpen(true)}
            >
              Upgrade project
            </Button>
          </Stack>
        }
      />
      <MultiStep
        variant="dialog"
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title="Upgrade secrets engine"
        completeLabel="Upgrade"
        onComplete={async () => {
          try {
            await migrate.mutateAsync({ projectId });
          } catch (error) {
            failed("Couldn't start the upgrade", error);
            return false;
          }
          saved("Project upgrade started");
          onRefetch();
          close();
          return true;
        }}
        steps={[
          {
            title: "Checklist",
            disabledReason:
              checked.length === CHECKLIST.length ? undefined : "Confirm every requirement first",
            content: (
              <Stack gap={12}>
                {CHECKLIST.map((item) => (
                  <Checkbox
                    key={item.key}
                    label={item.label}
                    checked={checked.includes(item.key)}
                    onChange={(value) =>
                      setChecked((current) =>
                        value
                          ? [...current, item.key]
                          : current.filter((entry) => entry !== item.key)
                      )
                    }
                  />
                ))}
              </Stack>
            )
          }
        ]}
      />
    </>
  );
}
