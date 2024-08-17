import { faCalendarCheck } from "@fortawesome/free-regular-svg-icons";
import { faArrowRight, faRefresh, faWarning, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { integrationSlugNameMapping } from "public/data/frequentConstants";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  DeleteActionModal,
  EmptyState,
  FormLabel,
  IconButton,
  Skeleton,
  Tag,
  Tooltip
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { useSyncIntegration } from "@app/hooks/api/integrations/queries";
import { IntegrationMappingBehavior } from "@app/hooks/api/integrations/types";
import { TIntegration } from "@app/hooks/api/types";

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
            <div
              className="max-w-8xl flex justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3"
              key={`integration-${integration?.id.toString()}`}
            >
              <div className="flex">
                <div className="ml-2 flex flex-col">
                  <FormLabel label="Environment" />
                  <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                    {environments.find((e) => e.id === integration.envId)?.name || "-"}
                  </div>
                </div>
                <div className="ml-2 flex flex-col">
                  <FormLabel label="Secret Path" />
                  <div className="min-w-[8rem] rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                    {integration.secretPath}
                  </div>
                </div>
                <div className="flex h-full items-center">
                  <FontAwesomeIcon icon={faArrowRight} className="mx-4 text-gray-400" />
                </div>
                <div className="ml-4 flex flex-col">
                  <FormLabel label="Integration" />
                  <div className="min-w-[8rem] rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                    {integrationSlugNameMapping[integration.integration]}
                  </div>
                </div>
                {integration.integration === "qovery" && (
                  <div className="flex flex-row">
                    <div className="ml-2 flex flex-col">
                      <FormLabel label="Org" />
                      <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                        {integration?.owner || "-"}
                      </div>
                    </div>
                    <div className="ml-2 flex flex-col">
                      <FormLabel label="Project" />
                      <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                        {integration?.targetService || "-"}
                      </div>
                    </div>
                    <div className="ml-2 flex flex-col">
                      <FormLabel label="Env" />
                      <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                        {integration?.targetEnvironment || "-"}
                      </div>
                    </div>
                  </div>
                )}
                {!(
                  integration.integration === "aws-secret-manager" &&
                  integration.metadata?.mappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE
                ) && (
                  <div className="ml-2 flex flex-col">
                    <FormLabel
                      label={
                        (integration.integration === "qovery" && integration?.scope) ||
                        (integration.integration === "aws-secret-manager" && "Secret") ||
                        (["aws-parameter-store", "rundeck"].includes(integration.integration) &&
                          "Path") ||
                        (integration?.integration === "terraform-cloud" && "Project") ||
                        (integration?.scope === "github-org" && "Organization") ||
                        (["github-repo", "github-env"].includes(integration?.scope as string) &&
                          "Repository") ||
                        "App"
                      }
                    />
                    <div className="no-scrollbar::-webkit-scrollbar min-w-[8rem] max-w-[12rem] overflow-scroll whitespace-nowrap rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200 no-scrollbar">
                      {(integration.integration === "hashicorp-vault" &&
                        `${integration.app} - path: ${integration.path}`) ||
                        (integration.scope === "github-org" && `${integration.owner}`) ||
                        (["aws-parameter-store", "rundeck"].includes(integration.integration) &&
                          `${integration.path}`) ||
                        (integration.scope?.startsWith("github-") &&
                          `${integration.owner}/${integration.app}`) ||
                        integration.app}
                    </div>
                  </div>
                )}
                {(integration.integration === "vercel" ||
                  integration.integration === "netlify" ||
                  integration.integration === "railway" ||
                  integration.integration === "gitlab" ||
                  integration.integration === "teamcity" ||
                  integration.integration === "bitbucket" ||
                  (integration.integration === "github" && integration.scope === "github-env")) && (
                  <div className="ml-4 flex flex-col">
                    <FormLabel label="Target Environment" />
                    <div className="overflow-clip text-ellipsis whitespace-nowrap rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                      {integration.targetEnvironment || integration.targetEnvironmentId}
                    </div>
                  </div>
                )}
                {integration.integration === "checkly" && integration.targetService && (
                  <div className="ml-2">
                    <FormLabel label="Group" />
                    <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                      {integration.targetService}
                    </div>
                  </div>
                )}
                {integration.integration === "terraform-cloud" && integration.targetService && (
                  <div className="ml-2">
                    <FormLabel label="Category" />
                    <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                      {integration.targetService}
                    </div>
                  </div>
                )}
                {(integration.integration === "checkly" ||
                  integration.integration === "github") && (
                  <div className="ml-2">
                    <FormLabel label="Secret Suffix" />
                    <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                      {integration?.metadata?.secretSuffix || "-"}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-[1.5rem] flex cursor-default">
                {integration.isSynced != null && integration.lastUsed != null && (
                  <Tag
                    key={integration.id}
                    className={integration.isSynced ? "bg-green-800" : "bg-red/80"}
                  >
                    <Tooltip
                      center
                      className="max-w-xs whitespace-normal break-words"
                      content={
                        <div className="flex max-h-[10rem] flex-col overflow-auto ">
                          <div className="flex self-start">
                            <FontAwesomeIcon
                              icon={faCalendarCheck}
                              className="pt-0.5 pr-2 text-sm"
                            />
                            <div className="text-sm">Last sync</div>
                          </div>
                          <div className="pl-5 text-left text-xs">
                            {format(new Date(integration.lastUsed), "yyyy-MM-dd, hh:mm aaa")}
                          </div>
                          {!integration.isSynced && (
                            <>
                              <div className="mt-2 flex self-start">
                                <FontAwesomeIcon icon={faXmark} className="pt-1 pr-2 text-sm" />
                                <div className="text-sm">Fail reason</div>
                              </div>
                              <div className="pl-5 text-left text-xs">
                                {integration.syncMessage}
                              </div>
                            </>
                          )}
                        </div>
                      }
                    >
                      <div className="flex items-center space-x-2 text-white">
                        <div>{integration.isSynced ? "Synced" : "Not synced"}</div>
                        {!integration.isSynced && <FontAwesomeIcon icon={faWarning} />}
                      </div>
                    </Tooltip>
                  </Tag>
                )}
                <div className="mr-1 flex items-end opacity-80 duration-200 hover:opacity-100">
                  <Tooltip className="text-center" content="Manually sync integration secrets">
                    <Button
                      onClick={() =>
                        syncIntegration({
                          workspaceId,
                          id: integration.id,
                          lastUsed: integration.lastUsed as string
                        })
                      }
                      className="max-w-[2.5rem] border-none bg-mineshaft-500"
                    >
                      <FontAwesomeIcon icon={faRefresh} className="px-1 text-bunker-200" />
                    </Button>
                  </Tooltip>
                </div>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={ProjectPermissionSub.Integrations}
                >
                  {(isAllowed: boolean) => (
                    <div className="flex items-end opacity-80 duration-200 hover:opacity-100">
                      <Tooltip content="Remove Integration">
                        <IconButton
                          onClick={() => {
                            setShouldDeleteSecrets.off();
                            handlePopUpOpen("deleteConfirmation", integration);
                          }}
                          ariaLabel="delete"
                          isDisabled={!isAllowed}
                          colorSchema="danger"
                          variant="star"
                        >
                          <FontAwesomeIcon icon={faXmark} className="px-0.5" />
                        </IconButton>
                      </Tooltip>
                    </div>
                  )}
                </ProjectPermissionCan>
              </div>
            </div>
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
