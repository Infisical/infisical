import { useState } from "react";
import { subject } from "@casl/ability";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TCertificatePolicy } from "@app/hooks/api/certificatePolicies/types";

import { useProjectPermission } from "../../access/permissions";
import { formatDate } from "../../access/roles";
import { saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { DeletePolicyDialog } from "../components/delete-dialogs";
import { POLICY_DOCS } from "../components/policy-model";
import { CertificatePolicySheet } from "../components/policy-sheet";

const routeId = v4Path("/organizations/$orgId/cert-manager/certificate-policies/");

const PolicyList = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const go = useGo();
  const { permission } = useProjectPermission(projectId);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TCertificatePolicy>();
  const [deleting, setDeleting] = useState<TCertificatePolicy>();
  const { data, isPending, error } = useV4Adapter("pkiPolicies").usePolicies({
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  const rows = data?.certificatePolicies ?? [];
  const total = data?.totalCount ?? 0;
  const canCreate = permission.can(
    ProjectPermissionCertificatePolicyActions.Create,
    ProjectPermissionSub.CertificatePolicies
  );
  const blocked = (
    action: ProjectPermissionCertificatePolicyActions,
    policy: TCertificatePolicy
  ) =>
    permission.can(action, subject(ProjectPermissionSub.CertificatePolicies, { name: policy.name }))
      ? undefined
      : RESTRICTED;
  const detailHref = (policy: TCertificatePolicy) =>
    orgHref(orgId, `/cert-manager/certificate-policies/${policy.id}`);

  const columns: DataTableColumn<TCertificatePolicy>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (policy) => policy.name,
      secondary: (policy) => policy.description || undefined,
      render: (policy) => (
        <RowLink link={go.link(detailHref(policy))} title={policy.name}>
          {policy.name}
        </RowLink>
      )
    },
    {
      id: "created",
      header: "Created",
      width: 140,
      render: (policy) => formatDate(policy.createdAt)
    }
  ];

  const empty = error ? (
    <EmptyState
      size="sm"
      icon="alert-c"
      title="Couldn't load certificate policies"
      description={error instanceof Error ? error.message : undefined}
    />
  ) : (
    <EmptyState
      size="sm"
      icon="shield"
      title="No certificate policies yet"
      description="Create a policy to set the rules your certificates must follow when issued."
      actions={
        canCreate ? (
          <Button variant="outline" icon="plus" onClick={() => setCreating(true)}>
            Create policy
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <Stack gap={24}>
      <PageHeader
        title="Certificate policies"
        badges={<DocumentationLink href={POLICY_DOCS} subject="Certificate policies" />}
        actions={
          <Button
            variant="accent"
            icon="plus"
            disabledReason={canCreate ? undefined : RESTRICTED}
            onClick={() => setCreating(true)}
          >
            Create policy
          </Button>
        }
      />
      <DataTable
        label="Certificate policies"
        rows={rows}
        columns={columns}
        loading={isPending && !error}
        getRowId={(policy) => policy.id}
        rowLabel={(policy) => policy.name}
        empty={empty}
        persistentStatus={total ? `${total} ${total === 1 ? "policy" : "policies"}` : undefined}
        rowActions={{
          renderMenu: (policy) => {
            const editBlocked = blocked(ProjectPermissionCertificatePolicyActions.Edit, policy);
            const deleteBlocked = blocked(ProjectPermissionCertificatePolicyActions.Delete, policy);
            return (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(policy.id).catch(() => undefined);
                    saved("Policy ID copied");
                  }}
                >
                  <Icon name="copy" />
                  Copy policy ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={Boolean(editBlocked)}
                  description={editBlocked}
                  onSelect={() => setEditing(policy)}
                >
                  <Icon name="pencil" />
                  Edit policy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={Boolean(deleteBlocked)}
                  description={deleteBlocked}
                  onSelect={() => setDeleting(policy)}
                >
                  <Icon name="trash" />
                  Delete policy
                </DropdownMenuItem>
              </>
            );
          }
        }}
        pagination={
          total > pageSize ? (
            <Pagination
              label="Certificate policy pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={total}
              pageSize={pageSize}
              pageSizeOptions={[20, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      {(creating || editing) && (
        <CertificatePolicySheet
          projectId={projectId}
          policy={editing}
          onClose={() => {
            setCreating(false);
            setEditing(undefined);
          }}
        />
      )}
      <DeletePolicyDialog policy={deleting} onClose={() => setDeleting(undefined)} />
    </Stack>
  );
};

const Page = () => {
  const { orgId } = useParams({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const { permission, isPending: isCheckingAccess } = useProjectPermission(projectId ?? "");
  if (isResolving || (projectId && isCheckingAccess))
    return <Loader size="page" label="Loading certificate policies" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  if (
    !permission.can(
      ProjectPermissionCertificatePolicyActions.Read,
      ProjectPermissionSub.CertificatePolicies
    )
  )
    return <AccessRestricted requirement="Read certificate policies" />;
  return <PolicyList orgId={orgId} projectId={projectId} />;
};

export const CertificatePoliciesPage = () => (
  <>
    <PageTitle title="Certificate Policies" />
    <Page />
  </>
);
