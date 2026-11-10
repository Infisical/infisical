import { Link } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v4/ui/hover-card";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultDelegationDetail,
  TAgentVaultMissingAccessBundle
} from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { orgHref } from "../../../links";
import { projectBase } from "../../../shell/navigation";
import { useGo } from "../../navigation";
import { useProjectScope } from "../../project/scope";
import { Muted } from "../../ui";

import styles from "./delegation.module.css";

export const ALL_MEMBERS = "all-members";

export type DelegationSubject = {
  key: string;
  type: AgentVaultMemberType.User | AgentVaultMemberType.Group | typeof ALL_MEMBERS;
  id: string;
  name: string;
  subtitle: string;
  addedAt: string;
  missingAccessBundles: TAgentVaultMissingAccessBundle[];
};

export const delegationSubjects = (
  delegation: TAgentVaultDelegationDetail | null | undefined
): DelegationSubject[] => [
  ...(delegation?.groups ?? []).map((group) => ({
    key: `group:${group.id}`,
    type: AgentVaultMemberType.Group as const,
    id: group.id,
    name: group.name,
    subtitle: "Group",
    addedAt: group.addedAt,
    missingAccessBundles: group.missingAccessBundles
  })),
  ...(delegation?.users ?? []).map((user) => {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return {
      key: `user:${user.id}`,
      type: AgentVaultMemberType.User as const,
      id: user.id,
      name: name || user.username || user.email || "Unknown",
      subtitle: user.email || user.username,
      addedAt: user.addedAt,
      missingAccessBundles: user.missingAccessBundles
    };
  })
];

export const subjectOnBehalfOf = (subject: Pick<DelegationSubject, "type" | "name">) =>
  subject.type === AgentVaultMemberType.Group
    ? `members of "${subject.name}"`
    : `"${subject.name}"`;

export const SubjectName = ({ name, subtitle }: { name: string; subtitle: string }) => (
  <Inline gap={8}>
    <span title={name}>{name}</span>
    <Muted>{subtitle}</Muted>
  </Inline>
);

export const MissingAccessBundlesHint = ({
  bundles,
  machineIdentityName,
  onBehalfOf
}: {
  bundles: TAgentVaultMissingAccessBundle[];
  machineIdentityName: string;
  onBehalfOf: string;
}) => {
  const go = useGo();
  const { orgId, projectId } = useProjectScope();
  if (!bundles.length) return null;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button type="button" className={styles.hint}>
          <Icon icon={PackageIcon} size={12} />
          {`${bundles.length} ${bundles.length === 1 ? "bundle" : "bundles"} excluded`}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end">
        <div className={styles.hintBody}>
          <Muted>{`Sessions on behalf of ${onBehalfOf} can't use these access bundles, because "${machineIdentityName}" isn't granted them.`}</Muted>
          <ul className={styles.bundleList}>
            {bundles.map((bundle) => (
              <li key={bundle.id}>
                <Link
                  {...go.link(
                    `${orgHref(orgId, projectBase(ProjectType.AgentVault, projectId))}/access-bundles/${bundle.id}`
                  )}
                  className={styles.bundleLink}
                >
                  {bundle.name}
                </Link>
              </li>
            ))}
          </ul>
          <Muted>{`To include one, grant it to "${machineIdentityName}" from the bundle's access settings.`}</Muted>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
