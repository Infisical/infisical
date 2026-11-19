import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "motion/react";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge,
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "@app/hooks/api/integrationAuth";
import { IntegrationsListPageTabs } from "@app/types/integrations";

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const schema = z.object({
  selectedSourceEnvironment: z.string(),
  secretPath: z.string(),
  targetAppId: z.string(),
  secretPrefix: z.string().trim().optional(),
  secretSuffix: z.string().trim().optional(),
  shouldLabel: z.boolean().optional(),
  labelName: z.string().trim().optional(),
  labelValue: z.string().trim().optional()
});

type FormData = z.infer<typeof schema>;

export const GcpSecretManagerConfigurePage = () => {
  const navigate = useNavigate();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "confirmIntegration"
  ] as const);
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { control, handleSubmit, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretPath: "/",
      secretPrefix: "",
      secretSuffix: "",
      shouldLabel: false,
      labelName: "managed-by",
      labelValue: "infisical",
      selectedSourceEnvironment: currentProject.environments[0].slug
    }
  });

  const shouldLabel = watch("shouldLabel");
  const selectedSourceEnvironment = watch("selectedSourceEnvironment");

  const { mutateAsync } = useCreateIntegration();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.GcpSecretManagerConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps, isPending: isIntegrationAuthAppsLoading } =
    useGetIntegrationAuthApps({
      integrationAuthId: (integrationAuthId as string) ?? ""
    });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (shouldLabel) {
      setValue("labelName", "managed-by");
      setValue("labelValue", "infisical");
      return;
    }

    setValue("labelName", "");
    setValue("labelValue", "");
  }, [shouldLabel]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetAppId", integrationAuthApps[0].appId as string);
      } else {
        setValue("targetAppId", "none");
      }
    }
  }, [integrationAuthApps]);

  const onFormSubmit = async ({
    selectedSourceEnvironment: sce,
    secretPath,
    targetAppId,
    secretPrefix,
    secretSuffix,
    shouldLabel: sl,
    labelName,
    labelValue
  }: FormData) => {
    try {
      setIsLoading(true);

      if (!integrationAuth?.id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: integrationAuthApps?.find(
          (integrationAuthApp) => integrationAuthApp.appId === targetAppId
        )?.name,
        appId: targetAppId,
        sourceEnvironment: sce,
        secretPath,
        metadata: {
          ...(secretPrefix ? { secretPrefix } : {}),
          ...(secretSuffix ? { secretSuffix } : {}),
          ...(sl
            ? {
                secretGCPLabel: {
                  labelName,
                  labelValue
                }
              }
            : {})
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

  return integrationAuth && selectedSourceEnvironment && integrationAuthApps ? (
    <form
      onSubmit={handleSubmit((data: FormData) => {
        if (!data.secretPrefix && !data.secretSuffix && !data.shouldLabel) {
          handlePopUpOpen("confirmIntegration", data);
          return;
        }

        onFormSubmit(data);
      })}
      className="flex h-full w-full flex-col items-center justify-center"
    >
      <Card className="w-full max-w-lg">
        <PageTitle title="Set Up GCP Secret Manager Integration" />
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/Google Cloud Platform.png"
              height={30}
              width={30}
              alt="GCP logo"
            />
            GCP Secret Manager Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/gcp-secret-manager" />
          </CardTitle>
          <CardDescription>
            Select which environment or folder in Infisical you want to sync to GCP Secret Manager.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={TabSections.Connection}>
            <TabsList variant="project">
              <TabsTrigger value={TabSections.Connection}>Connection</TabsTrigger>
              <TabsTrigger value={TabSections.Options}>Options</TabsTrigger>
            </TabsList>
            <TabsContent value={TabSections.Connection}>
              <motion.div
                key="panel-1"
                className="flex flex-col gap-4"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <Controller
                  control={control}
                  name="selectedSourceEnvironment"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="GcpSecretManagerConfigurePage-field-1">
                        Project Environment
                      </FieldLabel>
                      <Select
                        defaultValue={field.value}
                        value={field.value}
                        name={field.name}
                        onValueChange={(e) => onChange(e)}
                      >
                        <SelectTrigger
                          id="GcpSecretManagerConfigurePage-field-1"
                          aria-describedby="GcpSecretManagerConfigurePage-field-1-feedback"
                          isError={Boolean(error)}
                          className="w-full"
                          ref={field.ref}
                          onBlur={field.onBlur}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentProject?.environments.map((sourceEnvironment) => (
                            <SelectItem
                              value={sourceEnvironment.slug}
                              key={`source-environment-${sourceEnvironment.slug}`}
                            >
                              {sourceEnvironment.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {Boolean(error) && (
                        <FieldError id="GcpSecretManagerConfigurePage-field-1-feedback">
                          {error?.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  defaultValue=""
                  name="secretPath"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="GcpSecretManagerConfigurePage-field-2">
                        Secrets Path
                      </FieldLabel>
                      <SecretPathInput
                        id="GcpSecretManagerConfigurePage-field-2"
                        aria-describedby="GcpSecretManagerConfigurePage-field-2-feedback"
                        isError={Boolean(error)}
                        {...field}
                        environment={selectedSourceEnvironment}
                        placeholder="/"
                      />
                      {Boolean(error) && (
                        <FieldError id="GcpSecretManagerConfigurePage-field-2-feedback">
                          {error?.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="targetAppId"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                    return (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="GcpSecretManagerConfigurePage-field-3">
                          GCP Project
                        </FieldLabel>
                        <Select
                          value={field.value}
                          name={field.name}
                          onValueChange={(e) => {
                            if (e === "") return;
                            onChange(e);
                          }}
                        >
                          <SelectTrigger
                            id="GcpSecretManagerConfigurePage-field-3"
                            aria-describedby="GcpSecretManagerConfigurePage-field-3-feedback"
                            isError={Boolean(error)}
                            className="w-full"
                            ref={field.ref}
                            onBlur={field.onBlur}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
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
                          </SelectContent>
                        </Select>
                        {Boolean(error) && (
                          <FieldError id="GcpSecretManagerConfigurePage-field-3-feedback">
                            {error?.message}
                          </FieldError>
                        )}
                      </Field>
                    );
                  }}
                />
              </motion.div>
            </TabsContent>
            <TabsContent value={TabSections.Options}>
              <motion.div
                key="panel-1"
                className="flex flex-col gap-4"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: -30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <Controller
                  control={control}
                  name="secretPrefix"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="GcpSecretManagerConfigurePage-field-4">
                        Secret Prefix
                      </FieldLabel>
                      <Input
                        id="GcpSecretManagerConfigurePage-field-4"
                        aria-describedby="GcpSecretManagerConfigurePage-field-4-feedback"
                        isError={Boolean(error)}
                        {...field}
                        placeholder="INFISICAL_"
                      />
                      {Boolean(error) && (
                        <FieldError id="GcpSecretManagerConfigurePage-field-4-feedback">
                          {error?.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="secretSuffix"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="GcpSecretManagerConfigurePage-field-5">
                        Secret Suffix
                      </FieldLabel>
                      <Input
                        id="GcpSecretManagerConfigurePage-field-5"
                        aria-describedby="GcpSecretManagerConfigurePage-field-5-feedback"
                        isError={Boolean(error)}
                        {...field}
                        placeholder="_INFISICAL"
                      />
                      {Boolean(error) && (
                        <FieldError id="GcpSecretManagerConfigurePage-field-5-feedback">
                          {error?.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="shouldLabel"
                  render={({ field: { onChange, value } }) => (
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="label-gcp">Label in GCP Secret Manager</FieldLabel>
                      <Toggle
                        id="label-gcp"
                        onCheckedChange={(isChecked) => onChange(isChecked)}
                        checked={value}
                      />
                    </Field>
                  )}
                />
                {shouldLabel && (
                  <div className="flex flex-col gap-4">
                    <Controller
                      control={control}
                      name="labelName"
                      render={({ field, fieldState: { error } }) => (
                        <Field data-invalid={Boolean(error)}>
                          <FieldLabel htmlFor="GcpSecretManagerConfigurePage-field-6">
                            Label Name
                          </FieldLabel>
                          <Input
                            id="GcpSecretManagerConfigurePage-field-6"
                            aria-describedby="GcpSecretManagerConfigurePage-field-6-feedback"
                            isError={Boolean(error)}
                            {...field}
                            placeholder="managed-by"
                          />
                          {Boolean(error) && (
                            <FieldError id="GcpSecretManagerConfigurePage-field-6-feedback">
                              {error?.message}
                            </FieldError>
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="labelValue"
                      render={({ field, fieldState: { error } }) => (
                        <Field data-invalid={Boolean(error)}>
                          <FieldLabel htmlFor="GcpSecretManagerConfigurePage-field-7">
                            Label Name
                          </FieldLabel>
                          <Input
                            id="GcpSecretManagerConfigurePage-field-7"
                            aria-describedby="GcpSecretManagerConfigurePage-field-7-feedback"
                            isError={Boolean(error)}
                            {...field}
                            placeholder="infisical"
                          />
                          {Boolean(error) && (
                            <FieldError id="GcpSecretManagerConfigurePage-field-7-feedback">
                              {error?.message}
                            </FieldError>
                          )}
                        </Field>
                      )}
                    />
                  </div>
                )}
              </motion.div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button
            size="sm"
            type="submit"
            isPending={isLoading}
            isDisabled={integrationAuthApps.length === 0}
            variant="project"
          >
            Create Integration
          </Button>
        </CardFooter>
      </Card>
      {/* <div className="border-t border-border-faint w-full max-w-md mt-6"/>
      <div className="flex flex-col bg-surface-raised border border-border-control w-full p-4 max-w-lg mt-6 rounded-md">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-foreground-secondary text-xl"/>
          <span className="ml-3 text-md text-foreground">Pro Tip</span>
        </div>
        <span className="text-label text-sm mt-4">
          After creating an integration, your secrets will start syncing immediately.

          To avoid overwriting existing secrets in GCP Secret Manager, you may consider adding a secret prefix/suffix and/or enabling labeling in the options tab.
        </span>
      </div> */}
      <Dialog
        open={popUp.confirmIntegration?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("confirmIntegration", isOpen)}
      >
        <DialogContent isPending={isLoading}>
          <DialogHeader>
            <DialogTitle>Heads Up</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p>You&apos;re about to overwrite any existing secrets in GCP Secret Manager.</p>
            <p className="mt-4">
              To avoid this behavior, you may consider adding a secret prefix/suffix or enabling
              labeling in the options tab.
            </p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button onClick={() => handlePopUpClose("confirmIntegration")} variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={() => onFormSubmit(popUp.confirmIntegration?.data as FormData)}
              variant="project"
              isPending={isLoading}
            >
              Continue Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up GCP Secret Manager Integration" />
      {isIntegrationAuthAppsLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-border-control bg-surface-raised p-6 text-center text-foreground-secondary">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-foreground underline decoration-project underline-offset-4 opacity-80 duration-200 hover:opacity-100"
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
