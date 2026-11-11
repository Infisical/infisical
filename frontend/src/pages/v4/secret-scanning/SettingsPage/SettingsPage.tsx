import { useState } from "react";
import { useParams } from "@tanstack/react-router";

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
const MAX_LENGTH = 5000;

const ConfigForm = ({
  config,
  canUpdate
}: {
  config: TSecretScanningConfig;
  canUpdate: boolean;
}) => {
  const update = useV4Adapter("secretScanning").useUpdateConfig();
  const [savedContent, setSavedContent] = useState(config.content ?? "");
  const [content, setContent] = useState(savedContent);
  const error = content.length > MAX_LENGTH ? `Cannot exceed ${MAX_LENGTH} characters` : undefined;
  return (
    <SettingsCard
      title={
        <Inline gap={8} align="center">
          Scanning configuration
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/configuration" />
        </Inline>
      }
      dirty={content !== savedContent}
      saveDisabledReason={
        canUpdate ? undefined : "You don't have permission to update the configuration"
      }
      onDiscard={() => setContent(savedContent)}
      onSave={async () => {
        if (error) throw new Error(error);
        try {
          await update.mutateAsync({ projectId: config.projectId, content: content || null });
        } catch (cause) {
          failed("Failed to save scanning configuration", cause);
          throw cause;
        }
        setSavedContent(content);
        saved("Scanning configuration saved");
      }}
    >
      <Field label="Rules and exceptions" description="Gitleaks TOML." error={error} wide>
        <Textarea
          mono
          rows={18}
          value={content}
          disabled={!canUpdate}
          aria-invalid={Boolean(error) || undefined}
          placeholder={"[extend]\nuseDefault = true"}
          onChange={(event) => setContent(event.target.value)}
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
  if (isPending) return <Loader size="page" label="Loading settings" />;
  if (!projectId) return <EmptyState icon="search" title="Secret Scanning is not set up" />;
  return (
    <TooltipProvider>
      <PageTitle title="Settings" />
      <Stack gap={24}>
        <PageHeader title="Settings" />
        <ScanningConfig orgId={orgId} projectId={projectId} />
      </Stack>
    </TooltipProvider>
  );
};
