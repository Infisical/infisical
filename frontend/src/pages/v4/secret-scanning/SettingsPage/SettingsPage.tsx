import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import { Textarea } from "@app/components/v4/ui/textarea";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionSecretScanningConfigActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TSecretScanningConfig } from "@app/hooks/api/secretScanningV2/types";

import { useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";

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
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/configuration" />
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
      {projectId && (
        <Stack gap={24}>
          <PageHeader title="Settings" />
          <ScanningConfig orgId={orgId} projectId={projectId} />
        </Stack>
      )}
    </TooltipProvider>
  );
};
