import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import { motion } from "framer-motion";
import queryString from "query-string";
import * as yup from "yup";

import { usePopUp } from "@app/hooks";
import {
  useCreateIntegration
} from "@app/hooks/api";

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
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthTeams
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

const gitLabEntities = [
  { name: "Individual", value: "individual" },
  { name: "Group", value: "group" }
];

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const schema = yup.object({
  targetEntity: yup.string().oneOf(gitLabEntities.map(entity => entity.value), "Invalid entity type"),
  targetTeamId: yup.string(),
  selectedSourceEnvironment: yup.string().required("Source environment is required"),
  secretPath: yup.string().required("Secret path is required"),
  targetAppId: yup.string().required("GitLab project is required"),
  targetEnvironment: yup.string(),
  secretPrefix: yup.string(),
  secretSuffix: yup.string()
});

type FormData = yup.InferType<typeof schema>;

export default function GitLabCreateIntegrationPage() {
  const router = useRouter();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "confirmIntegration"
  ] as const);
  
  const {
    control,
    handleSubmit,
    setValue,
    watch
  } = useForm<FormData>({
      resolver: yupResolver(schema),
      defaultValues: {
        targetEntity: "individual",
        secretPath: "/",
        secretPrefix: "",
        secretSuffix: ""
      }
  });
  const selectedSourceEnvironment = watch("selectedSourceEnvironment");
  const targetEntity = watch("targetEntity");
  const targetTeamId = watch("targetTeamId");
  const targetAppIdValue = watch("targetAppId");

  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");

  const { data: integrationAuthApps, isLoading: isIntegrationAuthAppsLoading } = useGetIntegrationAuthApps({

    integrationAuthId: (integrationAuthId as string) ?? "",
    ...(targetTeamId ? { teamId: targetTeamId } : {})
  });
  const { data: integrationAuthTeams, isLoading: isintegrationAuthTeamsLoading } = useGetIntegrationAuthTeams(
    (integrationAuthId as string) ?? ""
  );

  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    if (workspace) {
      setValue("selectedSourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

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
          setValue("targetTeamId", String(integrationAuthTeams[0].teamId));
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
    secretSuffix
  }: FormData) => {
    try {
      setIsLoading(true);
      if (!integrationAuth?._id) return;
      
      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: integrationAuthApps?.find((integrationAuthApp) => String(integrationAuthApp.appId) === targetAppId)?.name,
        appId: String(targetAppId),
        sourceEnvironment: sse,
        targetEnvironment: targetEnvironment === "" ? "*" : targetEnvironment,
        secretPath,
        metadata: {
          secretPrefix,
          secretSuffix
        }
      });

      setIsLoading(false);
      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  }

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    integrationAuthTeams ? (
    <form 
      onSubmit={handleSubmit((data: FormData) => {
        if (!data.secretPrefix && !data.secretSuffix) {
          handlePopUpOpen("confirmIntegration", data); 
          return;
        }
        
        onFormSubmit(data);
      })}
      className="flex flex-col h-full w-full items-center justify-center"
    >
      <Head>
        <title>Set Up GitLab Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle 
          className="text-left px-6 text-xl" 
          subTitle="Select which environment or folder in Infisical you want to sync to GitLab's environment variables."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Gitlab.png"
                height={28}
                width={28}
                alt="Gitlab logo"
              />
            </div>
            <span className="ml-2.5">GitLab Integration </span>
            <Link href="https://infisical.com/docs/integrations/cicd/gitlab" passHref>
              <a target="_blank" rel="noopener noreferrer">
                <div className="ml-2 mb-1 rounded-md text-yellow text-sm inline-block bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] opacity-80 hover:opacity-100 cursor-default">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5"/> 
                  Docs
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-1.5 text-xxs mb-[0.07rem]"/> 
                </div>
              </a>
            </Link>
          </div>
        </CardTitle>
        <Tabs defaultValue={TabSections.Connection} className="px-6">
          <TabList>
            <div className="flex flex-row border-b border-mineshaft-600 w-full">
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
                      {workspace?.environments.map((sourceEnvironment) => (
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
                      <Input 
                          {...field} 
                          placeholder="/"
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
                    <Select
                      {...field}
                      onValueChange={(e) => onChange(e)}
                      className="w-full"
                    >
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
                      <Select
                        {...field}
                        onValueChange={(e) => onChange(e)}
                        className="w-full"
                      >
                        {integrationAuthTeams.length > 0 ? (
                          integrationAuthTeams.map((integrationAuthTeam) => 
                          (
                            <SelectItem
                              value={String(integrationAuthTeam.teamId as string)}
                              key={`target-team-${String(integrationAuthTeam.teamId)}`}
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
                          onChange(e)
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
                  )}}
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
                      <Input 
                          {...field} 
                          placeholder="*"
                      />
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
              className="pb-[14.25rem]"
            >
              <Controller
                control={control}
                name="secretPrefix"
                render={({ field, fieldState: { error } }) => (
                    <FormControl
                        label="Secret Prefix"
                        isError={Boolean(error)}
                        errorText={error?.message}
                    >
                    <Input 
                        {...field} 
                        placeholder="INFISICAL_"
                    />
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
                    <Input 
                        {...field} 
                        placeholder="_INFISICAL"
                    />
                    </FormControl>
                )}
              />
            </motion.div>
          </TabPanel>
        </Tabs>
        <Button
          colorSchema="primary"
          variant="outline_bg"
          className="mb-8 ml-auto mr-6 w-min"
          size="sm"
          type="submit"
          isLoading={isLoading}
          isDisabled={targetAppIdValue === "none"}
        >
          Create Integration
        </Button>
      </Card> 
      {/* <div className="border-t border-mineshaft-800 w-full max-w-md mt-6"/>
      <div className="flex flex-col bg-mineshaft-800 border border-mineshaft-600 w-full p-4 max-w-lg mt-6 rounded-md">
        <div className="flex flex-row items-center"><FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-200 text-xl"/> <span className="ml-3 text-md text-mineshaft-100">Pro Tips</span></div>
        <span className="text-mineshaft-300 text-sm mt-4">After creating an integration, your secrets will start syncing immediately. This might cause an unexpected override of current secrets in GitLab with secrets from Infisical.</span>
      </div> */}
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
            <p>
              You&apos;re about to overwrite any existing secrets in GitLab.
            </p>
            <p className="mt-4">
              To avoid this behavior, you may consider adding a secret prefix/suffix in the options tab.
            </p> 
          </ModalContent>
        </Modal>
    </form>
  ) : (
    <div className="flex justify-center items-center w-full h-full">
      <Head>
        <title>Set Up GitLab Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      {isIntegrationAuthAppsLoading || isintegrationAuthTeamsLoading ? <img src="/images/loading/loading.gif" height={70} width={120} alt="infisical loading indicator" /> : <div className="max-w-md h-max p-6 border border-mineshaft-600 rounded-md bg-mineshaft-800 text-mineshaft-200 flex flex-col text-center">
        <FontAwesomeIcon icon={faBugs} className="text-6xl my-2 inlineli"/>
        <p>
          Something went wrong. Please contact <a
            className="inline underline underline-offset-4 decoration-primary-500 opacity-80 hover:opacity-100 text-mineshaft-100 duration-200 cursor-pointer"
            target="_blank"
            rel="noopener noreferrer"
            href="mailto:support@infisical.com"
          >
            support@infisical.com
          </a> if the issue persists.
        </p>
      </div>}
    </div>
  );
}

GitLabCreateIntegrationPage.requireAuth = true;
