import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject, useUser } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useUpdateUserWorkspaceRole } from "@app/hooks/api";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

type Props = {
  member: TWorkspaceUser | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const ROLE_OPTIONS = [
  {
    value: "admin",
    label: "Admin",
    description:
      "Full administrative access: manage accounts, account templates, settings, and access control."
  },
  {
    value: "member",
    label: "Member",
    description: "Access limited to assigned folders and accounts."
  }
];

export const MemberDetailSheet = ({ member, isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const { user } = useUser();
  const updateRole = useUpdateUserWorkspaceRole();

  const currentRole = member?.roles?.[0]?.role ?? "member";
  const [selectedRole, setSelectedRole] = useState<string>(currentRole);

  useEffect(() => {
    if (member) {
      setSelectedRole(member.roles?.[0]?.role ?? "member");
    }
  }, [member]);

  if (!member) return null;

  const isSelf = member.user.id === user?.id;

  const displayName =
    member.user.firstName || member.user.lastName
      ? `${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim()
      : member.user.username;

  const hasChanges = selectedRole !== currentRole;

  const handleSave = async () => {
    try {
      await updateRole.mutateAsync({
        projectId: currentProject.id,
        membershipId: member.id,
        roles: [{ role: selectedRole, isTemporary: false }]
      });
      createNotification({ text: "Role updated", type: "success" });
      onOpenChange(false);
    } catch {
      createNotification({ text: "Failed to update role", type: "error" });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Member Details</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6">
          <div className="flex flex-col items-start gap-3">
            <div>
              <h3 className="text-lg font-semibold">{displayName}</h3>
              <p className="font-mono text-sm text-muted">
                {member.user.email || member.inviteEmail}
              </p>
            </div>
            <Badge variant={currentRole === "admin" ? "pam" : "neutral"}>
              {formatProjectRoleName(currentRole, member.roles?.[0]?.customRoleName)}
            </Badge>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium tracking-wider text-muted uppercase">
              Product Role
            </p>
            {isSelf ? (
              <p className="text-sm text-muted">
                You cannot modify your own membership. Ask an admin to make changes.
              </p>
            ) : (
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Member}
              >
                {(isAllowed) => (
                  <div className="flex flex-col gap-2">
                    {ROLE_OPTIONS.map((option) => {
                      const isSelected = selectedRole === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!isAllowed}
                          onClick={() => setSelectedRole(option.value)}
                          className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                            isSelected
                              ? "border-product-pam/40 bg-product-pam/5"
                              : "border-border bg-container hover:bg-container-hover"
                          } ${!isAllowed ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <div
                            className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                              isSelected ? "border-product-pam bg-product-pam" : "border-muted"
                            }`}
                          >
                            {isSelected && <div className="size-1.5 rounded-full bg-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{option.label}</p>
                            <p className="text-xs text-muted">{option.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ProjectPermissionCan>
            )}
          </div>
        </div>

        {!isSelf && (
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4">
            <Button
              variant="outline"
              size="sm"
              isDisabled={!hasChanges}
              onClick={() => setSelectedRole(currentRole)}
            >
              Reset
            </Button>
            <Button
              variant="pam"
              size="sm"
              isDisabled={!hasChanges}
              isPending={updateRole.isPending}
              onClick={handleSave}
            >
              Save
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};
