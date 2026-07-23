import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

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
import { useGetOrganizationGroups, useListWorkspaceGroups } from "@app/hooks/api";
import { useAddPamProductGroupMember } from "@app/hooks/api/pam";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleOptionList } from "./ProductRoleOptionList";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AddGroupModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { mutate: addGroup, isPending } = useAddPamProductGroupMember();

  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>(ProjectMembershipRole.Member);

  const { data: orgGroups } = useGetOrganizationGroups(currentOrg.id);
  const { data: projectGroups } = useListWorkspaceGroups(currentProject.id, currentProject.type);

  const availableGroups = useMemo(() => {
    const assignedIds = new Set(projectGroups?.map((g) => g.group.id));
    return (orgGroups || []).filter(({ id }) => !assignedIds.has(id));
  }, [orgGroups, projectGroups]);

  const handleClose = () => {
    setSelectedGroup(null);
    setSelectedRole(ProjectMembershipRole.Member);
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!selectedGroup) return;

    addGroup(
      {
        projectId: currentProject.id,
        groupId: selectedGroup.id,
        role: selectedRole
      },
      {
        onSuccess: () => {
          createNotification({ text: "Group added", type: "success" });
          handleClose();
        }
      }
    );
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
              <ProductRoleOptionList value={selectedRole} onChange={setSelectedRole} />
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              All organization groups have already been added. Create a new group at the
              organization level first.
            </p>
            <Button
              variant="pam"
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
              <ExternalLink />
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
