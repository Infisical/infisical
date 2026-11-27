import { useMemo } from "react";

import {
  TAgentVaultAccessBundleListItem,
  TAgentVaultProjectService,
  TAgentVaultSkill
} from "@app/hooks/api/agentVault/types";
import {
  useAgentVaultAccessBundleCatalog,
  useAgentVaultServiceCatalog,
  useAgentVaultSkillCatalog
} from "@app/hooks/api/agentVaultRoles";

import { RESOURCE_NOUNS, TNameOf } from "./agentVaultPolicyModel";

/** The project's access bundles, services and skills by id, so rules that name them by id can show a name. */
export const useAgentVaultPolicyCatalog = (projectId: string) => {
  const accessBundles = useAgentVaultAccessBundleCatalog(projectId);
  const services = useAgentVaultServiceCatalog(projectId);
  const skills = useAgentVaultSkillCatalog(projectId);

  return useMemo(() => {
    const accessBundlesById = new Map<string, TAgentVaultAccessBundleListItem>(
      (accessBundles.data?.items ?? []).map((bundle) => [bundle.id, bundle])
    );
    const servicesById = new Map<string, TAgentVaultProjectService>(
      (services.data?.items ?? []).map((service) => [service.id, service])
    );
    const skillsById = new Map<string, TAgentVaultSkill>(
      (skills.data?.items ?? []).map((skill) => [skill.id, skill])
    );
    const isPending = {
      accessBundles: accessBundles.isPending,
      services: services.isPending,
      skills: skills.isPending
    };
    const namesOf = {
      accessBundles: (itemId: string) => accessBundlesById.get(itemId)?.name,
      services: (itemId: string) => servicesById.get(itemId)?.name,
      skills: (itemId: string) => skillsById.get(itemId)?.name
    };

    const nameOf: TNameOf = (rowKey, itemId) => {
      const name = namesOf[rowKey](itemId);
      if (name) return name;
      return isPending[rowKey] ? "…" : `unknown ${RESOURCE_NOUNS[rowKey].singular}`;
    };

    return { accessBundlesById, servicesById, skillsById, isPending, nameOf };
  }, [
    accessBundles.data,
    services.data,
    skills.data,
    accessBundles.isPending,
    services.isPending,
    skills.isPending
  ]);
};

export type TAgentVaultPolicyCatalog = ReturnType<typeof useAgentVaultPolicyCatalog>;
