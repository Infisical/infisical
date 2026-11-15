import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import { CodeSigningUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { PageTitle } from "@app/components/PageTitle";
import {
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TSigner } from "@app/hooks/api/signers/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { useProjectPermission } from "../../access/permissions";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";
import { orgHref, useGo, v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { CreateSignerSheet } from "./create-signer-sheet";
import {
  CODE_SIGNING_DOCS,
  dateOnly,
  dateTime,
  SIGNERS_PAGE_SIZE,
  SignerStatusBadge
} from "./signer-shared";

const routeId = v4Path("/organizations/$orgId/cert-manager/code-signing/");

const SignersList = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const go = useGo();
  const adapter = useV4Adapter("codeSigning");
  const { permission } = useProjectPermission(projectId);
  const { data: subscription } = adapter.useSubscription(orgId);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(SIGNERS_PAGE_SIZE);
  const [creating, setCreating] = useState(false);
  const { data, isPending, error } = adapter.useSigners({
    projectId,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    search: debouncedSearch || undefined
  });
  const rows = data?.signers ?? [];
  const total = data?.totalCount ?? 0;
  const createReason = permission.can(
    ProjectPermissionCodeSigningActions.Create,
    ProjectPermissionSub.CodeSigners
  )
    ? undefined
    : RESTRICTED;

  const startCreate = () => {
    if (!subscription?.pkiCodeSigning) {
      openUpgradeGate({ intent: CodeSigningUpgradeIntent, paywallKey: "cert-manager.signers" });
      return;
    }
    setCreating(true);
  };

  const href = (signer: TSigner) => orgHref(orgId, `/cert-manager/code-signing/${signer.id}`);

  const columns: DataTableColumn<TSigner>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      minWidth: 200,
      text: (signer) => signer.name,
      secondary: (signer) => signer.description || undefined,
      render: (signer) => (
        <RowLink link={go.link(href(signer))} title={signer.name}>
          {signer.name}
        </RowLink>
      )
    },
    {
      id: "status",
      header: "Status",
      width: 120,
      render: (signer) => <SignerStatusBadge signer={signer} />
    },
    {
      id: "commonName",
      header: "Certificate CN",
      width: 220,
      render: (signer) => signer.certificateCommonName ?? "None",
      text: (signer) => signer.certificateCommonName ?? "None"
    },
    {
      id: "expiry",
      header: "Certificate expiry",
      width: 160,
      render: (signer) =>
        signer.certificateNotAfter ? dateOnly(signer.certificateNotAfter) : "None",
      text: (signer) => (signer.certificateNotAfter ? dateOnly(signer.certificateNotAfter) : "None")
    },
    {
      id: "lastSigned",
      header: "Last signed",
      width: 170,
      render: (signer) => (signer.lastSignedAt ? dateTime(signer.lastSignedAt) : "Never"),
      text: (signer) => (signer.lastSignedAt ? dateTime(signer.lastSignedAt) : "Never")
    }
  ];

  let empty = (
    <EmptyState
      size="sm"
      icon="pencil"
      title="No signers yet"
      description="Create a signer to start signing artifacts."
      actions={
        <Button variant="outline" icon="plus" disabledReason={createReason} onClick={startCreate}>
          Create signer
        </Button>
      }
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load signers"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (debouncedSearch)
    empty = (
      <EmptyState
        size="sm"
        icon="search"
        title="No signers match this search"
        actions={
          <Button variant="link" onClick={() => setSearch("")}>
            Clear search
          </Button>
        }
      />
    );

  return (
    <Stack gap={16}>
      <Inline gap={12} align="center" wrap={false}>
        <Input
          icon="search"
          aria-label="Search signers"
          placeholder="Search signers by name"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Button variant="accent" icon="plus" disabledReason={createReason} onClick={startCreate}>
          Create signer
        </Button>
      </Inline>
      <DataTable
        label="Signers"
        rows={rows}
        columns={columns}
        loading={isPending && !error}
        getRowId={(signer) => signer.id}
        rowLabel={(signer) => signer.name}
        empty={empty}
        persistentStatus={total ? `${total} ${total === 1 ? "signer" : "signers"}` : undefined}
        pagination={
          total > pageSize ? (
            <Pagination
              label="Signer pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={total}
              pageSize={pageSize}
              pageSizeOptions={[25, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      <CreateSignerSheet
        open={creating}
        orgId={orgId}
        projectId={projectId}
        onClose={() => setCreating(false)}
      />
      {upgradeGate}
    </Stack>
  );
};

const Page = () => {
  const { orgId } = useParams({ from: routeId });
  const { projectId, isPending } = useCertManagerProjectId(orgId);
  if (isPending) return <Loader size="page" label="Loading signers" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  return (
    <Stack gap={24}>
      <PageHeader
        title="Signers"
        badges={<DocumentationLink href={CODE_SIGNING_DOCS.signers} subject="Signers" />}
      />
      <SignersList orgId={orgId} projectId={projectId} />
    </Stack>
  );
};

export const CodeSigningPage = () => (
  <TooltipProvider>
    <PageTitle title="Code Signing" />
    <Page />
  </TooltipProvider>
);
