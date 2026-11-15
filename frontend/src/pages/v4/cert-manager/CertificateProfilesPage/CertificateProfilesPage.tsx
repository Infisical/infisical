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
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { IssuerType, type TCertificateProfile } from "@app/hooks/api/certificateProfiles/types";

import { useProjectPermission } from "../../access/permissions";
import { saved } from "../../access/toast";
import { AccessRestricted, Muted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { DeleteProfileDialog } from "../components/delete-dialogs";
import { PROFILE_DOCS } from "../components/policy-model";
import { CertificateProfileSheet } from "../components/profile-sheet";

const routeId = v4Path("/organizations/$orgId/cert-manager/certificate-profiles/");

type Editing = { profile?: TCertificateProfile; mode: "create" | "edit" | "clone" };

const ProfileList = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const go = useGo();
  const { permission } = useProjectPermission(projectId);
  const pki = useV4Adapter("pkiPolicies");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<Editing>();
  const [deleting, setDeleting] = useState<TCertificateProfile>();
  const { data, isPending, error } = pki.useProfiles({
    limit: pageSize,
    offset: (page - 1) * pageSize,
    includeConfigs: true
  });
  const { data: policyData } = pki.usePolicies({ limit: 100, offset: 0 });
  const { data: authorities = [] } = useV4Adapter("certificates").useCertificateAuthorities();
  const rows = data?.certificateProfiles ?? [];
  const total = data?.totalCount ?? 0;
  const canCreate = permission.can(
    ProjectPermissionCertificateProfileActions.Create,
    ProjectPermissionSub.CertificateProfiles
  );
  const blocked = (
    action: ProjectPermissionCertificateProfileActions,
    profile: TCertificateProfile
  ) =>
    permission.can(
      action,
      subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })
    )
      ? undefined
      : RESTRICTED;
  const issuerName = (profile: TCertificateProfile) => {
    if (profile.issuerType === IssuerType.SELF_SIGNED) return "Self-signed";
    return (
      authorities.find((ca) => ca.id === profile.caId)?.name ??
      profile.certificateAuthority?.name ??
      profile.caId ??
      ""
    );
  };
  const policyName = (profile: TCertificateProfile) =>
    policyData?.certificatePolicies.find((policy) => policy.id === profile.certificatePolicyId)
      ?.name ?? profile.certificatePolicyId;

  const columns: DataTableColumn<TCertificateProfile>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (profile) => profile.slug,
      secondary: (profile) => profile.description || undefined,
      render: (profile) => (
        <RowLink
          link={go.link(orgHref(orgId, `/cert-manager/certificate-profiles/${profile.id}`))}
          title={profile.slug}
        >
          {profile.slug}
        </RowLink>
      )
    },
    {
      id: "issuer",
      header: "Issuing CA",
      width: 240,
      text: issuerName,
      render: (profile) =>
        profile.issuerType === IssuerType.SELF_SIGNED ? (
          <Muted>Self-signed</Muted>
        ) : (
          issuerName(profile)
        )
    },
    {
      id: "policy",
      header: "Certificate policy",
      width: 240,
      text: policyName,
      render: policyName
    }
  ];

  const empty = error ? (
    <EmptyState
      size="sm"
      icon="alert-c"
      title="Couldn't load certificate profiles"
      description={error instanceof Error ? error.message : undefined}
    />
  ) : (
    <EmptyState
      size="sm"
      icon="file-key"
      title="No certificate profiles yet"
      description="Create a profile to start issuing certificates for an application."
      actions={
        canCreate ? (
          <Button variant="outline" icon="plus" onClick={() => setEditing({ mode: "create" })}>
            Create profile
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <Stack gap={24}>
      <PageHeader
        title="Certificate profiles"
        badges={<DocumentationLink href={PROFILE_DOCS} subject="Certificate profiles" />}
        actions={
          <Button
            variant="accent"
            icon="plus"
            disabledReason={canCreate ? undefined : RESTRICTED}
            onClick={() => setEditing({ mode: "create" })}
          >
            Create profile
          </Button>
        }
      />
      <DataTable
        label="Certificate profiles"
        rows={rows}
        columns={columns}
        loading={isPending && !error}
        getRowId={(profile) => profile.id}
        rowLabel={(profile) => profile.slug}
        empty={empty}
        persistentStatus={total ? `${total} ${total === 1 ? "profile" : "profiles"}` : undefined}
        rowActions={{
          renderMenu: (profile) => {
            const editBlocked = blocked(ProjectPermissionCertificateProfileActions.Edit, profile);
            const deleteBlocked = blocked(
              ProjectPermissionCertificateProfileActions.Delete,
              profile
            );
            return (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(profile.id).catch(() => undefined);
                    saved("Profile ID copied");
                  }}
                >
                  <Icon name="copy" />
                  Copy profile ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={Boolean(editBlocked)}
                  description={editBlocked}
                  onSelect={() => setEditing({ profile, mode: "edit" })}
                >
                  <Icon name="pencil" />
                  Edit profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canCreate}
                  description={canCreate ? undefined : RESTRICTED}
                  onSelect={() => setEditing({ profile, mode: "clone" })}
                >
                  <Icon name="plus" />
                  Clone profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={Boolean(deleteBlocked)}
                  description={deleteBlocked}
                  onSelect={() => setDeleting(profile)}
                >
                  <Icon name="trash" />
                  Delete profile
                </DropdownMenuItem>
              </>
            );
          }
        }}
        pagination={
          total > pageSize ? (
            <Pagination
              label="Certificate profile pages"
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
      {editing && (
        <CertificateProfileSheet
          projectId={projectId}
          profile={editing.profile}
          mode={editing.mode}
          onClose={() => setEditing(undefined)}
        />
      )}
      <DeleteProfileDialog profile={deleting} onClose={() => setDeleting(undefined)} />
    </Stack>
  );
};

const Page = () => {
  const { orgId } = useParams({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const { permission, isPending: isCheckingAccess } = useProjectPermission(projectId ?? "");
  if (isResolving || (projectId && isCheckingAccess))
    return <Loader size="page" label="Loading certificate profiles" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  if (
    !permission.can(
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionSub.CertificateProfiles
    )
  )
    return <AccessRestricted requirement="Read certificate profiles" />;
  return <ProfileList orgId={orgId} projectId={projectId} />;
};

export const CertificateProfilesPage = () => (
  <>
    <PageTitle title="Certificate Profiles" />
    <Page />
  </>
);
