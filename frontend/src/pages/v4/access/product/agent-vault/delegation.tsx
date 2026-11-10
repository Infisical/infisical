import { useState } from "react";
import { UserCogIcon, UsersRoundIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
import { AgentVaultDelegationScope } from "@app/hooks/api/agentVault/enums";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { useV4Adapter } from "../../../data/adapters";
import { useProjectScope } from "../../project/scope";
import { formatDate } from "../../roles";
import { Muted } from "../../ui";
import {
  ALL_MEMBERS,
  type DelegationSubject,
  delegationSubjects,
  MissingAccessBundlesHint,
  SubjectName,
  subjectOnBehalfOf
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
  const permission = av.useProjectPermission({ projectId });
  const isAdmin = Boolean(
    permission.data?.memberships.some((membership) =>
      membership.roles.some((entry) => entry.role === ProjectMembershipRole.Admin)
    )
  );
  const { data, isPending, error } = av.useDelegation(projectId, machineIdentityId, isAdmin);
  const [managing, setManaging] = useState(false);

  if (!isAdmin) return null;

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
          {subject.key === ALL_MEMBERS && <Icon icon={UsersRoundIcon} size={14} />}
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
  if (loadFailed) body = <EmptyState size="sm" icon="alert" title="Couldn't load the delegation" />;
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
        title={
          <Inline gap={8}>
            Delegation
            <DocumentationLinkBadge href={AgentVaultDocsUrls.sessionsOnBehalfOfUsers} />
          </Inline>
        }
        flush={Boolean(rows.length) && !loadFailed}
        action={
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
