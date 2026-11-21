import { useEffect, useState } from "react";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";
import {
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { useProjectPermission } from "../../access/permissions";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { CreatePkiSyncSheet } from "../components/pki-syncs/create-sync-sheet";
import {
  PKI_SYNC_DRAFT_STORAGE_KEY,
  pkiSyncDocs,
  PkiSyncScopeProvider
} from "../components/pki-syncs/shared";
import { PkiSyncsTable } from "../components/pki-syncs/syncs-table";

const routeId = v4Path("/organizations/$orgId/cert-manager/integrations/");
const listPath = v4Path("/organizations/$orgId/cert-manager/integrations");

type Creating = { destination?: PkiSync; initialData?: Partial<TPkiSyncForm> };

const readDraft = (connectionId: string, connectionName: string): Creating | undefined => {
  const stored = sessionStorage.getItem(PKI_SYNC_DRAFT_STORAGE_KEY);
  sessionStorage.removeItem(PKI_SYNC_DRAFT_STORAGE_KEY);
  if (!stored) return undefined;
  try {
    const draft = JSON.parse(stored) as Partial<TPkiSyncForm>;
    return {
      destination: draft.destination,
      initialData: {
        ...draft,
        connection: { ...draft.connection, id: connectionId, name: connectionName }
      } as Partial<TPkiSyncForm>
    };
  } catch {
    return undefined;
  }
};

const Syncs = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const navigate = useNavigate();
  const { addSync, connectionId, connectionName } = useSearch({ from: routeId });
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const canRead = permission.can(
    ProjectPermissionPkiSyncActions.Read,
    ProjectPermissionSub.PkiSyncs
  );
  const { data, isPending, error } = useV4Adapter("pkiSyncs").useSyncs(projectId, {
    enabled: canRead,
    refetchInterval: 30_000
  });
  const [creating, setCreating] = useState<Creating>();

  useEffect(() => {
    if (!addSync && !(connectionId && connectionName)) return;
    const next =
      connectionId && connectionName
        ? readDraft(connectionId, connectionName)
        : { destination: addSync };
    navigate({ to: listPath, params: { orgId }, search: {}, replace: true });
    if (next) setCreating(next);
  }, [addSync, connectionId, connectionName, navigate, orgId]);

  if (permissionPending) return <Loader label="Loading certificate syncs" />;
  if (!canRead) return <AccessRestricted requirement="Read certificate syncs" />;

  return (
    <PkiSyncScopeProvider
      value={{ orgId, projectId, returnTo: orgHref(orgId, "/cert-manager/integrations") }}
    >
      <PkiSyncsTable
        orgId={orgId}
        syncs={data ?? []}
        isPending={isPending}
        error={error}
        label="Certificate syncs"
      />
      <CreatePkiSyncSheet
        open={Boolean(creating)}
        onOpenChange={(open) => !open && setCreating(undefined)}
        destination={creating?.destination}
        initialData={creating?.initialData}
      />
    </PkiSyncScopeProvider>
  );
};

export const PkiSyncsPage = () => {
  const { orgId } = useParams({ from: routeId });
  const { projectId, isPending } = useCertManagerProjectId(orgId);

  return (
    <TooltipProvider>
      <PageTitle title="Certificate syncs" />
      <Stack gap={24}>
        <PageHeader
          title="Certificate syncs"
          description="Existing syncs created outside an application stay editable. Create new syncs inside an application."
          badges={<DocumentationLink href={pkiSyncDocs()} subject="Certificate syncs" />}
        />
        {isPending && <Loader size="page" label="Loading certificate syncs" />}
        {!isPending && !projectId && <CertManagerNotSetUp orgId={orgId} />}
        {!isPending && projectId && <Syncs orgId={orgId} projectId={projectId} />}
      </Stack>
    </TooltipProvider>
  );
};
