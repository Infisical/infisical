import Link from "next/link";
import { faArrowRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { integrationSlugNameMapping } from "public/data/frequentConstants";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  DeleteActionModal,
  EmptyState,
  FormControl,
  FormLabel,
  IconButton,
  Select,
  SelectItem,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import { TIntegration } from "@app/hooks/api/types";

type Props = {
  environments: Array<{ name: string; slug: string }>;
  integrations?: TIntegration[];
  isLoading?: boolean;
  onIntegrationDelete: (integration: TIntegration, cb: () => void) => void;
  isBotActive: boolean | undefined;
  workspaceId: string;
};

export const IntegrationsSection = ({
  integrations = [],
  environments = [],
  isLoading,
  onIntegrationDelete,
  isBotActive,
  workspaceId
}: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteConfirmation"
  ] as const);

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

      {!isBotActive && Boolean(integrations.length) && (
        <div className="px-6 py-4">
          <Alert hideTitle variant="warning">
            <AlertDescription>
              All the active integrations will be disabled. Disable End-to-End Encryption in{" "}
              <Link href={`/project/${workspaceId}/settings`} passHref>
                <a className="underline underline-offset-2">project settings </a>
              </Link>
              to re-enable it .
            </AlertDescription>
          </Alert>
        </div>
      )}

      {!isLoading && !integrations.length && isBotActive && (
        <div className="mx-6">
          <EmptyState
            className="rounded-md border border-mineshaft-700 pt-8 pb-4"
            title="No integrations found. Click on one of the below providers to sync secrets."
          />
        </div>
      )}
      {!isLoading && isBotActive && (
        <div className="flex flex-col space-y-4 p-6 pt-0">
          {integrations?.map((integration) => (
            <div
              className="max-w-8xl flex justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 pb-2"
              key={`integration-${integration?._id.toString()}`}
            >
              <div className="flex">
                <div>
                  <FormControl label="Environment">
                    <Select
                      value={integration.environment}
                      isDisabled={integration.isActive}
                      className="min-w-[8rem] border border-mineshaft-700"
                    >
                      {environments.map((environment) => {
                        return (
                          <SelectItem
                            value={environment.slug}
                            key={`environment-${environment.slug}`}
                          >
                            {environment.name}
                          </SelectItem>
                        );
                      })}
                    </Select>
                  </FormControl>
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
                <div className="ml-2 flex flex-col">
                  <FormLabel label={integration?.metadata?.scope || "App"} />
                  <div className="min-w-[8rem] rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                    {integration.integration === "hashicorp-vault"
                      ? `${integration.app} - path: ${integration.path}`
                      : integration.app}
                  </div>
                </div>
                {(integration.integration === "vercel" ||
                  integration.integration === "netlify" ||
                  integration.integration === "railway" ||
                  integration.integration === "gitlab" ||
                  integration.integration === "teamcity" ||
                  integration.integration === "bitbucket") && (
                  <div className="ml-4 flex flex-col">
                    <FormLabel label="Target Environment" />
                    <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                      {integration.targetEnvironment}
                    </div>
                  </div>
                )}
                {((integration.integration === "checkly") || (integration.integration === "github")) && (
                  <>
                    {integration.targetService && (
                      <div className="ml-2">
                        <FormLabel label="Group" />
                        <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                          {integration.targetService}
                        </div>
                      </div>
                    )}
                    <div className="ml-2">
                      <FormLabel label="Secret Suffix" />
                      <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                        {integration?.metadata?.secretSuffix || "-"}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex cursor-default items-center">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={ProjectPermissionSub.Integrations}
                >
                  {(isAllowed: boolean) => (
                    <div className="ml-2 opacity-80 duration-200 hover:opacity-100">
                      <Tooltip content="Remove Integration">
                        <IconButton
                          onClick={() => handlePopUpOpen("deleteConfirmation", integration)}
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
        } integration for ${(popUp?.deleteConfirmation.data as TIntegration)?.app || " "}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteConfirmation", isOpen)}
        deleteKey={(popUp?.deleteConfirmation?.data as TIntegration)?.app || ""}
        onDeleteApproved={async () =>
          onIntegrationDelete(popUp?.deleteConfirmation.data as TIntegration, () =>
            handlePopUpClose("deleteConfirmation")
          )
        }
      />
    </div>
  );
};
