import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  ProjectPermissionSecretScanningConfigActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import type { TSecretScanningConfig } from "@app/hooks/api/secretScanningV2/types";

import { useProjectPermission } from "../../access/permissions";
import { ProductProjectScope } from "../../access/project/scope";
import { failed, saved } from "../../access/toast";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { ProjectGeneralSettings } from "../../project/SettingsPage/general";

const route = v4Path("/organizations/$orgId/secret-scanning/settings");

const configSchema = z.object({
  content: z.string().max(5000, "Cannot exceed 5000 characters")
});

const ConfigForm = ({
  config,
  canUpdate
}: {
  config: TSecretScanningConfig;
  canUpdate: boolean;
}) => {
  const update = useV4Adapter("secretScanning").useUpdateConfig();
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isDirty }
  } = useForm<z.infer<typeof configSchema>>({
    resolver: zodResolver(configSchema),
    defaultValues: { content: config.content ?? "" },
    mode: "onChange"
  });
  const error = errors.content?.message;
  return (
    <SettingsCard
      title={
        <Inline gap={8} align="center">
          Scanning configuration
          <DocumentationLink
            href="https://infisical.com/docs/documentation/platform/secret-scanning/configuration"
            subject="scanning configuration"
          />
        </Inline>
      }
      dirty={isDirty}
      saveDisabledReason={
        canUpdate ? undefined : "You don't have permission to update the configuration"
      }
      onDiscard={() => reset()}
      onSave={() =>
        new Promise<void>((resolve, reject) => {
          handleSubmit(
            async ({ content }) => {
              try {
                await update.mutateAsync({ projectId: config.projectId, content: content || null });
              } catch (cause) {
                failed("Failed to save scanning configuration", cause);
                reject(cause);
                return;
              }
              reset({ content });
              saved("Scanning configuration saved");
              resolve();
            },
            () => reject(new Error("Fix the highlighted field, then save again."))
          )();
        })
      }
    >
      <Field label="Rules and exceptions" description="Gitleaks TOML." error={error} wide>
        <Textarea
          mono
          rows={18}
          disabled={!canUpdate}
          aria-invalid={Boolean(error) || undefined}
          placeholder={"[extend]\nuseDefault = true"}
          {...register("content")}
        />
      </Field>
    </SettingsCard>
  );
};

const ScanningConfig = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const { data: subscription, isPending: subscriptionPending } =
    useV4Adapter("billing").useSubscription(orgId);
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const { data: config, isPending } = useV4Adapter("secretScanning").useConfig(projectId);
  if (subscriptionPending || permissionPending) return <Loader label="Loading settings" />;
  if (!subscription?.secretScanning)
    return (
      <EmptyState
        icon="lock"
        title="Secret Scanning isn't on your plan"
        description="Contact Infisical support to enable it."
      />
    );
  if (
    permission.cannot(
      ProjectPermissionSecretScanningConfigActions.Read,
      ProjectPermissionSub.SecretScanningConfigs
    )
  )
    return <AccessRestricted requirement="read Secret Scanning configs" />;
  if (isPending) return <Loader label="Loading scanning configuration" />;
  if (!config) return <EmptyState title="Could not load the scanning configuration" />;
  return (
    <ConfigForm
      config={config}
      canUpdate={permission.can(
        ProjectPermissionSecretScanningConfigActions.Update,
        ProjectPermissionSub.SecretScanningConfigs
      )}
    />
  );
};

const tabs = [
  { value: "general", label: "General" },
  { value: "scanning-settings", label: "Scanning settings" }
];

const Settings = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const navigate = useNavigate();
  const { selectedTab } = useSearch({ from: route });
  const { data: instanceState, isPending } = useV4Adapter("secretScanning").useInstanceState(orgId);
  const hasMultipleProjects = Boolean(instanceState?.isMultiInstance);
  const isGeneralRequested = !selectedTab || selectedTab === "general";
  const activeTab =
    !hasMultipleProjects && isGeneralRequested ? "scanning-settings" : selectedTab || "general";

  let body = <ScanningConfig orgId={orgId} projectId={projectId} />;
  if (isGeneralRequested && isPending) body = <Loader label="Loading settings" />;
  else if (activeTab === "general")
    body = (
      <ProductProjectScope value={{ orgId, projectId, projectType: ProjectType.SecretScanning }}>
        <ProjectGeneralSettings />
      </ProductProjectScope>
    );

  return (
    <Stack gap={24}>
      <PageHeader
        title="Settings"
        tabs={
          hasMultipleProjects ? (
            <Tabs
              label="Settings sections"
              value={activeTab}
              onValueChange={(next) =>
                navigate({ to: ".", search: (prev) => ({ ...prev, selectedTab: next }) })
              }
              tabs={tabs.map((tab) => ({ ...tab, content: null }))}
            />
          ) : undefined
        }
      />
      {body}
    </Stack>
  );
};

export const SettingsPage = () => {
  const { orgId } = useParams({ from: route });
  const { data: projectId, isPending } = useV4Adapter("secretScanning").useProjectId(orgId);
  return (
    <TooltipProvider>
      <PageTitle title="Settings" />
      {isPending && <Loader size="page" label="Loading settings" />}
      {!isPending && !projectId && (
        <EmptyState icon="search" title="Secret Scanning is not set up" />
      )}
      {projectId && <Settings orgId={orgId} projectId={projectId} />}
    </TooltipProvider>
  );
};
