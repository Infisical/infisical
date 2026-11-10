import { useState } from "react";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { OrgAccessControlTabSections } from "@app/types/org";

import { useV4Adapter } from "../../../data/adapters";
import { accessLinks } from "../../links";
import { useGo } from "../../navigation";
import { useDebounced } from "../../org/use-debounced";
import { useProjectScope } from "../../project/scope";
import { failed, saved, toast } from "../../toast";
import { Muted } from "../../ui";
import { DEFAULT_PRODUCT_ROLE, ProductRoleField } from "./shared";

const Content = ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
  const { orgId } = useProjectScope();
  const go = useGo();
  const av = useV4Adapter("agentVault");
  const addMembers = av.useAddMembers(projectId);
  const [group, setGroup] = useState("");
  const [role, setRole] = useState<string>(DEFAULT_PRODUCT_ROLE);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [pending, setPending] = useState(false);

  const available = av.useAvailableMembers(projectId, {
    actorType: AgentVaultMemberType.Group,
    search: debouncedSearch || undefined
  });
  const current = av.useMembers(projectId, { actorType: AgentVaultMemberType.Group, limit: 1 });

  const actors = available.data?.actors ?? [];
  const options = actors.map((actor) => ({ value: actor.id, label: actor.name }));
  const nothingToAdd = Boolean(available.data) && !available.data?.totalCount && !debouncedSearch;
  const orgHasNoGroups = nothingToAdd && !current.data?.totalCount;

  const submit = async () => {
    const selected = options.find((option) => option.value === group);
    if (!selected) return;
    setPending(true);
    try {
      const { skipped } = await addMembers.mutateAsync({ groupIds: [group], role });
      if (skipped.length) toast({ title: `${selected.label} already has access to this project` });
      else saved(`${selected.label} added`);
      onClose();
    } catch (error) {
      failed("Failed to add group", error);
    } finally {
      setPending(false);
    }
  };

  const cancel = (
    <Button variant="ghost" onClick={onClose}>
      Cancel
    </Button>
  );

  return (
    <DialogContent pending={pending}>
      <DialogHeader>
        <DialogTitle>Add group</DialogTitle>
      </DialogHeader>
      {nothingToAdd ? (
        <>
          <Muted>
            {orgHasNoGroups
              ? "Your organization has no groups yet. Create one at the organization level to add it to this project."
              : "Every group in your organization is already added. To add another, create one at the organization level first."}
          </Muted>
          <DialogFooter>
            {cancel}
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                go(accessLinks.org(orgId, OrgAccessControlTabSections.Groups));
              }}
            >
              Go to organization groups
              <Icon icon={ArrowRightIcon} />
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <form
            id="add-agent-vault-group"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field label="Group">
                <Combobox
                  label="Group"
                  placeholder="Select group..."
                  emptyText="No groups match your search"
                  options={options}
                  value={group}
                  loading={available.isPending}
                  onSearch={setSearch}
                  onChange={setGroup}
                />
              </Field>
              <ProductRoleField value={role} onChange={setRole} idPrefix="add-group-role" />
            </Stack>
          </form>
          <DialogFooter>
            {cancel}
            <Button
              variant="primary"
              type="submit"
              form="add-agent-vault-group"
              loading={pending}
              disabled={!group}
            >
              Add group
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  );
};

export const AddGroupDialog = ({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <Content key={String(open)} projectId={projectId} onClose={() => onOpenChange(false)} />
  </Dialog>
);
