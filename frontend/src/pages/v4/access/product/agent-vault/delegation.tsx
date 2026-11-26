import { useState } from "react";
import { subject as caslSubject } from "@casl/ability";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline } from "@infisical/cipher/ui/layout";
import { UserCogIcon, UsersRoundIcon } from "lucide-react";

import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AgentVaultDelegationScope } from "@app/hooks/api/agentVault/enums";

import { useV4Adapter } from "../../../data/adapters";
import { useProjectPermission } from "../../permissions";
import { useProjectScope } from "../../project/scope";
import { formatDate } from "../../roles";
import { Muted } from "../../ui";
import {
  ALL_MEMBERS,
  DELEGATION_DOCS_URL,
  MissingAccessBundlesHint,
  SubjectName,
  delegationSubjects,
  subjectOnBehalfOf,
  type DelegationSubject
} from "./delegation-common";
import { ManageDelegationSheet } from "./delegation-sheet";

export const AgentVaultIdentityDelegationSection = ({
  machineIdentityId,
  machineIdentityName
}: {
  machineIdentityId: string;
  machineIdentityName: string;
}) => {
  const { projectId } = useProjectScope();
  const av = useV4Adapter("agentVault");
  const { permission } = useProjectPermission(projectId);
  const identitySubject = caslSubject(ProjectPermissionSub.Identity, {
    identityId: machineIdentityId
  });
  const canReadDelegation = permission.can(ProjectPermissionIdentityActions.Read, identitySubject);
  const canEditDelegation = permission.can(ProjectPermissionIdentityActions.Edit, identitySubject);
  const { data, isPending, error, isFetching, refetch } = av.useDelegation(
    projectId,
    machineIdentityId,
    canReadDelegation
  );
  const [managing, setManaging] = useState(false);

  if (!canReadDelegation) return null;

  const delegation = data ?? null;
  const loadFailed = Boolean(error) && data === undefined;
  const isAllMembers = delegation?.scope === AgentVaultDelegationScope.AllMembers;
  const rows: DelegationSubject[] = isAllMembers
    ? [
        {
          key: ALL_MEMBERS,
          type: ALL_MEMBERS,
          id: ALL_MEMBERS,
          name: "All project members",
          subtitle: "Every user in this project, including users added later",
          addedAt: delegation.updatedAt,
          missingAccessBundles: delegation.missingAccessBundles
        }
      ]
    : delegationSubjects(delegation);

  const columns: DataTableColumn<DelegationSubject>[] = [
    {
      id: "subject",
      header: "User or group",
      grow: true,
      render: (subject) => (
        <Inline gap={8}>
          {subject.key === ALL_MEMBERS && (
            <Icon icon={UsersRoundIcon} size="var(--cipher-size-icon-small)" />
          )}
          <SubjectName name={subject.name} subtitle={subject.subtitle} />
        </Inline>
      )
    },
    {
      id: "added",
      header: "Added",
      render: (subject) => <span>{formatDate(subject.addedAt)}</span>
    },
    {
      id: "excluded",
      header: "Excluded bundles",
      render: (subject) =>
        subject.missingAccessBundles.length ? (
          <MissingAccessBundlesHint
            bundles={subject.missingAccessBundles}
            machineIdentityName={machineIdentityName}
            onBehalfOf={
              subject.key === ALL_MEMBERS ? "project members" : subjectOnBehalfOf(subject)
            }
          />
        ) : (
          <Muted>-</Muted>
        )
    }
  ];

  let body = <EmptyState size="sm" icon="user" title="No users or groups yet" />;
  if (loadFailed)
    body = (
      <EmptyState
        size="sm"
        icon="alert"
        title="Couldn't load the delegation"
        description="Reload to see its users and groups before you add or remove any."
        actions={
          <Button variant="outline" size="sm" loading={isFetching} onClick={() => refetch()}>
            Reload
          </Button>
        }
      />
    );
  else if (rows.length || isPending)
    body = (
      <DataTable
        label="Delegation"
        rows={rows}
        columns={columns}
        getRowId={(subject) => subject.key}
        rowLabel={(subject) => subject.name}
        loading={isPending}
        loadingRows={3}
      />
    );

  return (
    <>
      <Card
        variant="framed"
        title="Delegation"
        badges={<DocumentationLink href={DELEGATION_DOCS_URL} subject="delegation" />}
        action={
          canEditDelegation &&
          !isPending &&
          !loadFailed && (
            <Button variant="outline" onClick={() => setManaging(true)}>
              <Icon icon={UserCogIcon} />
              Manage delegation
            </Button>
          )
        }
      >
        {body}
      </Card>
      <ManageDelegationSheet
        machineIdentity={
          managing ? { id: machineIdentityId, name: machineIdentityName } : undefined
        }
        onOpenChange={setManaging}
      />
    </>
  );
};
