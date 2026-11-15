import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { z } from "zod";

import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";
import { slugSchema } from "@app/lib/schemas/slugSchema";

import { useOrgId } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { FormSkeleton, RESTRICTED } from "../../access/ui";
import { useV4Adapter, useV4Mode } from "../../data/adapters";
import { PLATFORM_NAMES } from "./workflow-platforms";

const TEAMS_DOCS =
  "https://infisical.com/docs/documentation/platform/workflow-integrations/microsoft-teams-integration";

export type WorkflowSheetState =
  | { mode: "add"; platform: WorkflowIntegrationPlatform }
  | { mode: "edit"; platform: WorkflowIntegrationPlatform; id: string };

type Draft = { slug: string; description: string; tenantId: string };

const aliasSchema = slugSchema({ min: 1, field: "Alias" });
const tenantSchema = z
  .string()
  .trim()
  .min(1, { message: "Tenant ID is required" })
  .uuid("Tenant ID must be a valid UUID");

const draftSchema = (needsTenant: boolean) =>
  z.object({
    slug: aliasSchema,
    description: z.string(),
    tenantId: needsTenant ? tenantSchema : z.string()
  });

const hex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

const redirectToMicrosoft = ({
  clientId,
  tenantId,
  slug,
  description
}: {
  clientId: string;
  tenantId: string;
  slug: string;
  description: string;
}) => {
  const csrfToken = hex(32);
  localStorage.setItem("latestCSRFToken", csrfToken);
  const redirectUri = `${window.location.origin}/organization/settings/oauth/callback`;
  const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: "https://graph.microsoft.com/.default",
    state: JSON.stringify({ redirectUri, tenantId, slug, description, csrfToken, clientId }),
    prompt: "consent",
    admin_consent: "true"
  }).toString();
  window.location.assign(url.toString());
};

const useConnect = (platform: WorkflowIntegrationPlatform, onClose: () => void) => {
  const orgId = useOrgId();
  const mode = useV4Mode();
  const integrations = useV4Adapter("integrations");
  const createTeams = integrations.useCreateMicrosoftTeamsIntegration();
  const clientId = integrations.useMicrosoftTeamsClientId();
  const isTeams = platform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS;
  const connect = async ({ slug, description, tenantId }: Draft) => {
    if (!isTeams) {
      const url = await integrations.fetchSlackInstallUrl({ slug, description });
      if (url) {
        window.location.assign(url);
        return;
      }
      saved(`Slack integration ${slug} connected`);
      onClose();
      return;
    }
    if (mode === "demo") {
      await createTeams.mutateAsync({
        code: "demo-not-a-real-code",
        tenantId,
        slug,
        description,
        redirectUri: window.location.href,
        orgId
      });
      saved(`Microsoft Teams integration ${slug} connected`);
      onClose();
      return;
    }
    if (clientId.data?.clientId)
      redirectToMicrosoft({ clientId: clientId.data.clientId, tenantId, slug, description });
  };
  return { connect, teamsUnconfigured: isTeams && !clientId.isPending && !clientId.data?.clientId };
};

const blockedReason = ({
  isAdd,
  canEdit,
  dirty,
  teamsUnconfigured
}: {
  isAdd: boolean;
  canEdit: boolean;
  dirty: boolean;
  teamsUnconfigured: boolean;
}) => {
  if (!isAdd && !canEdit) return RESTRICTED;
  if (!isAdd && !dirty) return "No changes to save";
  if (teamsUnconfigured) return "Microsoft Teams isn't configured on this instance";
  return undefined;
};

const WorkflowForm = ({
  state,
  initial,
  connected,
  canEdit,
  onClose
}: {
  state: WorkflowSheetState;
  initial: Draft;
  connected?: readonly [string, string];
  canEdit: boolean;
  onClose: () => void;
}) => {
  const orgId = useOrgId();
  const integrations = useV4Adapter("integrations");
  const updateSlack = integrations.useUpdateSlackIntegration();
  const updateTeams = integrations.useUpdateMicrosoftTeamsIntegration();
  const isTeams = state.platform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS;
  const isAdd = state.mode === "add";
  const formId = useId();
  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting }
  } = useForm<Draft>({
    resolver: zodResolver(draftSchema(isTeams && isAdd)),
    defaultValues: initial
  });
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty,
    onDiscard: onClose
  });
  const name = PLATFORM_NAMES[state.platform];
  const { connect, teamsUnconfigured: unconfigured } = useConnect(state.platform, onClose);
  const teamsUnconfigured = isAdd && unconfigured;

  const submit = handleSubmit(async (draft) => {
    const slug = draft.slug.trim();
    const { description } = draft;
    try {
      if (state.mode === "add") {
        await connect({ slug, description, tenantId: draft.tenantId.trim() });
        return;
      }
      const update = isTeams ? updateTeams : updateSlack;
      await update.mutateAsync({ id: state.id, orgId, slug, description });
      saved(`${name} integration ${slug} updated`);
      onClose();
    } catch (error) {
      failed(isAdd ? `Failed to connect ${name}` : `Failed to update ${name} integration`, error);
    }
  });

  const blocked = blockedReason({ isAdd, canEdit, dirty: isDirty, teamsUnconfigured });

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && requestDiscard()}>
        <SheetContent pending={isSubmitting}>
          <SheetHeader>
            <Inline gap={8} align="center">
              <SheetTitle>{isAdd ? `Connect ${name}` : `Edit ${name} integration`}</SheetTitle>
              {isTeams && isAdd && (
                <DocumentationLink href={TEAMS_DOCS} subject="Microsoft Teams integration" />
              )}
            </Inline>
            {isTeams && isAdd && (
              <SheetDescription>
                Install the Infisical bot in your Microsoft Teams tenant before you connect it.
              </SheetDescription>
            )}
          </SheetHeader>
          <SheetBody>
            <form id={formId} noValidate autoComplete="off" onSubmit={submit}>
              <Stack gap={16}>
                {teamsUnconfigured && (
                  <Alert tone="warn" title="Microsoft Teams isn't configured">
                    The Microsoft Teams client ID isn&apos;t set on this instance. Ask your instance
                    admin to configure it.
                  </Alert>
                )}
                <Controller
                  control={control}
                  name="slug"
                  render={({ field, fieldState: { error } }) => (
                    <Field label="Alias" error={error?.message}>
                      <Input {...field} invalid={Boolean(error)} autoComplete="off" />
                    </Field>
                  )}
                />
                {isTeams && isAdd && (
                  <Controller
                    control={control}
                    name="tenantId"
                    render={({ field, fieldState: { error } }) => (
                      <Field label="Tenant ID" error={error?.message}>
                        <Input {...field} mono invalid={Boolean(error)} autoComplete="off" />
                      </Field>
                    )}
                  />
                )}
                <Controller
                  control={control}
                  name="description"
                  render={({ field }) => (
                    <Field label="Description" optional>
                      <Textarea {...field} rows={2} />
                    </Field>
                  )}
                />
                {connected && <DataList variant="props" items={[connected]} />}
              </Stack>
            </form>
          </SheetBody>
          <SheetFooter>
            <Button
              variant="primary"
              type="submit"
              form={formId}
              loading={isSubmitting}
              disabledReason={blocked}
            >
              {isAdd ? `Connect ${name}` : "Save changes"}
            </Button>
            <Button variant="outline" onClick={requestDiscard} disabled={isSubmitting}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description={
          isAdd
            ? `This ${name} integration won't be connected.`
            : `Your changes to this ${name} integration will be lost.`
        }
      />
    </>
  );
};

const EditLoader = ({
  state,
  canEdit,
  onClose
}: {
  state: Extract<WorkflowSheetState, { mode: "edit" }>;
  canEdit: boolean;
  onClose: () => void;
}) => {
  const integrations = useV4Adapter("integrations");
  const isTeams = state.platform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS;
  const slack = integrations.useSlackIntegration(isTeams ? undefined : state.id);
  const teams = integrations.useMicrosoftTeamsIntegration(isTeams ? state.id : undefined);
  const query = isTeams ? teams : slack;
  if (!query.data)
    return (
      <Sheet open onOpenChange={(next) => !next && onClose()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit {PLATFORM_NAMES[state.platform]} integration</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {query.error ? (
              <Alert tone="bad" title="Couldn't load this integration" />
            ) : (
              <FormSkeleton label="Loading integration" fields={3} />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    );
  const connected =
    isTeams && teams.data
      ? (["Connected tenant", teams.data.tenantId] as const)
      : (["Connected workspace", slack.data?.teamName ?? ""] as const);
  return (
    <WorkflowForm
      state={state}
      initial={{ slug: query.data.slug, description: query.data.description ?? "", tenantId: "" }}
      connected={connected}
      canEdit={canEdit}
      onClose={onClose}
    />
  );
};

export const WorkflowSheet = ({
  state,
  canEdit,
  onClose
}: {
  state?: WorkflowSheetState;
  canEdit: boolean;
  onClose: () => void;
}) => {
  if (!state) return null;
  if (state.mode === "edit")
    return <EditLoader key={state.id} state={state} canEdit={canEdit} onClose={onClose} />;
  return (
    <WorkflowForm
      key={state.platform}
      state={state}
      initial={{ slug: "", description: "", tenantId: "" }}
      canEdit={canEdit}
      onClose={onClose}
    />
  );
};
