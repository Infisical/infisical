import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";

import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { useV4Adapter } from "../../../data/adapters";
import { RequestAccessSheet } from "../../SecretApprovalsPage/access-requests/RequestAccessSheet";
import { resolveAccessPolicyForPath } from "../../SecretApprovalsPage/access-requests/scope";
import { useManagedBlock } from "./row-actions/permissions";

import styles from "./overview.module.css";

const WRITE_ACTIONS = [
  {
    verb: "create",
    action: ProjectPermissionActions.Create,
    secret: ProjectPermissionSecretActions.Create
  },
  {
    verb: "edit",
    action: ProjectPermissionActions.Edit,
    secret: ProjectPermissionSecretActions.Edit
  },
  {
    verb: "delete",
    action: ProjectPermissionActions.Delete,
    secret: ProjectPermissionSecretActions.Delete
  }
];

const listVerbs = (verbs: string[]) =>
  verbs.length <= 2
    ? verbs.join(" or ")
    : `${verbs.slice(0, -1).join(", ")}, or ${verbs[verbs.length - 1]}`;

export const RequestAccessLine = ({
  orgId,
  projectId,
  environment,
  secretPath
}: {
  orgId: string;
  projectId: string;
  environment: string;
  secretPath: string;
}) => {
  const approvals = useV4Adapter("accessApprovals");
  const project = useV4Adapter("secrets").useProject(projectId).data;
  const { data: license } = approvals.useLicense(orgId);
  const { data: policies } = approvals.usePolicies(
    license?.secretApproval ? (project?.slug ?? "") : ""
  );
  const blockFor = useManagedBlock(projectId);
  const [open, setOpen] = useState(false);
  if (!project || !license?.secretApproval || !policies) return null;
  const environmentPolicies = policies.filter((policy) =>
    policy.environments?.some((env) => env.slug === environment)
  );
  if (!resolveAccessPolicyForPath(environmentPolicies, secretPath)) return null;
  const denied = (action: ProjectPermissionSecretActions) =>
    Boolean(
      blockFor(
        ProjectPermissionSub.Secrets,
        action,
        { environment, secretPath, secretName: "*", secretTags: ["*"] },
        action
      )
    );
  const missing =
    denied(ProjectPermissionSecretActions.DescribeSecret) &&
    denied(ProjectPermissionSecretActions.DescribeAndReadValue)
      ? [{ verb: "read", action: ProjectPermissionActions.Read }]
      : WRITE_ACTIONS.filter((entry) => denied(entry.secret));
  if (!missing.length) return null;
  return (
    <div className={styles.approvalsLine}>
      <Icon name="lock" size={14} className={styles.approvalsIcon} />
      <p className={styles.approvalsText}>
        <span>
          You don&apos;t have permission to {listVerbs(missing.map((entry) => entry.verb))} secrets
          in this folder.
        </span>
      </p>
      <Button variant="outline" size="xs" onClick={() => setOpen(true)}>
        Request access
      </Button>
      {open && (
        <RequestAccessSheet
          project={project}
          policies={policies}
          honeyTokens={Boolean(license.honeyTokens)}
          defaults={{ environment, secretPath, actions: missing.map((entry) => entry.action) }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};
