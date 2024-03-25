import { Controller, useForm } from "react-hook-form";
import Link from "next/link";
import { faArrowRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import { integrationSlugNameMapping } from "public/data/frequentConstants";
import * as yup from "yup";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  Button,
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
import { TCloudIntegration, TIntegration } from "@app/hooks/api/types";

const filterIntegrationSchema = yup.object({
  environment: yup.string().trim().optional(),
  integration: yup.string().trim().optional(),
  sort: yup.string().required()
});

export type FilterIntegrationData = yup.InferType<typeof filterIntegrationSchema>;

type Props = {
  environments: Array<{ name: string; slug: string; id: string }>;
  integrations?: TIntegration[];
  cloudIntegrations?: TCloudIntegration[];
  isCloudIntegrationLoading?: boolean;
  isLoading?: boolean;
  onFilterChange: (data: FilterIntegrationData) => void;
  onIntegrationDelete: (integration: TIntegration, cb: () => void) => void;
  isBotActive: boolean | undefined;
  workspaceId: string;
};

export const IntegrationsSection = ({
  integrations = [],
  cloudIntegrations = [],
  environments = [],
  isLoading,
  onIntegrationDelete,
  onFilterChange,
  isBotActive,
  workspaceId
}: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteConfirmation"
  ] as const);

  const {
    control,
    reset,
    getValues,
    formState: { isDirty }
  } = useForm<FilterIntegrationData>({
    resolver: yupResolver(filterIntegrationSchema),
    defaultValues: {
      environment: "",
      integration: "",
      sort: "integration:asc"
    }
  });

  function handleDropdownChange(value: string, onChange: (value: string) => void) {
    onChange(value);
    onFilterChange(getValues());
  }

  function handleReset() {
    reset();
    onFilterChange(getValues());
  }

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
              to re-enable it.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {isBotActive && (
        <div className="my-2 flex w-full items-end justify-between px-6">
          <div className="flex gap-4">
            <Controller
              control={control}
              name="environment"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Environment"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    className="w-60 bg-mineshaft-700"
                    dropdownContainerClassName="bg-mineshaft-700"
                    defaultValue={field.value}
                    onValueChange={(value) => handleDropdownChange(value, onChange)}
                    {...field}
                  >
                    {environments.map((e) => (
                      <SelectItem value={e.id} key={`filter-env-${e.slug}`}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="integration"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Integration"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    className="w-60 bg-mineshaft-700"
                    dropdownContainerClassName="bg-mineshaft-700"
                    defaultValue={field.value}
                    onValueChange={(value) => handleDropdownChange(value, onChange)}
                    {...field}
                  >
                    {cloudIntegrations.map((e) => (
                      <SelectItem value={e.slug} key={`filter-int-${e.slug}`}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            {isDirty && (
              <Button
                onClick={() => handleReset()}
                aria-label="reset"
                colorSchema="secondary"
                variant="star"
                className="mt-1 h-9 self-center border border-red hover:bg-red"
              >
                <FontAwesomeIcon icon={faXmark} className="pr-3" />
                <span>Clear filter</span>
              </Button>
            )}
          </div>
          <div className="flex gap-4">
            <Controller
              control={control}
              name="sort"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Sort by"
                  labelClassName="justify-end"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    className="w-44 bg-mineshaft-700"
                    dropdownContainerClassName="bg-mineshaft-700"
                    defaultValue={field.value}
                    onValueChange={(value) => handleDropdownChange(value, onChange)}
                    {...field}
                  >
                    <SelectItem value="app:asc" key="sort-asc-app">
                      App (A-&gt;Z)
                    </SelectItem>
                    <SelectItem value="app:desc" key="sort-dsc-app">
                      App (Z-&gt;A)
                    </SelectItem>
                    <SelectItem value="project_environments.name:asc" key="sort-asc-env">
                      Environment (A-&gt;Z)
                    </SelectItem>
                    <SelectItem value="project_environments.name:desc" key="sort-dsc-env">
                      Environment (Z-&gt;A)
                    </SelectItem>
                    <SelectItem value="integration:asc" key="sort-asc-integration">
                      Integration (A-&gt;Z)
                    </SelectItem>
                    <SelectItem value="integration:desc" key="sort-dsc-integration">
                      Integration (Z-&gt;A)
                    </SelectItem>
                    <SelectItem value="secretPath:asc" key="sort-asc-secret-path">
                      Secret path (A-&gt;Z)
                    </SelectItem>
                    <SelectItem value="secretPath:desc" key="sort-dsc-secret-path">
                      Secret path (Z-&gt;A)
                    </SelectItem>
                  </Select>
                </FormControl>
              )}
            />
          </div>
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
              className="max-w-8xl flex justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3"
              key={`integration-${integration?.id.toString()}`}
            >
              <div className="flex">
                <div className="ml-2 flex flex-col">
                  <FormLabel label="Environment" />
                  <div className="min-w-[8rem] rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                    {environments.find((e) => e.id === integration.envId)?.name || "-"}
                  </div>
                </div>
                <div className="ml-2 flex flex-col">
                  <FormLabel label="Secret Path" />
                  <div className="min-w-[8rem] max-w-[12rem] overflow-clip text-ellipsis whitespace-nowrap rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200 ">
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
                  <FormLabel
                    label={
                      (integration.integration === "qovery" && integration?.scope) ||
                      (integration?.scope === "github-org" && "Organization") ||
                      (["github-repo", "github-env"].includes(integration?.scope as string) &&
                        "Repository") ||
                      "App"
                    }
                  />
                  <div className="min-w-[8rem] max-w-[12rem] overflow-clip text-ellipsis whitespace-nowrap rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200">
                    {(integration.integration === "hashicorp-vault" &&
                      `${integration.app} - path: ${integration.path}`) ||
                      (integration.scope === "github-org" && `${integration.owner}`) ||
                      (integration.scope?.startsWith("github-") &&
                        `${integration.owner}/${integration.app}`) ||
                      integration.app}
                  </div>
                </div>
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
        deleteKey={
          (popUp?.deleteConfirmation?.data as TIntegration)?.app ||
          (popUp?.deleteConfirmation?.data as TIntegration)?.owner ||
          ""
        }
        onDeleteApproved={async () =>
          onIntegrationDelete(popUp?.deleteConfirmation.data as TIntegration, () =>
            handlePopUpClose("deleteConfirmation")
          )
        }
      />
    </div>
  );
};
