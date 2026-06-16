import { useEffect, useState } from "react";
import { format } from "date-fns";

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
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useUpdateGroupWorkspaceRole } from "@app/hooks/api";
import { TGroupMembership } from "@app/hooks/api/groups/types";

type Props = {
  group: TGroupMembership | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const ROLE_OPTIONS = [
  {
    value: "admin",
    label: "Admin",
    description: "Full access to all sections including settings, templates, and access control."
  },
  {
    value: "member",
    label: "Member",
    description: "Can only view Access page."
  }
];

export const GroupDetailSheet = ({ group, isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const updateRole = useUpdateGroupWorkspaceRole();

  const currentRole = group?.roles?.[0]?.role ?? "member";
  const [selectedRole, setSelectedRole] = useState<string>(currentRole);

  useEffect(() => {
    if (group) {
      setSelectedRole(group.roles?.[0]?.role ?? "member");
    }
  }, [group]);

  if (!group) return null;

  const hasChanges = selectedRole !== currentRole;

  const handleSave = async () => {
    try {
      await updateRole.mutateAsync({
        projectId: currentProject.id,
        projectType: currentProject.type,
        groupId: group.group.id,
        roles: [{ role: selectedRole, isTemporary: false }]
      });
      createNotification({ text: "Group role updated", type: "success" });
      onOpenChange(false);
    } catch {
      createNotification({ text: "Failed to update group role", type: "error" });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Group Details</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6">
          <div className="flex flex-col items-start gap-3">
            <div>
              <h3 className="text-lg font-semibold">{group.group.name}</h3>
              <p className="font-mono text-sm text-muted">{group.group.slug}</p>
            </div>
            <Badge variant={currentRole === "admin" ? "pam" : "neutral"}>
              {formatProjectRoleName(currentRole, group.roles?.[0]?.customRoleName)}
            </Badge>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium tracking-wider text-muted uppercase">Added</p>
            <p className="mt-1 text-sm">
              {group.createdAt ? format(new Date(group.createdAt), "MMM d, yyyy") : "-"}
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium tracking-wider text-muted uppercase">
              Product Role
            </p>
            <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Groups}>
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
          </div>
        </div>

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
      </SheetContent>
    </Sheet>
  );
};
