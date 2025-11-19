import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { z } from "zod";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthTeams
} from "@app/hooks/api/integrationAuth";
import { IntegrationSyncBehavior } from "@app/hooks/api/integrations/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const gitLabEntities = [
  { name: "Individual", value: "individual" },
  { name: "Group", value: "group" }
] as const;

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const initialSyncBehaviors = [
  {
    label: "No Import - Overwrite all values in GitLab",
    value: IntegrationSyncBehavior.OVERWRITE_TARGET
  },
  { label: "Import - Prefer values from Infisical", value: IntegrationSyncBehavior.PREFER_SOURCE }
];

const schema = z.object({
  targetEntity: z.enum([gitLabEntities[0].value, gitLabEntities[1].value]),
  targetTeamId: z.string().optional(),
  selectedSourceEnvironment: z.string(),
  secretPath: z.string(),
  targetAppId: z.string(),
  targetEnvironment: z.string().optional(),
  secretPrefix: z.string().optional(),
  secretSuffix: z.string().optional(),
  shouldMaskSecrets: z.boolean().optional(),
  shouldProtectSecrets: z.boolean().default(false),
  initialSyncBehavior: z.nativeEnum(IntegrationSyncBehavior)
});

type FormData = z.infer<typeof schema>;

export const GitlabConfigurePage = () => {
  const navigate = useNavigate();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "confirmIntegration"
  ] as const);
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { control, handleSubmit, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      targetEntity: "individual",
      secretPath: "/",
      secretPrefix: "",
      secretSuffix: "",
      selectedSourceEnvironment: currentProject.environments[0].slug,
      initialSyncBehavior: IntegrationSyncBehavior.PREFER_SOURCE
    }
  });
  const selectedSourceEnvironment = watch("selectedSourceEnvironment");
  const targetEntity = watch("targetEntity");
  const targetTeamId = watch("targetTeamId");
  const targetAppIdValue = watch("targetAppId");

  const { mutateAsync } = useCreateIntegration();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GitlabConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? "",
      ...(targetTeamId ? { teamId: targetTeamId } : {})
    });
  const { data: integrationAuthTeams, isPending: isintegrationAuthTeamsLoading } =
    useGetIntegrationAuthTeams((integrationAuthId as string) ?? "");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetAppId", String(integrationAuthApps[0].appId as string));
      } else {
        setValue("targetAppId", "none");
      }
    }
  }, [integrationAuthApps]);

  useEffect(() => {
    if (targetEntity === "group" && integrationAuthTeams && integrationAuthTeams.length > 0) {
      if (integrationAuthTeams) {
        if (integrationAuthTeams.length > 0) {
          // case: user is part of at least 1 group in GitLab
          setValue("targetTeamId", String(integrationAuthTeams[0].id));
        } else {
          // case: user is not part of any groups in GitLab
          setValue("targetTeamId", "none");
        }
      }
    } else if (targetEntity === "individual") {
      setValue("targetTeamId", undefined);
    }
  }, [targetEntity, integrationAuthTeams]);

  const onFormSubmit = async ({
    selectedSourceEnvironment: sse,
    secretPath,
    targetAppId,
    targetEnvironment,
    secretPrefix,
    secretSuffix,
    shouldMaskSecrets,
    shouldProtectSecrets,
    initialSyncBehavior
  }: FormData) => {
    try {
      setIsLoading(true);
      if (!integrationAuth?.id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: integrationAuthApps?.find(
          (integrationAuthApp) => String(integrationAuthApp.appId) === targetAppId
        )?.name,
        appId: String(targetAppId),
        sourceEnvironment: sse,
        targetEnvironment: targetEnvironment === "" ? "*" : targetEnvironment,
        secretPath,
        metadata: {
          secretPrefix,
          secretSuffix,
          shouldMaskSecrets,
          shouldProtectSecrets,
          initialSyncBehavior
        }
      });

      setIsLoading(false);
      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          selectedTab: IntegrationsListPageTabs.NativeIntegrations
        }
      });
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  return integrationAuth &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    integrationAuthTeams ? (
    <form
      onSubmit={handleSubmit((data: FormData) => {
        if (
          !data.secretPrefix &&
          !data.secretSuffix &&
          data.initialSyncBehavior === IntegrationSyncBehavior.OVERWRITE_TARGET
        ) {
          handlePopUpOpen("confirmIntegration", data);
          return;
        }

        onFormSubmit(data);
      })}
      className="flex h-full w-full flex-col items-center justify-center"
    >
      <Helmet>
        <title>Set Up GitLab Integration</title>
      </Helmet>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select which environment or folder in Infisical you want to sync to GitLab's environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img src="/images/integrations/GitLab.png" height={28} width={28} alt="Gitlab logo" />
            </div>
            <span className="ml-2.5">GitLab Integration </span>
            <a
              href="https://infisical.com/docs/integrations/cicd/gitlab"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="text-xxs mb-[0.07rem] ml-1.5"
                />
              </div>
            </a>
          </div>
        </CardTitle>
        <Tabs defaultValue={TabSections.Connection} className="px-6">
          <TabList>
            <div className="flex w-full flex-row border-b border-mineshaft-600">
              <Tab value={TabSections.Connection}>Connection</Tab>
              <Tab value={TabSections.Options}>Options</Tab>
            </div>
          </TabList>
          <TabPanel value={TabSections.Connection}>
            <motion.div
              key="panel-1"
              transition={{ duration: 0.15 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: 30 }}
            >
              <Controller
                control={control}
                name="selectedSourceEnvironment"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Project Environment"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Select
                      defaultValue={field.value}
                      {...field}
                      onValueChange={(e) => onChange(e)}
                      className="w-full"
                    >
                      {currentProject?.environments.map((sourceEnvironment) => (
                        <SelectItem
                          value={sourceEnvironment.slug}
                          key={`source-environment-${sourceEnvironment.slug}`}
                        >
                          {sourceEnvironment.name}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="secretPath"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Secrets Path"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <SecretPathInput
                      {...field}
                      placeholder="/"
                      environment={selectedSourceEnvironment}
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="targetEntity"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="GitLab Integration Type"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Select {...field} onValueChange={(e) => onChange(e)} className="w-full">
                      {gitLabEntities.map((entity) => {
                        return (
                          <SelectItem value={entity.value} key={`target-entity-${entity.value}`}>
                            {entity.name}
                          </SelectItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                )}
              />
              {targetEntity === "group" && targetTeamId && (
                <Controller
                  control={control}
                  name="targetTeamId"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="GitLab Group"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Select {...field} onValueChange={(e) => onChange(e)} className="w-full">
                        {integrationAuthTeams.length > 0 ? (
                          integrationAuthTeams.map((integrationAuthTeam) => (
                            <SelectItem
                              value={String(integrationAuthTeam.id as string)}
                              key={`target-team-${String(integrationAuthTeam.id)}`}
                            >
                              {integrationAuthTeam.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" key="target-team-none">
                            No groups found
                          </SelectItem>
                        )}
                      </Select>
                    </FormControl>
                  )}
                />
              )}
              <Controller
                control={control}
                name="targetAppId"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                  return (
                    <FormControl
                      label="GitLab Project"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Select
                        {...field}
                        onValueChange={(e) => {
                          if (e === "") return;
                          onChange(e);
                        }}
                        className="w-full"
                      >
                        {integrationAuthApps.length > 0 ? (
                          integrationAuthApps.map((integrationAuthApp) => (
                            <SelectItem
                              value={String(integrationAuthApp.appId as string)}
                              key={`target-app-${String(integrationAuthApp.appId)}`}
                            >
                              {integrationAuthApp.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" key="target-app-none">
                            No projects found
                          </SelectItem>
                        )}
                      </Select>
                    </FormControl>
                  );
                }}
              />
              <Controller
                control={control}
                defaultValue=""
                name="targetEnvironment"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="GitLab Environment Scope (Optional)"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="*" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="initialSyncBehavior"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Initial Sync Behavior"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Select
                      defaultValue={field.value}
                      onValueChange={(e) => onChange(e)}
                      className="w-full border border-mineshaft-500"
                      dropdownContainerClassName="max-w-full"
                    >
                      {initialSyncBehaviors.map((b) => {
                        return (
                          <SelectItem
                            value={b.value}
                            key={`sync-behavior-${b.value}`}
                            className="w-full"
                          >
                            {b.label}
                          </SelectItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                )}
              />
            </motion.div>
          </TabPanel>
          <TabPanel value={TabSections.Options}>
            <motion.div
              key="panel-1"
              transition={{ duration: 0.15 }}
              initial={{ opacity: 0, translateX: -30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: 30 }}
              className="pb-57"
            >
              <div className="ml-1">
                <Controller
                  control={control}
                  name="shouldMaskSecrets"
                  render={({ field: { onChange, value } }) => (
                    <Switch
                      id="should-mask-secrets"
                      onCheckedChange={(isChecked) => onChange(isChecked)}
                      isChecked={value}
                    >
                      <div className="max-w-md">
                        Mark Infisical secrets in Gitlab as &apos;Masked&apos; secrets
                      </div>
                    </Switch>
                  )}
                />
              </div>
              <div className="mt-4 mb-5 ml-1">
                <Controller
                  control={control}
                  name="shouldProtectSecrets"
                  render={({ field: { onChange, value } }) => (
                    <Switch
                      id="should-protect-secrets"
                      onCheckedChange={(isChecked) => onChange(isChecked)}
                      isChecked={value}
                    >
                      Mark Infisical secrets in Gitlab as &apos;Protected&apos; secrets
                    </Switch>
                  )}
                />
              </div>
              <Controller
                control={control}
                name="secretPrefix"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Secret Prefix"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="INFISICAL_" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="secretSuffix"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Secret Suffix"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="_INFISICAL" />
                  </FormControl>
                )}
              />
            </motion.div>
          </TabPanel>
        </Tabs>
        <Button
          colorSchema="primary"
          variant="outline_bg"
          className="mr-6 mb-8 ml-auto w-min"
          size="sm"
          type="submit"
          isLoading={isLoading}
          isDisabled={targetAppIdValue === "none"}
        >
          Create Integration
        </Button>
      </Card>
      <Modal
        isOpen={popUp.confirmIntegration?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("confirmIntegration", isOpen)}
      >
        <ModalContent
          title="Heads Up"
          footerContent={
            <div className="flex items-center space-x-2">
              <Button onClick={() => onFormSubmit(popUp.confirmIntegration?.data as FormData)}>
                Continue Anyway
              </Button>
              <Button
                onClick={() => handlePopUpClose("confirmIntegration")}
                variant="outline_bg"
                colorSchema="secondary"
              >
                Cancel
              </Button>
            </div>
          }
        >
          <p>You&apos;re about to overwrite any existing secrets in GitLab.</p>
          <p className="mt-4">
            To avoid this behavior, you may consider adding a secret prefix/suffix in the options
            tab.
          </p>
        </ModalContent>
      </Modal>
    </form>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Set Up GitLab Integration</title>
      </Helmet>
      {isIntegrationAuthAppsLoading || isintegrationAuthTeamsLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center text-mineshaft-200">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
              target="_blank"
              rel="noopener noreferrer"
              href="mailto:support@infisical.com"
            >
              support@infisical.com
            </a>{" "}
            if the issue persists.
          </p>
        </div>
      )}
    </div>
  );
};
