import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Stack } from "@app/components/v4/ui/layout";
import { StatusText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { NATIVE_INTEGRATION_DEPRECATION_DATE } from "@app/const/nativeIntegrationDeprecation";
import type { TIntegration } from "@app/hooks/api/integrations/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { formatDateTime } from "../../access/roles";
import { failed, saved } from "../../access/toast";
import { useV4Adapter, useV4Mode } from "../../data/adapters";
import { useGo } from "../../links";
import {
  confirmKeyOf,
  failureMessageOf,
  integrationsHref,
  MIGRATION_DOCS,
  SECRET_SYNCS_TAB,
  SYNC_STATE_LABEL,
  syncStateOf
} from "./native-model";

const STATUS = {
  pending: { tone: "neutral", icon: "clock" },
  synced: { tone: "ok", icon: "check-c" },
  failed: { tone: "bad", icon: "alert" }
} as const;

export const SyncStatus = ({ integration }: { integration: TIntegration }) => {
  const state = syncStateOf(integration);
  const failure = failureMessageOf(integration);
  const status = (
    <StatusText tone={STATUS[state].tone} icon={STATUS[state].icon} tabIndex={0}>
      {SYNC_STATE_LABEL[state]}
    </StatusText>
  );
  if (!integration.lastUsed && !failure) return status;
  return (
    <Tooltip
      side="left"
      content={
        <Stack gap={8}>
          {integration.lastUsed && <span>Last synced {formatDateTime(integration.lastUsed)}</span>}
          {failure && <span style={{ whiteSpace: "pre-wrap" }}>{failure}</span>}
        </Stack>
      }
    >
      {status}
    </Tooltip>
  );
};

export const useSyncNow = (projectId: string, name: (integration: TIntegration) => string) => {
  const sync = useV4Adapter("projectIntegrations").useSyncNativeIntegration();
  return async (integration: TIntegration) => {
    try {
      await sync.mutateAsync({ id: integration.id, projectId });
    } catch (error) {
      failed(`Couldn't start a sync for ${name(integration)}`, error);
      return;
    }
    saved(`Sync started for ${name(integration)}`);
  };
};

export const DeleteNativeIntegrationDialog = ({
  integration,
  name,
  projectId,
  onClose,
  onDeleted
}: {
  integration: TIntegration;
  name: string;
  projectId: string;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("projectIntegrations").useDeleteNativeIntegration();
  const [deleteSecrets, setDeleteSecrets] = useState(false);
  const [step, setStep] = useState<"integration" | "secrets">("integration");
  const [pending, setPending] = useState(false);
  const target = integration.app || "this project";

  const run = async (shouldDeleteIntegrationSecrets: boolean) => {
    setPending(true);
    try {
      await remove.mutateAsync({ id: integration.id, projectId, shouldDeleteIntegrationSecrets });
    } catch (error) {
      failed(`Couldn't delete the ${name} integration`, error);
      setPending(false);
      return;
    }
    saved(`Deleted the ${name} integration`);
    onClose();
    onDeleted?.();
  };

  if (step === "secrets")
    return (
      <AlertDialog open onOpenChange={(open) => !open && onClose()}>
        <AlertDialogContent tone="danger" confirmText="confirm" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Also delete the synced secrets in ${name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Every secret this integration manages is removed from the destination. You can&apos;t
              undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={pending}
              onClick={(event) => {
                event.preventDefault();
                run(true);
              }}
            >
              Delete integration and secrets
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText={confirmKeyOf(integration)} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete the ${name} integration for ${target}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Secrets stop syncing to this destination. You can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {integration.integration === "github" && (
          <Checkbox
            label="Delete previously synced secrets from the destination"
            checked={deleteSecrets}
            onChange={setDeleteSecrets}
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={(event) => {
              event.preventDefault();
              if (deleteSecrets) {
                setStep("secrets");
                return;
              }
              run(false);
            }}
          >
            Delete integration
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const CreationBlockedDialog = ({
  orgId,
  projectId,
  onClose
}: {
  orgId: string;
  projectId: string;
  onClose: () => void;
}) => {
  const go = useGo();
  const mode = useV4Mode();
  useEffect(() => {
    if (mode !== "live") return;
    analytics.captureForOrganization(
      AnalyticsEvent.NativeIntegrationCreationBlockedModalViewed,
      orgId,
      { projectId, projectType: ProjectType.SecretManager }
    );
  }, []);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use secret syncs instead</DialogTitle>
          <DialogDescription>
            Native integrations are being retired on {NATIVE_INTEGRATION_DEPRECATION_DATE}, and new
            ones can no longer be created. Your existing integrations keep syncing until then.{" "}
            <a href={MIGRATION_DOCS} target="_blank" rel="noreferrer">
              Read the migration guide
            </a>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onClose();
              go(integrationsHref(orgId, projectId, SECRET_SYNCS_TAB));
            }}
          >
            Go to secret syncs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
