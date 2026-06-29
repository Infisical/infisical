import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderOpen, MoreHorizontal, Pencil, Trash2, UserPlus } from "lucide-react";
import { z } from "zod";

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
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextArea
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { useOrganization, useUser } from "@app/context";
import { useGetIdentityMembershipOrgs } from "@app/hooks/api";
import { useGetOrganizationGroups } from "@app/hooks/api/organization/queries";
import {
  TPamFolderWithCount,
  TPamMember,
  useListFolderMembers,
  useListPamResourceRoles,
  usePamFolderActions,
  useRemoveFolderGroupMember,
  useRemoveFolderIdentityMember,
  useRemoveFolderMember,
  useUpdatePamFolder
} from "@app/hooks/api/pam";
import { useGetOrgUsers } from "@app/hooks/api/users/queries";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { PamMemberKind, PamMembershipScope } from "../../components/memberEnums";
import {
  formatDetailDate,
  isMembershipExpired,
  MemberExpiry,
  PamDetailSheet
} from "../../components/PamDetailSheet";
import { PAM_FOLDER_TABS, visiblePamTabs } from "../../components/pamResourceTabs";
import { RemoveMemberConfirm } from "../../components/RemoveMemberConfirm";
import { SheetSaveBar } from "../../components/SheetSaveBar";
import { AssignAccessModal, EditMemberTarget } from "./AssignAccessModal";

type Props = {
  isOpen: boolean;
  folder?: TPamFolderWithCount;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onOpenChange: (open: boolean) => void;
};

const folderFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  description: z.string().max(256).optional()
});

type FolderFormData = z.infer<typeof folderFormSchema>;

const GeneralTab = ({
  folder,
  onDirtyChange
}: {
  folder: TPamFolderWithCount;
  onDirtyChange?: (isDirty: boolean) => void;
}) => {
  const updateFolder = useUpdatePamFolder();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<FolderFormData>({
    resolver: zodResolver(folderFormSchema),
    defaultValues: { name: folder.name, description: folder.description ?? "" }
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    reset({ name: folder.name, description: folder.description ?? "" });
  }, [folder.id, folder.name, folder.description, reset]);

  const onSubmit = (data: FolderFormData) => {
    updateFolder.mutate(
      { folderId: folder.id, name: data.name, description: data.description || null },
      {
        onSuccess: () => createNotification({ type: "success", text: "Folder updated" })
      }
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>Edit the folder name and description.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>
                  Name<span className="text-product-pam">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input {...field} isError={!!fieldState.error} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Description</FieldLabel>
                <FieldContent>
                  <TextArea {...field} rows={3} isError={!!fieldState.error} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <div aria-hidden className="h-8 shrink-0" />
      {isDirty && <SheetSaveBar isPending={updateFolder.isPending} onDiscard={() => reset()} />}
    </form>
  );
};

type ResolvedMember = {
  member: TPamMember;
  displayName: string;
  subtitle: string;
  kind: PamMemberKind;
};

const PermissionsTab = ({ folderId }: { folderId: string }) => {
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const { data: folderMembers, isLoading } = useListFolderMembers(folderId);
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

  const removeUser = useRemoveFolderMember();
  const removeGroup = useRemoveFolderGroupMember();
  const removeIdentity = useRemoveFolderIdentityMember();

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditMemberTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ResolvedMember | null>(null);

  const existingUserIdSet = useMemo(
    () =>
      new Set(
        (folderMembers?.users ?? [])
          .filter((m) => m.userId && !isMembershipExpired(m.expiresAt))
          .map((m) => m.userId) as string[]
      ),
    [folderMembers]
  );
  const existingGroupIdSet = useMemo(
    () =>
      new Set(
        (folderMembers?.groups ?? [])
          .filter((m) => m.groupId && !isMembershipExpired(m.expiresAt))
          .map((m) => m.groupId) as string[]
      ),
    [folderMembers]
  );
  const existingIdentityIdSet = useMemo(
    () =>
      new Set(
        (folderMembers?.identities ?? [])
          .filter((m) => m.identityId && !isMembershipExpired(m.expiresAt))
          .map((m) => m.identityId) as string[]
      ),
    [folderMembers]
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

  const resolvedMembers = useMemo(() => {
    const users: ResolvedMember[] = (folderMembers?.users ?? []).map((m) => {
      const info = m.userId ? userMap.get(m.userId) : undefined;
      return {
        member: m,
        displayName: info?.name ?? m.userId ?? "Unknown",
        subtitle: info?.email ?? "",
        kind: PamMemberKind.User
      };
    });
    const groups: ResolvedMember[] = (folderMembers?.groups ?? []).map((m) => ({
      member: m,
      displayName:
        (m.groupId ? groupMap.get(m.groupId) : undefined) ?? m.groupId ?? "Unknown group",
      subtitle: "Group",
      kind: PamMemberKind.Group
    }));
    const identities: ResolvedMember[] = (folderMembers?.identities ?? []).map((m) => ({
      member: m,
      displayName:
        (m.identityId ? identityNameMap.get(m.identityId) : undefined) ??
        m.identityId ??
        "Unknown identity",
      subtitle: "Machine Identity",
      kind: PamMemberKind.Identity
    }));
    return [...users, ...groups, ...identities];
  }, [folderMembers, userMap, groupMap, identityNameMap]);

  const handleRemove = (rm: ResolvedMember) => {
    const opts = {
      onSuccess: () => createNotification({ type: "success", text: "Member removed" })
    };
    if (rm.kind === PamMemberKind.User && rm.member.userId) {
      removeUser.mutate({ folderId, userId: rm.member.userId }, opts);
    } else if (rm.kind === PamMemberKind.Group && rm.member.groupId) {
      removeGroup.mutate({ folderId, groupId: rm.member.groupId }, opts);
    } else if (rm.kind === PamMemberKind.Identity && rm.member.identityId) {
      removeIdentity.mutate({ folderId, identityId: rm.member.identityId }, opts);
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
        scope={PamMembershipScope.Folder}
        resourceId={folderId}
        existingUserIds={existingUserIdSet}
        existingGroupIds={existingGroupIdSet}
        existingIdentityIds={existingIdentityIdSet}
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
            Permissions
            <Badge variant="pam">{resolvedMembers.length}</Badge>
          </CardTitle>
          <CardDescription>
            Users, groups, and identities with access to this folder and its accounts.
          </CardDescription>
          <CardAction>
            <Button size="sm" variant="pam" onClick={() => setIsAssignOpen(true)}>
              <UserPlus className="mr-1.5 size-4" />
              Assign Access
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {resolvedMembers.length === 0 ? (
            <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
              No members assigned to this folder yet.
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
                {resolvedMembers.map((rm) => {
                  const roleName =
                    (resourceRoles ?? []).find((r) => r.slug === rm.member.role)?.name ??
                    rm.member.role;
                  const isOwnMembership =
                    rm.kind === PamMemberKind.User && rm.member.userId === user.id;

                  return (
                    <TableRow key={rm.member.membershipId} className="[&>td]:h-12">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{rm.displayName}</span>
                          {rm.subtitle && <span className="text-xs text-muted">{rm.subtitle}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{roleName}</Badge>
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
    </div>
  );
};

export const FolderDetailSheet = ({
  isOpen,
  folder,
  activeTab,
  onTabChange,
  onOpenChange
}: Props) => {
  const { can } = usePamFolderActions(folder?.id ?? "", isOpen && Boolean(folder));
  const availableTabs = visiblePamTabs(PAM_FOLDER_TABS, can);

  const [isFormDirty, setIsFormDirty] = useState(false);

  const metadata = folder
    ? [
        ...(folder.description ? [{ label: "Description", value: folder.description }] : []),
        { label: "Accounts", value: String(folder.accountCount) },
        { label: "Created", value: formatDetailDate(folder.createdAt) }
      ]
    : [];

  const tabContent: Partial<Record<PamSheetTab, JSX.Element | null>> = {
    [PamSheetTab.Permissions]: folder ? <PermissionsTab folderId={folder.id} /> : null,
    [PamSheetTab.Configuration]: folder ? (
      <GeneralTab folder={folder} onDirtyChange={setIsFormDirty} />
    ) : null
  };

  const tabs = availableTabs.map((tabDef) => ({
    value: tabDef.value,
    label: tabDef.label,
    icon: <tabDef.icon className="mr-1.5 size-4" />,
    content: tabContent[tabDef.value] ?? null
  }));

  return (
    <PamDetailSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={folder?.name}
      typeBadge={undefined}
      activeTab={activeTab}
      onTabChange={onTabChange}
      icon={
        <div className="mb-4 flex size-16 items-center justify-center rounded-lg border border-border bg-container">
          <FolderOpen className="size-10 text-product-pam" />
        </div>
      }
      metadata={metadata}
      tabs={tabs}
      isDirty={isFormDirty}
    />
  );
};
