import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Inline } from "@infisical/cipher/ui/layout";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";

import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { AGENT_VAULT_MAX_SKILLS_PER_BUNDLE } from "@app/helpers/agentVaultSkills";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const PICKER_LIMIT = 100;
const MAX_SERVICES_PER_ADD = 25;

type TOption = { id: string; name: string; meta?: string };

const AddDialog = ({
  noun,
  description,
  options,
  loading,
  isTruncated,
  limit,
  limitMessage,
  pending,
  createLabel,
  onCreate,
  onAdd,
  onOpenChange
}: {
  noun: string;
  description: string;
  options: readonly TOption[];
  loading: boolean;
  isTruncated: boolean;
  limit: number;
  limitMessage: string;
  pending: boolean;
  createLabel?: string;
  onCreate?: () => void;
  onAdd: (ids: string[]) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const isOverLimit = selected.length > limit;
  const plural = `${noun}s`;
  return (
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{`Add ${plural}`}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field
          label={plural[0].toUpperCase() + plural.slice(1)}
          error={isOverLimit ? limitMessage : undefined}
          description={
            !isOverLimit && isTruncated
              ? `Only the first ${PICKER_LIMIT} ${plural} are listed.`
              : undefined
          }
          wide
        >
          <MultiSelect
            label={plural}
            searchable
            placeholder={loading ? "Loading..." : `Pick ${plural}`}
            disabled={loading}
            invalid={isOverLimit}
            options={options.map((option) => ({
              value: option.id,
              label: option.name,
              description: option.meta
            }))}
            value={selected}
            onChange={setSelected}
          />
        </Field>
        <DialogFooter>
          <Inline gap={8} justify="between" style={{ width: "100%" }}>
            {onCreate && createLabel ? (
              <Button variant="ghost" icon="plus" disabled={pending} onClick={onCreate}>
                {createLabel}
              </Button>
            ) : (
              <span />
            )}
            <Inline gap={8}>
              <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={pending}
                disabled={selected.length === 0 || isOverLimit}
                onClick={async () => {
                  if (await onAdd(selected)) onOpenChange(false);
                }}
              >
                {selected.length > 1 ? `Add ${selected.length} ${plural}` : `Add ${noun}`}
              </Button>
            </Inline>
          </Inline>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const AddBundleServicesDialog = ({
  projectId,
  accessBundleId,
  bundleServiceIds,
  onCreateNew,
  onOpenChange
}: {
  projectId: string;
  accessBundleId: string;
  bundleServiceIds: readonly string[];
  onCreateNew: () => void;
  onOpenChange: (open: boolean) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const add = resources.useAddAccessBundleServices(projectId);
  const { data, isPending } = resources.useServices(projectId, {
    limit: PICKER_LIMIT
  });
  const inBundle = new Set(bundleServiceIds);
  const options = (data?.services ?? [])
    .filter((service) => !inBundle.has(service.id))
    .map((service) => ({
      id: service.id,
      name: service.name,
      meta: service.description ?? hostPatternOf(service) ?? undefined
    }));
  return (
    <AddDialog
      noun="service"
      description="Sessions on this bundle reach them at the next proxy poll."
      options={options}
      loading={isPending}
      isTruncated={(data?.totalCount ?? 0) > (data?.services.length ?? 0)}
      limit={MAX_SERVICES_PER_ADD}
      limitMessage={`You can add up to ${MAX_SERVICES_PER_ADD} services at a time.`}
      pending={add.isPending}
      createLabel="Create new service"
      onCreate={() => {
        onOpenChange(false);
        onCreateNew();
      }}
      onAdd={async (serviceIds) => {
        try {
          const { services } = await add.mutateAsync({
            accessBundleId,
            serviceIds
          });
          if (services.length)
            saved(
              services.length === 1
                ? `Service ${services[0].name} added`
                : `${services.length} services added`
            );
          return true;
        } catch (error) {
          failed("Failed to add services", error);
          return false;
        }
      }}
      onOpenChange={onOpenChange}
    />
  );
};

export const AddBundleSkillsDialog = ({
  projectId,
  accessBundleId,
  bundleSkillIds,
  onCreateNew,
  onOpenChange
}: {
  projectId: string;
  accessBundleId: string;
  bundleSkillIds: readonly string[];
  onCreateNew?: () => void;
  onOpenChange: (open: boolean) => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const add = resources.useAddAccessBundleSkills(projectId);
  const { data, isPending } = resources.useSkills(projectId, {
    limit: PICKER_LIMIT
  });
  const inBundle = new Set(bundleSkillIds);
  const roomLeft = Math.max(0, AGENT_VAULT_MAX_SKILLS_PER_BUNDLE - bundleSkillIds.length);
  const options = (data?.skills ?? [])
    .filter((skill) => !inBundle.has(skill.id))
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      meta: skill.description
    }));
  return (
    <AddDialog
      noun="skill"
      description="Agents running with this bundle get the skills the next time they start."
      options={options}
      loading={isPending}
      isTruncated={(data?.totalCount ?? 0) > (data?.skills.length ?? 0)}
      limit={roomLeft}
      limitMessage={`An access bundle can have at most ${AGENT_VAULT_MAX_SKILLS_PER_BUNDLE} skills. This one has room for ${roomLeft} more.`}
      pending={add.isPending}
      createLabel={onCreateNew ? "Create new skill" : undefined}
      onCreate={
        onCreateNew
          ? () => {
              onOpenChange(false);
              onCreateNew();
            }
          : undefined
      }
      onAdd={async (skillIds) => {
        try {
          const { skills } = await add.mutateAsync({
            accessBundleId,
            skillIds
          });
          if (skills.length)
            saved(
              skills.length === 1
                ? `Skill ${skills[0].name} added`
                : `${skills.length} skills added`
            );
          return true;
        } catch (error) {
          failed("Failed to add skills", error);
          return false;
        }
      }}
      onOpenChange={onOpenChange}
    />
  );
};
