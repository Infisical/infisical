import { useMemo, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { useProject } from "@app/context";
import { AGENT_VAULT_MAX_SKILLS_PER_BUNDLE } from "@app/helpers/agentVaultSkills";
import { useDebounce } from "@app/hooks";
import {
  useAddAgentVaultAccessBundleSkill,
  useListAgentVaultSkills
} from "@app/hooks/api/agentVault";
import { TAgentVaultSkill } from "@app/hooks/api/agentVault/types";

const CREATE_LABEL = "Create New Skill";
const PICKER_LIMIT = 100;

type Props = {
  accessBundleId: string;
  bundleSkillIds: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  canCreateSkills: boolean;
  onCreateNew: (name: string) => void;
};

export const AddBundleSkillDialog = ({
  accessBundleId,
  bundleSkillIds,
  isOpen,
  onOpenChange,
  canCreateSkills,
  onCreateNew
}: Props) => {
  const { projectId } = useProject();
  const addSkill = useAddAgentVaultAccessBundleSkill(projectId);
  const [skills, setSkills] = useState<TAgentVaultSkill[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  const { data, isFetching } = useListAgentVaultSkills(
    projectId,
    { search: debouncedSearch.trim() || undefined, limit: PICKER_LIMIT },
    { enabled: isOpen }
  );

  const options = useMemo(() => {
    const inBundle = new Set(bundleSkillIds);
    return (data?.skills ?? []).filter((option) => !inBundle.has(option.id));
  }, [data, bundleSkillIds]);

  const isListTruncated = (data?.totalCount ?? 0) > (data?.skills.length ?? 0);
  const roomLeft = Math.max(0, AGENT_VAULT_MAX_SKILLS_PER_BUNDLE - bundleSkillIds.length);
  const isOverLimit = skills.length > roomLeft;

  const handleClose = () => {
    setSkills([]);
    setSearch("");
    onOpenChange(false);
  };

  const handleAdd = async () => {
    if (skills.length === 0) return;
    try {
      // All or nothing: if one is missing or the bundle would go over its limit, none are added.
      const { skills: added } = await addSkill.mutateAsync({
        accessBundleId,
        skillIds: skills.map((skill) => skill.id)
      });
      if (added.length > 0) {
        createNotification({
          text:
            added.length === 1 ? `Skill "${added[0].name}" added` : `${added.length} skills added`,
          type: "success"
        });
      }
      handleClose();
    } catch {
      // The global mutation handler shows the server's message.
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
          return;
        }
        onOpenChange(open);
      }}
    >
      <DialogContent isPending={addSkill.isPending}>
        <DialogHeader>
          <DialogTitle>Add Skills</DialogTitle>
          <DialogDescription>
            Agents running with this bundle get the skills the next time they start.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="agent-vault-add-bundle-skills">Skills</FieldLabel>
          <FieldContent>
            <Combobox<TAgentVaultSkill>
              id="agent-vault-add-bundle-skills"
              multiple
              options={options}
              value={skills}
              isLoading={isFetching}
              onSearchChange={setSearch}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              getOptionKeywords={(option) => [option.description]}
              renderOption={(option) => (
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{option.name}</span>
                  <span className="truncate text-xs text-muted">{option.description}</span>
                </div>
              )}
              placeholder="Pick skills"
              searchPlaceholder="Search skills..."
              searchAriaLabel="Search skills"
              emptyMessage={search ? "No skills match your search" : "No skills to add"}
              modal
              isError={isOverLimit}
              onValueChange={setSkills}
              creation={
                canCreateSkills
                  ? {
                      mode: "action",
                      emptyLabel: CREATE_LABEL,
                      formatLabel: () => CREATE_LABEL,
                      onAction: (inputValue) => {
                        handleClose();
                        onCreateNew(inputValue);
                      }
                    }
                  : undefined
              }
            />
            {isOverLimit ? (
              <FieldError>
                An access bundle can have at most {AGENT_VAULT_MAX_SKILLS_PER_BUNDLE} skills. This
                one has room for {roomLeft} more.
              </FieldError>
            ) : (
              isListTruncated && (
                <FieldDescription>
                  Search by name to find skills that are not listed.
                </FieldDescription>
              )
            )}
          </FieldContent>
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} isDisabled={addSkill.isPending}>
            Cancel
          </Button>
          <Button
            variant="av"
            isPending={addSkill.isPending}
            isDisabled={skills.length === 0 || isOverLimit}
            onClick={handleAdd}
          >
            {skills.length > 1 ? `Add ${skills.length} Skills` : "Add Skill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
