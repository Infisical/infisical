import { useState } from "react";
import { Link } from "@tanstack/react-router";
import axios from "axios";
import { BotIcon, TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel
} from "@app/components/v3";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { useDebounce } from "@app/hooks";
import {
  useAddAgentVaultAccessBundleMembers,
  useIsAgentVaultAccessBundleMember,
  useListAgentVaultMembers
} from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultAccessBundleListItem } from "@app/hooks/api/agentVault/types";
import { useGetIdentityUniversalAuth } from "@app/hooks/api/identities";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { CreateProjectIdentityForm } from "@app/pages/project/AccessControlPage/components/IdentityTab/components/CreateProjectIdentity/CreateProjectIdentityForm";

// The role travels with the pick, because the search results it came from change as the user types.
export type TSnippetIdentity = { id: string; name: string; role?: string };

type TSnippetClientId = {
  identity: TSnippetIdentity | null;
  clientId: string | null;
  hasNoUniversalAuth: boolean;
  hasLoadError: boolean;
};

// The endpoint answers 404 when the identity has no Universal Auth configuration, and 400 when it
// has one but Universal Auth isn't among its auth methods; both messages name Universal Auth. Any
// other failure, including a 404 or 400 for another reason, says nothing about the identity's auth,
// so it gets the usual retry and isn't reported as missing Universal Auth.
const isNoUniversalAuthError = (error: unknown) =>
  axios.isAxiosError<{ message?: string }>(error) &&
  (error.response?.status === 404 || error.response?.status === 400) &&
  /universal auth/i.test(error.response?.data?.message ?? "");

// Holds the last loaded result while the next identity's loads, so switching identities doesn't
// blank the snippet and the notices before filling them back in.
export const useSnippetClientId = (identity: TSnippetIdentity | null): TSnippetClientId => {
  const { data, error, isPending } = useGetIdentityUniversalAuth(identity?.id ?? "", {
    retry: (failureCount, retryError) => !isNoUniversalAuthError(retryError) && failureCount < 1
  });
  const isLoading = Boolean(identity) && isPending;
  const hasNoUniversalAuth = Boolean(identity) && isNoUniversalAuthError(error);
  const latest: TSnippetClientId = {
    identity,
    clientId: identity && data?.identityId === identity.id ? data.clientId : null,
    hasNoUniversalAuth,
    hasLoadError: Boolean(identity && error) && !hasNoUniversalAuth
  };

  const [settled, setSettled] = useState(latest);
  const isSettledStale =
    settled.identity?.id !== latest.identity?.id ||
    settled.clientId !== latest.clientId ||
    settled.hasNoUniversalAuth !== latest.hasNoUniversalAuth ||
    settled.hasLoadError !== latest.hasLoadError;
  if (!isLoading && isSettledStale) setSettled(latest);

  return isLoading ? settled : latest;
};

type Props = {
  identity: TSnippetIdentity | null;
  onIdentityChange: (identity: TSnippetIdentity | null) => void;
  accessBundle: TAgentVaultAccessBundleListItem | null;
  // From useSnippetClientId in the dialog, which also needs the client ID for its snippets.
  snippet: TSnippetClientId;
};

export const SessionMachineIdentityField = ({
  identity,
  onIdentityChange,
  accessBundle,
  snippet
}: Props) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const canCreateIdentity = permission.can(
    ProjectPermissionIdentityActions.Create,
    ProjectPermissionSub.Identity
  );

  const [search, setSearch] = useState("");
  const [isCreatingIdentity, setIsCreatingIdentity] = useState(false);
  const [debouncedSearch] = useDebounce(search);
  const { data: identities, isFetching } = useListAgentVaultMembers(projectId, {
    actorType: AgentVaultMemberType.MachineIdentity,
    search: debouncedSearch.trim() || undefined,
    limit: 50
  });
  const isAdminIdentity = identity?.role === ProjectMembershipRole.Admin;

  const { data: isGranted, isPlaceholderData: isGrantCheckStale } =
    useIsAgentVaultAccessBundleMember(
      projectId,
      accessBundle?.id ?? "",
      identity
        ? { type: AgentVaultMemberType.MachineIdentity, id: identity.id, name: identity.name }
        : null
    );
  const latestGrant = {
    identity,
    accessBundle,
    needsGrant:
      Boolean(identity && accessBundle) && isGranted !== undefined && !isAdminIdentity && !isGranted
  };
  // The check keeps the previous identity and bundle's answer until the new one loads, which would
  // flash the warning for a pair that has the grant. Until then the warning keeps naming the pair
  // it was answered for.
  const [settledGrant, setSettledGrant] = useState(latestGrant);
  if (
    !isGrantCheckStale &&
    (settledGrant.identity?.id !== latestGrant.identity?.id ||
      settledGrant.accessBundle?.id !== latestGrant.accessBundle?.id ||
      settledGrant.needsGrant !== latestGrant.needsGrant)
  )
    setSettledGrant(latestGrant);
  const grant = isGrantCheckStale ? settledGrant : latestGrant;
  const isGrantForCurrentPick =
    grant.identity?.id === identity?.id && grant.accessBundle?.id === accessBundle?.id;

  const grantAccess = useAddAgentVaultAccessBundleMembers(projectId);

  const onGrant = async () => {
    if (!identity || !accessBundle) return;
    try {
      await grantAccess.mutateAsync({
        accessBundleId: accessBundle.id,
        machineIdentityIds: [identity.id]
      });
      createNotification({
        text: `Granted ${accessBundle.name} to ${identity.name}`,
        type: "success"
      });
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const renderIdentityPageLink = (target: TSnippetIdentity | null, text?: string) =>
    target && (
      <Link
        to="/organizations/$orgId/projects/agent-vault/$projectId/identities/$identityId"
        params={{ orgId: currentOrg.id, projectId, identityId: target.id }}
        // A new tab, so the dialog keeps its picks while the user looks something up.
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {text ?? `${target.name}'s page`}
      </Link>
    );

  const hasNotice = snippet.hasNoUniversalAuth || grant.needsGrant;

  // A fragment, because both parts sit in the dialog's grid: the picker in its column and the
  // notices on a row of their own under both columns.
  return (
    <>
      <Field>
        <FieldLabel htmlFor="agent-vault-session-snippet-identity">Machine Identity</FieldLabel>
        <FieldContent>
          <Combobox
            id="agent-vault-session-snippet-identity"
            options={identities?.members ?? []}
            value={identity}
            shouldFilter={false}
            isLoading={isFetching}
            includeMissingSelectedOptions
            onInputValueChange={setSearch}
            getOptionValue={(option) => option.id}
            getOptionLabel={(option) => option.name}
            placeholder="Pick a machine identity"
            searchPlaceholder="Search machine identities..."
            emptyMessage="No machine identity matches."
            modal
            renderOption={(option) => (
              <span className="flex min-w-0 items-center gap-2">
                <BotIcon className="size-4 shrink-0 text-muted" />
                <span className="truncate">{option.name}</span>
              </span>
            )}
            renderValue={(option) => (
              <span className="flex min-w-0 items-center gap-2">
                <BotIcon className="size-4 shrink-0 text-muted" />
                <span className="truncate">{option.name}</span>
              </span>
            )}
            onValueChange={(option) =>
              onIdentityChange(
                option ? { id: option.id, name: option.name, role: option.role } : null
              )
            }
            onClear={() => onIdentityChange(null)}
            creation={
              canCreateIdentity
                ? {
                    mode: "sheet",
                    title: "Add Machine Identity to Agent Vault",
                    description: "Create a new machine identity or assign an existing one",
                    emptyLabel: "Create New Machine Identity",
                    formatLabel: () => "Create New Machine Identity",
                    isPending: isCreatingIdentity,
                    renderForm: ({ cancel, complete }) => (
                      <CreateProjectIdentityForm
                        projectId={projectId}
                        projectType={ProjectType.AgentVault}
                        productLabel="Agent Vault"
                        canGrantPrivileges={false}
                        onClose={cancel}
                        onComplete={(created) => {
                          onIdentityChange(created);
                          complete();
                        }}
                        onPendingChange={setIsCreatingIdentity}
                      />
                    )
                  }
                : undefined
            }
          />
          {/* Holds two lines before and after the pick, so the snippets below don't jump when it fills in. */}
          <FieldDescription className="min-h-8">
            {snippet.hasNoUniversalAuth ? null : (
              <>
                {snippet.identity && snippet.hasLoadError && (
                  <>
                    Couldn&apos;t load {snippet.identity.name}&apos;s client ID, so the snippets
                    below show <span className="font-mono">&lt;client-id&gt;</span>. Find it on{" "}
                    {renderIdentityPageLink(snippet.identity)}.
                  </>
                )}
                {snippet.identity && !snippet.hasLoadError && (
                  <>
                    The snippets below have {snippet.identity.name}&apos;s client ID. Replace{" "}
                    <span className="font-mono">&lt;client-secret&gt;</span> with one of its{" "}
                    {renderIdentityPageLink(snippet.identity, "client secrets")}.
                  </>
                )}
                {!snippet.identity &&
                  "Your code creates sessions as a machine identity. Pick one to fill in its client ID below."}
              </>
            )}
          </FieldDescription>
        </FieldContent>
      </Field>

      {hasNotice && (
        <div className="flex flex-col gap-3 md:col-span-2">
          {snippet.hasNoUniversalAuth && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                <p>
                  {snippet.identity?.name} doesn&apos;t use Universal Auth, so it has no client ID.
                  Add Universal Auth on {renderIdentityPageLink(snippet.identity)}.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {grant.needsGrant && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>
                {grant.identity?.name} can&apos;t use {grant.accessBundle?.name}
              </AlertTitle>
              <AlertDescription>
                <p>Creating a session fails until the access bundle is granted to it.</p>
                <Button
                  variant="warning"
                  size="xs"
                  className="mt-2"
                  isPending={grantAccess.isPending}
                  // While the next pick's grants load, the warning still names the previous one.
                  isDisabled={!isGrantForCurrentPick}
                  onClick={onGrant}
                >
                  Grant Access
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </>
  );
};
