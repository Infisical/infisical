import { Checkbox, DeleteActionModal, EmptyState, Skeleton } from "@app/components/v2";
import { usePopUp, useToggle } from "@app/hooks";
import { useSyncIntegration } from "@app/hooks/api/integrations/queries";
import { TIntegration } from "@app/hooks/api/types";

import { ConfiguredIntegrationItem } from "./ConfiguredIntegrationItem";

type Props = {
  environments: Array<{ name: string; slug: string; id: string }>;
  integrations?: TIntegration[];
  isLoading?: boolean;
  onIntegrationDelete: (
    integrationId: string,
    shouldDeleteIntegrationSecrets: boolean,
    cb: () => void
  ) => Promise<void>;
  workspaceId: string;
};

export const IntegrationsSection = ({
  integrations = [],
  environments = [],
  isLoading,
  onIntegrationDelete,
  workspaceId
}: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteConfirmation",
    "deleteSecretsConfirmation"
  ] as const);

  const { mutate: syncIntegration } = useSyncIntegration();
  const [shouldDeleteSecrets, setShouldDeleteSecrets] = useToggle(false);

  return (
    <div className="mb-8">
      <div className="mx-4 mb-4 mt-6 flex flex-col items-start justify-between px-2 text-xl">
        <h1 className="text-3xl font-semibold">Current Integrations</h1>
        <p className="text-base text-bunker-300">Manage integrations with third-party services.</p>
      </div>
      {isLoading && (
        <div className="p-6 pt-0">
          <Skeleton className="h-28" />
        </div>
      )}

      {!isLoading && !integrations.length && (
        <div className="mx-6">
          <EmptyState
            className="rounded-md border border-mineshaft-700 pt-8 pb-4"
            title="No integrations found. Click on one of the below providers to sync secrets."
          />
        </div>
      )}
      {!isLoading && (
        <div className="flex min-w-max flex-col space-y-4 p-6 pt-0">
          {integrations?.map((integration) => (
            <ConfiguredIntegrationItem
              key={`integration-${integration.id}`}
              onManualSyncIntegration={() => {
                syncIntegration({
                  workspaceId,
                  id: integration.id,
                  lastUsed: integration.lastUsed as string
                });
              }}
              onRemoveIntegration={() => {
                setShouldDeleteSecrets.off();
                handlePopUpOpen("deleteConfirmation", integration);
              }}
              integration={integration}
              environments={environments}
            />
          ))}
        </div>
      )}
      <DeleteActionModal
        isOpen={popUp.deleteConfirmation.isOpen}
        title={`Are you sure want to remove ${
          (popUp?.deleteConfirmation.data as TIntegration)?.integration || " "
        } integration for ${
          (popUp?.deleteConfirmation.data as TIntegration)?.app || "this project"
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteConfirmation", isOpen)}
        deleteKey={
          (popUp?.deleteConfirmation?.data as TIntegration)?.app ||
          (popUp?.deleteConfirmation?.data as TIntegration)?.owner ||
          (popUp?.deleteConfirmation?.data as TIntegration)?.path ||
          (popUp?.deleteConfirmation?.data as TIntegration)?.integration ||
          ""
        }
        onDeleteApproved={async () => {
          if (shouldDeleteSecrets) {
            handlePopUpOpen("deleteSecretsConfirmation");
            return;
          }

          await onIntegrationDelete(
            (popUp?.deleteConfirmation.data as TIntegration).id,
            false,
            () => handlePopUpClose("deleteConfirmation")
          );
        }}
      >
        {(popUp?.deleteConfirmation?.data as TIntegration)?.integration === "github" && (
          <div className="mt-4">
            <Checkbox
              id="delete-integration-secrets"
              checkIndicatorBg="text-white"
              onCheckedChange={() => setShouldDeleteSecrets.toggle()}
            >
              Delete previously synced secrets from the destination
            </Checkbox>
          </div>
        )}
      </DeleteActionModal>
      <DeleteActionModal
        isOpen={popUp.deleteSecretsConfirmation.isOpen}
        title={`Are you sure you also want to delete secrets on ${
          (popUp?.deleteConfirmation.data as TIntegration)?.integration
        }?`}
        subTitle="By confirming, you acknowledge that all secrets managed by this integration will be removed from the destination. This action is irreversible."
        onChange={(isOpen) => handlePopUpToggle("deleteSecretsConfirmation", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={async () => {
          await onIntegrationDelete(
            (popUp?.deleteConfirmation.data as TIntegration).id,
            true,
            () => {
              handlePopUpClose("deleteSecretsConfirmation");
              handlePopUpClose("deleteConfirmation");
            }
          );
        }}
      />
    </div>
  );
};
