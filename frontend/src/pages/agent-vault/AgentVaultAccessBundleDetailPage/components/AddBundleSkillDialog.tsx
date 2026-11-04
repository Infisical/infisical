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
  const addSkill = useAddAgentVaultAccessBundleSkill();
  const [skills, setSkills] = useState<TAgentVaultSkill[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [isAdding, setIsAdding] = useState(false);

  const { data, isFetching } = useListAgentVaultSkills(
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
    setIsAdding(true);
    const added: TAgentVaultSkill[] = [];
    try {
      // One at a time, so the bundle's skill limit stops the rest once it is reached.
      for (const skill of skills) {
        // eslint-disable-next-line no-await-in-loop
        await addSkill.mutateAsync({ accessBundleId, skillId: skill.id });
        added.push(skill);
      }
    } catch {
      // The global mutation handler shows the server's message.
    } finally {
      setIsAdding(false);
    }
    if (added.length > 0) {
      createNotification({
        text:
          added.length === 1 ? `Skill "${added[0].name}" added` : `${added.length} skills added`,
        type: "success"
      });
    }
    if (added.length === skills.length) handleClose();
    else setSkills((prev) => prev.filter((skill) => !added.includes(skill)));
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
      <DialogContent isPending={isAdding}>
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
          <Button variant="outline" onClick={handleClose} isDisabled={isAdding}>
            Cancel
          </Button>
          <Button
            variant="av"
            isPending={isAdding}
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
