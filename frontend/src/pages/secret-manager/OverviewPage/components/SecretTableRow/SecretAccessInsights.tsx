import { Link } from "@tanstack/react-router";
import { HardDriveIcon, UserIcon, UsersIcon } from "lucide-react";

import {
  Badge,
  EmptyMedia,
  Item,
  ItemContent,
  ItemFooter,
  ItemGroup,
  ItemTitle,
  Skeleton,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { useGetSecretAccessList } from "@app/hooks/api/secrets/queries";
import { SecretAccessListEntry } from "@app/hooks/api/secrets/types";
import { camelCaseToSpaces } from "@app/lib/fn/string";

type Props = {
  secretKey: string;
  environment: string;
  secretPath: string;
};

function AccessCard({
  entry,

  linkTo,
  linkParams
}: {
  entry: SecretAccessListEntry;
  linkTo?: string;
  linkParams?: Record<string, string>;
}) {
  const cardContent = (
    <>
      <ItemContent className="overflow-hidden">
        <ItemTitle className="w-full overflow-hidden">
          <span className="truncate">{entry.name}</span>
        </ItemTitle>
      </ItemContent>
      <ItemFooter>
        <div className="flex flex-wrap gap-2">
          {entry.allowedActions.map((action) => (
            <Badge key={action} className="capitalize" variant="neutral">
              {camelCaseToSpaces(action)}
            </Badge>
          ))}
        </div>
      </ItemFooter>
    </>
  );

  if (linkTo && linkParams) {
    return (
      <Item variant="outline" asChild>
        <Link to={linkTo as "."} params={linkParams}>
          {cardContent}
        </Link>
      </Item>
    );
  }

  return <Item variant="outline">{cardContent}</Item>;
}

function SectionHeader({
  icon,
  title,
  count
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <span className="text-sm font-medium tracking-wide text-label">{title}</span>
      <Badge variant="neutral" className="text-xs">
        {count}
      </Badge>
    </div>
  );
}

export function SecretAccessInsights({ secretKey, environment, secretPath }: Props) {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { data: secretAccessList, isLoading } = useGetSecretAccessList({
    projectId: currentProject.id,
    environment,
    secretPath,
    secretKey
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4">
        {Array.from({ length: 3 }).map((_, sectionIndex) => (
          <div key={`section-skeleton-${String(sectionIndex)}`}>
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-5 w-6 rounded" />
            </div>
            <div className="flex flex-col gap-4">
              {Array.from({ length: 2 }).map((__, itemIndex) => (
                <Skeleton
                  key={`section-skeleton-${String(itemIndex)}`}
                  className="h-[69.25px] rounded-md"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const hasUsers = secretAccessList && secretAccessList.users.length > 0;
  const hasIdentities = secretAccessList && secretAccessList.identities.length > 0;
  const hasGroups = secretAccessList && secretAccessList.groups.length > 0;
  const hasAnyAccess = hasUsers || hasIdentities || hasGroups;

  if (!hasAnyAccess) {
    return (
      <UnstableEmpty className="bg-transparent">
        <UnstableEmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <UnstableEmptyTitle>No Access Found</UnstableEmptyTitle>
          <UnstableEmptyDescription>
            No users, groups, or identities have direct access to this secret.
          </UnstableEmptyDescription>
        </UnstableEmptyHeader>
      </UnstableEmpty>
    );
  }

  return (
    <div className="flex thin-scrollbar flex-col gap-6 overflow-y-auto p-4">
      {hasUsers && (
        <div>
          <SectionHeader
            icon={<UserIcon className="size-4 text-accent" />}
            title="Users"
            count={secretAccessList.users.length}
          />
          <ItemGroup>
            {secretAccessList.users.map((user) => (
              <AccessCard
                key={user.id}
                entry={user}
                linkTo={`${getProjectBaseURL(currentProject.type)}/members/$membershipId`}
                linkParams={{
                  orgId: currentOrg.id,
                  projectId: currentProject.id,
                  membershipId: user.membershipId
                }}
              />
            ))}
          </ItemGroup>
        </div>
      )}

      {hasIdentities && (
        <div>
          <SectionHeader
            icon={<HardDriveIcon className="size-4 text-accent" />}
            title="Machine Identities"
            count={secretAccessList.identities.length}
          />
          <ItemGroup>
            {secretAccessList.identities.map((identity) => (
              <AccessCard
                key={identity.id}
                entry={identity}
                linkTo={`${getProjectBaseURL(currentProject.type)}/identities/$identityId`}
                linkParams={{
                  orgId: currentOrg.id,
                  projectId: currentProject.id,
                  identityId: identity.id
                }}
              />
            ))}
          </ItemGroup>
        </div>
      )}

      {hasGroups && (
        <div>
          <SectionHeader
            icon={<UsersIcon className="size-4 text-accent" />}
            title="Groups"
            count={secretAccessList.groups.length}
          />
          <ItemGroup>
            {secretAccessList.groups.map((group) => (
              <AccessCard
                key={group.id}
                entry={group}
                linkTo={`${getProjectBaseURL(currentProject.type)}/groups/$groupId`}
                linkParams={{
                  orgId: currentOrg.id,
                  projectId: currentProject.id,
                  groupId: group.id
                }}
              />
            ))}
          </ItemGroup>
        </div>
      )}
    </div>
  );
}
