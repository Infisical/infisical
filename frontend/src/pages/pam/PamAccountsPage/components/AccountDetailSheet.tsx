import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FolderOpen,
  MoreHorizontal,
  Network,
  Pencil,
  SquarePen,
  Trash2,
  UserPlus
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  GatewayPicker,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { useOrganization, useUser } from "@app/context";
import { useGetIdentityMembershipOrgs } from "@app/hooks/api";
import { gatewayPoolsQueryKeys } from "@app/hooks/api/gateway-pools/queries";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { useGetOrganizationGroups } from "@app/hooks/api/organization/queries";
import {
  PamAccountAccessibilityIssue,
  PamAccountType,
  TPamMember,
  useGetPamAccountById,
  useGetPamAccountTemplate,
  useListAccountMembers,
  useListFolderMembers,
  useListPamResourceRoles,
  usePamAccountActions,
  usePamAccountTypeMap,
  useRemoveAccountGroupMember,
  useRemoveAccountIdentityMember,
  useRemoveAccountMember,
  useUpdatePamAccount
} from "@app/hooks/api/pam";
import { useGetOrgUsers } from "@app/hooks/api/users/queries";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";

import { PamMemberKind, PamMembershipScope, PamMemberSource } from "../../components/memberEnums";
import {
  formatDetailDate,
  isMembershipExpired,
  MemberExpiry,
  PamDetailSheet
} from "../../components/PamDetailSheet";
import { PAM_ACCOUNT_TABS, visiblePamTabs } from "../../components/pamResourceTabs";
import { RemoveMemberConfirm } from "../../components/RemoveMemberConfirm";
import { SheetSaveBar } from "../../components/SheetSaveBar";
import { TabWarningPing } from "../../components/TabWarningPing";
import { AccountPlatformIcon } from "../../PamAccessPage/components/AccountPlatformIcon";
import { AssignAccessModal, EditMemberTarget } from "./AssignAccessModal";
import { EditAccountForm } from "./EditAccountForm";

type Props = {
  isOpen: boolean;
  accountId?: string;
  onOpenChange: (open: boolean) => void;
};

type ResolvedMember = {
  member: TPamMember;
  displayName: string;
  subtitle: string;
  source: PamMemberSource;
  kind: PamMemberKind;
};

// Maps each accessibility issue to the tab where it can be resolved
const ISSUE_TO_TAB: Record<PamAccountAccessibilityIssue, PamSheetTab> = {
  [PamAccountAccessibilityIssue.NoCredential]: PamSheetTab.Configuration,
  [PamAccountAccessibilityIssue.NoGateway]: PamSheetTab.Advanced,
  [PamAccountAccessibilityIssue.NoRecordingConfig]: PamSheetTab.Advanced
};

const PermissionsTab = ({
  accountId,
  folderId,
  folderName
}: {
  accountId: string;
  folderId: string;
  folderName: string | null;
}) => {
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const navigate = useNavigate();
  const { data: accountMembers, isLoading: isLoadingAccount } = useListAccountMembers(accountId);
  const { data: folderMembers, isLoading: isLoadingFolder } = useListFolderMembers(folderId);

  const goToFolderPermissions = () => {
    navigate({ search: { folderId, tab: PamSheetTab.Permissions } as any });
  };
  const { data: resourceRoles } = useListPamResourceRoles();
  const { data: orgUsers } = useGetOrgUsers(currentOrg.id);
  const { data: orgGroups } = useGetOrganizationGroups(currentOrg.id);
  const groupMap = useMemo(
    () => new Map((orgGroups ?? []).map((g) => [g.id, g.name] as const)),
    [orgGroups]
  );

  const { data: orgIdentities } = useGetIdentityMembershipOrgs({ organizationId: currentOrg.id });
  const identityNameMap = useMemo(
    () =>
      new Map(
        (orgIdentities?.identityMemberships ?? []).map((im) => [im.identity.id, im.identity.name])
      ),
    [orgIdentities]
  );

  const removeUser = useRemoveAccountMember();
  const removeGroup = useRemoveAccountGroupMember();
  const removeIdentity = useRemoveAccountIdentityMember();

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditMemberTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ResolvedMember | null>(null);

  const directUserIdSet = useMemo(
    () =>
      new Set(
        (accountMembers?.users ?? [])
          .filter((m) => m.userId && !isMembershipExpired(m.expiresAt))
          .map((m) => m.userId) as string[]
      ),
    [accountMembers]
  );
  const directGroupIdSet = useMemo(
    () =>
      new Set(
        (accountMembers?.groups ?? [])
          .filter((m) => m.groupId && !isMembershipExpired(m.expiresAt))
          .map((m) => m.groupId) as string[]
      ),
    [accountMembers]
  );
  const directIdentityIdSet = useMemo(
    () =>
      new Set(
        (accountMembers?.identities ?? [])
          .filter((m) => m.identityId && !isMembershipExpired(m.expiresAt))
          .map((m) => m.identityId) as string[]
      ),
    [accountMembers]
  );

  const userMap = useMemo(
    () =>
      new Map(
        (orgUsers ?? []).map((ou) => {
          const name =
            [ou.user.firstName, ou.user.lastName].filter(Boolean).join(" ") || ou.user.username;
          return [
            ou.user.id,
            { name, email: ou.user.email ?? ou.inviteEmail ?? ou.user.username }
          ] as const;
        })
      ),
    [orgUsers]
  );

  const directMembers = useMemo<ResolvedMember[]>(() => {
    const users = (accountMembers?.users ?? []).map((m) => {
      const info = m.userId ? userMap.get(m.userId) : undefined;
      return {
        member: m,
        displayName: info?.name ?? m.userId ?? "Unknown",
        subtitle: info?.email ?? "",
        source: PamMemberSource.Direct,
        kind: PamMemberKind.User
      };
    });
    const groups = (accountMembers?.groups ?? []).map((m) => ({
      member: m,
      displayName:
        (m.groupId ? groupMap.get(m.groupId) : undefined) ?? m.groupId ?? "Unknown group",
      subtitle: "Group",
      source: PamMemberSource.Direct,
      kind: PamMemberKind.Group
    }));
    const identities = (accountMembers?.identities ?? []).map((m) => ({
      member: m,
      displayName:
        (m.identityId ? identityNameMap.get(m.identityId) : undefined) ??
        m.identityId ??
        "Unknown identity",
      subtitle: "Machine Identity",
      source: PamMemberSource.Direct,
      kind: PamMemberKind.Identity
    }));
    return [...users, ...groups, ...identities];
  }, [accountMembers, userMap, groupMap, identityNameMap]);

  const inheritedMembers = useMemo<ResolvedMember[]>(() => {
    const users = (folderMembers?.users ?? []).map((m) => {
      const info = m.userId ? userMap.get(m.userId) : undefined;
      return {
        member: m,
        displayName: info?.name ?? m.userId ?? "Unknown",
        subtitle: info?.email ?? "",
        source: PamMemberSource.Inherited,
        kind: PamMemberKind.User
      };
    });
    const groups = (folderMembers?.groups ?? []).map((m) => ({
      member: m,
      displayName:
        (m.groupId ? groupMap.get(m.groupId) : undefined) ?? m.groupId ?? "Unknown group",
      subtitle: "Group",
      source: PamMemberSource.Inherited,
      kind: PamMemberKind.Group
    }));
    const identities = (folderMembers?.identities ?? []).map((m) => ({
      member: m,
      displayName:
        (m.identityId ? identityNameMap.get(m.identityId) : undefined) ??
        m.identityId ??
        "Unknown identity",
      subtitle: "Machine Identity",
      source: PamMemberSource.Inherited,
      kind: PamMemberKind.Identity
    }));
    return [...users, ...groups, ...identities];
  }, [folderMembers, userMap, groupMap, identityNameMap]);

  const isLoading = isLoadingAccount || isLoadingFolder;

  const roleNameFor = (role: string) =>
    (resourceRoles ?? []).find((r) => r.slug === role)?.name ?? role;

  const handleRemove = (rm: ResolvedMember) => {
    const opts = {
      onSuccess: () => createNotification({ type: "success", text: "Member removed" })
    };
    if (rm.kind === PamMemberKind.User && rm.member.userId) {
      removeUser.mutate({ accountId, userId: rm.member.userId }, opts);
    } else if (rm.kind === PamMemberKind.Group && rm.member.groupId) {
      removeGroup.mutate({ accountId, groupId: rm.member.groupId }, opts);
    } else if (rm.kind === PamMemberKind.Identity && rm.member.identityId) {
      removeIdentity.mutate({ accountId, identityId: rm.member.identityId }, opts);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <AssignAccessModal
        isOpen={isAssignOpen || Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setIsAssignOpen(false);
            setEditTarget(null);
          }
        }}
        scope={PamMembershipScope.Account}
        resourceId={accountId}
        existingUserIds={directUserIdSet}
        existingGroupIds={directGroupIdSet}
        existingIdentityIds={directIdentityIdSet}
        editMember={editTarget}
      />
      <RemoveMemberConfirm
        isOpen={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        memberName={removeTarget?.displayName}
        onConfirm={() => {
          if (removeTarget) handleRemove(removeTarget);
          setRemoveTarget(null);
        }}
      />
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">
            Direct Permissions
            <Badge variant="pam">{directMembers.length}</Badge>
          </CardTitle>
          <CardDescription>
            Users, groups, and identities granted access directly on this account.
          </CardDescription>
          <CardAction>
            <Button size="sm" variant="pam" onClick={() => setIsAssignOpen(true)}>
              <UserPlus className="mr-1.5 size-4" />
              Assign Access
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {directMembers.length === 0 ? (
            <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
              No members assigned to this account yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {directMembers.map((rm) => {
                  const isOwnMembership =
                    rm.kind === PamMemberKind.User && rm.member.userId === user.id;

                  return (
                    <TableRow key={`direct-${rm.member.membershipId}`} className="[&>td]:h-12">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{rm.displayName}</span>
                          {rm.subtitle && <span className="text-xs text-muted">{rm.subtitle}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{roleNameFor(rm.member.role)}</Badge>
                      </TableCell>
                      <TableCell>
                        <MemberExpiry expiresAt={rm.member.expiresAt} />
                      </TableCell>
                      <TableCell>
                        {!isOwnMembership && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                aria-label="Member actions"
                                className="text-muted"
                              >
                                <MoreHorizontal className="size-4" />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem
                                onClick={() => {
                                  const idMap: Record<PamMemberKind, string | null | undefined> = {
                                    [PamMemberKind.User]: rm.member.userId,
                                    [PamMemberKind.Group]: rm.member.groupId,
                                    [PamMemberKind.Identity]: rm.member.identityId
                                  };
                                  setEditTarget({
                                    kind: rm.kind,
                                    id: idMap[rm.kind] ?? "",
                                    label: rm.displayName,
                                    role: rm.member.role
                                  });
                                }}
                              >
                                <Pencil />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="danger"
                                onClick={() => setRemoveTarget(rm)}
                              >
                                <Trash2 />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {inheritedMembers.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">
              Inherited Permissions
              <Badge variant="pam">{inheritedMembers.length}</Badge>
            </CardTitle>
            <CardDescription>
              Access inherited from the{" "}
              <button
                type="button"
                className="font-medium text-foreground hover:underline"
                onClick={goToFolderPermissions}
              >
                {folderName ?? "parent"}
              </button>{" "}
              folder. Manage these on the folder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inheritedMembers.map((rm) => (
                  <TableRow key={`inherited-${rm.member.membershipId}`} className="[&>td]:h-12">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{rm.displayName}</span>
                        {rm.subtitle && <span className="text-xs text-muted">{rm.subtitle}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{roleNameFor(rm.member.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      <MemberExpiry expiresAt={rm.member.expiresAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

type OverridesForm = { gatewayId: string | null; gatewayPoolId: string | null };

const SettingsTab = ({
  accountId,
  onDirtyChange
}: {
  accountId: string;
  onDirtyChange?: (isDirty: boolean) => void;
}) => {
  const { data: account, isLoading } = useGetPamAccountById(accountId);
  const { data: template } = useGetPamAccountTemplate(account?.templateId);
  const { data: gateways } = useQuery(gatewaysQueryKeys.list());
  const { data: gatewayPools } = useQuery(gatewayPoolsQueryKeys.list());
  const updateAccount = useUpdatePamAccount();
  const [showGatewayPicker, setShowGatewayPicker] = useState(false);

  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isDirty }
  } = useForm<OverridesForm>({
    defaultValues: { gatewayId: null, gatewayPoolId: null }
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (account) {
      reset({ gatewayId: account.gatewayId, gatewayPoolId: account.gatewayPoolId });
      setShowGatewayPicker(false);
    }
  }, [account, reset]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!account) return null;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const isOverriding = Boolean(gatewayId || gatewayPoolId) || showGatewayPicker;

  const resolveGatewayLabel = (gwId?: string | null, poolId?: string | null) => {
    if (poolId) return gatewayPools?.find((p) => p.id === poolId)?.name ?? "Gateway pool";
    if (gwId) return gateways?.find((g) => g.id === gwId)?.name ?? "Gateway";
    return "No gateway";
  };
  const inheritedGatewayLabel = resolveGatewayLabel(template?.gatewayId, template?.gatewayPoolId);

  const setGateway = (value: OverridesForm) => {
    setValue("gatewayId", value.gatewayId, { shouldDirty: true });
    setValue("gatewayPoolId", value.gatewayPoolId, { shouldDirty: true });
  };

  const removeOverride = () => {
    setGateway({ gatewayId: null, gatewayPoolId: null });
    setShowGatewayPicker(false);
  };

  const discard = () => {
    reset();
    setShowGatewayPicker(false);
  };

  const onSubmit = (values: OverridesForm) => {
    updateAccount.mutate(
      {
        accountId,
        accountType: account.accountType,
        gatewayId: values.gatewayId,
        gatewayPoolId: values.gatewayPoolId
      },
      {
        onSuccess: () => createNotification({ type: "success", text: "Overrides updated" })
      }
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Settings</CardTitle>
          <CardDescription>System configuration overrides.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`rounded-md border p-4 ${isOverriding ? "border-product-pam/50" : "border-border"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-container">
                  <Network className="size-4 text-muted" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Gateway
                    {isOverriding && (
                      <span className="ml-2 text-xs font-normal text-product-pam">(override)</span>
                    )}
                  </p>
                  <p className="text-sm text-muted">
                    {isOverriding
                      ? `Overriding the template default (${inheritedGatewayLabel}) for this account.`
                      : `Inherited from ${account.templateName}: ${inheritedGatewayLabel}`}
                  </p>
                </div>
              </div>
              {isOverriding ? (
                <Button type="button" size="sm" variant="ghost" onClick={removeOverride}>
                  Remove Override
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowGatewayPicker(true)}
                >
                  <SquarePen className="mr-1.5 size-3.5" />
                  Override
                </Button>
              )}
            </div>

            {isOverriding && (
              <div className="mt-4">
                <GatewayPicker
                  value={{ gatewayId, gatewayPoolId }}
                  onChange={setGateway}
                  isRequired
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div aria-hidden className="h-8 shrink-0" />
      {isDirty && <SheetSaveBar isPending={updateAccount.isPending} onDiscard={discard} />}
    </form>
  );
};

const CONNECTION_FIELD_LABELS: Record<string, string> = {
  host: "Host",
  port: "Port",
  database: "Database",
  sslEnabled: "SSL",
  sslRejectUnauthorized: "Reject Unauthorized SSL",
  sslCertificate: "SSL Certificate"
};

const humanizeFieldKey = (key: string) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const formatConnectionValue = (value: unknown): ReactNode => {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  const str = String(value);
  if (str.length > 48) return "Provided";
  return <span className="font-mono">{str}</span>;
};

const buildConnectionMetadata = (connectionDetails: Record<string, unknown>) =>
  Object.entries(connectionDetails)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      label: CONNECTION_FIELD_LABELS[key] ?? humanizeFieldKey(key),
      value: formatConnectionValue(value)
    }));

export const AccountDetailSheet = ({ isOpen, accountId, onOpenChange }: Props) => {
  const { data: account, isLoading } = useGetPamAccountById(isOpen ? accountId : undefined);
  const { tab, setTab } = usePamSheetState("accountId");
  const { currentOrg } = useOrganization();

  const [isFormDirty, setIsFormDirty] = useState(false);

  const { map: accountTypeMap } = usePamAccountTypeMap();
  const accountType = account?.accountType as PamAccountType | undefined;
  const typeInfo = accountType ? accountTypeMap[accountType] : undefined;

  const { can } = usePamAccountActions(accountId ?? "", isOpen && Boolean(accountId));
  const availableTabs = visiblePamTabs(PAM_ACCOUNT_TABS, can);

  const tabsWithIssues = new Set(
    (account?.accessibilityIssues ?? []).map((issue) => ISSUE_TO_TAB[issue])
  );

  const conn = (account?.connectionDetails ?? {}) as Record<string, unknown>;

  const metadata = account
    ? [
        ...(account.description ? [{ label: "Description", value: account.description }] : []),
        {
          label: "Template",
          value: account.templateId ? (
            <Link
              to="/organizations/$orgId/pam/templates"
              params={{ orgId: currentOrg.id }}
              search={{ templateId: account.templateId }}
            >
              <Badge variant="neutral" className="cursor-pointer hover:bg-container-hover">
                {account.templateName ?? "Template"}
              </Badge>
            </Link>
          ) : (
            <Badge variant="neutral">None</Badge>
          )
        },
        ...buildConnectionMetadata(conn),
        ...(account.credentials?.username
          ? [
              {
                label: "Username",
                value: <span className="font-mono">{String(account.credentials.username)}</span>
              }
            ]
          : []),
        { label: "Created", value: formatDetailDate(account.createdAt) }
      ]
    : [];

  const folderSubtitle = account?.folderName ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <FolderOpen className="size-3.5 shrink-0" />
      <span className="truncate">{account.folderName}</span>
    </span>
  ) : undefined;

  const tabContent: Partial<Record<PamSheetTab, ReactNode>> = {
    [PamSheetTab.Permissions]:
      accountId && account ? (
        <PermissionsTab
          accountId={accountId}
          folderId={account.folderId}
          folderName={account.folderName}
        />
      ) : null,
    [PamSheetTab.Configuration]: accountId ? (
      <EditAccountForm accountId={accountId} onDirtyChange={setIsFormDirty} />
    ) : null,
    [PamSheetTab.Advanced]: accountId ? (
      <SettingsTab accountId={accountId} onDirtyChange={setIsFormDirty} />
    ) : null
  };

  return (
    <PamDetailSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isLoading={isLoading}
      accountType={accountType}
      title={account?.name}
      subtitle={folderSubtitle}
      typeBadge={typeInfo?.name}
      icon={
        accountType ? (
          <div className="mb-4 flex size-16 items-center justify-center rounded-lg border border-border bg-container">
            <AccountPlatformIcon accountType={accountType} size={40} />
          </div>
        ) : undefined
      }
      metadata={metadata}
      activeTab={tab}
      onTabChange={setTab}
      tabs={availableTabs.map((tabDef) => ({
        value: tabDef.value,
        label: tabDef.label,
        icon: <tabDef.icon className="mr-1.5 size-4" />,
        content: tabContent[tabDef.value] ?? null,
        indicator: tabsWithIssues.has(tabDef.value) ? <TabWarningPing /> : undefined
      }))}
      isDirty={isFormDirty}
    />
  );
};
