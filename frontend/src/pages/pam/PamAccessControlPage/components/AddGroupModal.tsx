import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  useAddGroupToWorkspace,
  useGetOrganizationGroups,
  useListWorkspaceGroups
} from "@app/hooks/api";

type Props = {
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

export const AddGroupModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { mutateAsync: addGroup, isPending } = useAddGroupToWorkspace();

  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null);
  const [selectedRole, setSelectedRole] = useState("member");

  const { data: orgGroups } = useGetOrganizationGroups(currentOrg.id);
  const { data: projectGroups } = useListWorkspaceGroups(currentProject.id, currentProject.type);

  const availableGroups = useMemo(() => {
    const assignedIds = new Set(projectGroups?.map((g) => g.group.id));
    return (orgGroups || []).filter(({ id }) => !assignedIds.has(id));
  }, [orgGroups, projectGroups]);

  const handleClose = () => {
    setSelectedGroup(null);
    setSelectedRole("member");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!selectedGroup) return;

    try {
      await addGroup({
        projectId: currentProject.id,
        projectType: currentProject.type,
        groupId: selectedGroup.id,
        role: selectedRole
      });
      createNotification({ text: "Group added", type: "success" });
      handleClose();
    } catch {
      createNotification({ text: "Failed to add group", type: "error" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-visible sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Group</DialogTitle>
          <DialogDescription>Add an existing organization group.</DialogDescription>
        </DialogHeader>

        {availableGroups.length ? (
          <div className="flex flex-col gap-5">
            <Field>
              <FieldLabel>
                Group <span className="text-product-pam">*</span>
              </FieldLabel>
              <FilterableSelect
                value={selectedGroup}
                onChange={(val) => setSelectedGroup(val as { id: string; name: string } | null)}
                getOptionValue={(option) => option.id}
                getOptionLabel={(option) => option.name}
                options={availableGroups}
                placeholder="Select group..."
              />
            </Field>

            <Field>
              <FieldLabel>
                Product role <span className="text-product-pam">*</span>
              </FieldLabel>
              <div className="flex flex-col gap-2">
                {ROLE_OPTIONS.map((option) => {
                  const isSelected = selectedRole === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedRole(option.value)}
                      className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-product-pam/40 bg-product-pam/5"
                          : "border-border bg-container hover:bg-container-hover"
                      }`}
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
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              All organization groups have already been added. Create a new group at the
              organization level first.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="self-end"
              onClick={() => {
                handleClose();
                navigate({
                  to: "/organizations/$orgId/access-management" as never,
                  params: { orgId: currentOrg.id } as never,
                  search: { selectedTab: "groups" } as never
                });
              }}
            >
              Go to organization groups
            </Button>
          </div>
        )}

        {availableGroups.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="pam"
              isDisabled={!selectedGroup}
              isPending={isPending}
              onClick={handleSubmit}
            >
              Add Group
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
