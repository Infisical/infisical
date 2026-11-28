import { useState } from "react";
import { Alert, AlertDescription } from "@infisical/cipher/ui/alert";
import { Icon } from "@infisical/cipher/ui/icon";

import { orgHref } from "../../../links";
import { usePendingApprovals } from "../../pending-approvals";
import { TabSection } from "../../SecretApprovalsPage/tabs";

import styles from "./overview.module.css";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const join = (parts: string[]) => parts.filter(Boolean).join(" and ");

export const PendingApprovalsLine = ({
  orgId,
  projectId
}: {
  orgId: string;
  projectId: string;
}) => {
  const { changesToReview, accessToReview, changesMine, accessMine } =
    usePendingApprovals(projectId);
  const key = `v4-pending-approvals:${projectId}`;
  const signature = [changesToReview, accessToReview, changesMine, accessMine].join(":");
  const [dismissed, setDismissed] = useState(() => window.sessionStorage.getItem(key));
  const toReview = changesToReview + accessToReview;
  const mine = changesMine + accessMine;
  if (!toReview && !mine) return null;
  if (dismissed === signature) return null;
  const tab = (changes: number) =>
    orgHref(
      orgId,
      `/projects/secret-management/${projectId}/approval?selectedTab=${
        changes ? TabSection.SecretApprovalRequests : TabSection.ResourceApprovalRequests
      }`
    );
  const dismiss = () => {
    window.sessionStorage.setItem(key, signature);
    setDismissed(signature);
  };
  return (
    <Alert tone="info" onDismiss={dismiss}>
      <Icon name="inbox" />
      <AlertDescription className={styles.approvalsText}>
        {toReview > 0 && (
          <span>
            {join([
              changesToReview ? plural(changesToReview, "change") : "",
              accessToReview ? plural(accessToReview, "access request") : ""
            ])}{" "}
            {toReview === 1 ? "needs" : "need"} your approval.{" "}
            <a href={tab(changesToReview)}>Review</a>
          </span>
        )}
        {mine > 0 && (
          <span>
            You have {plural(mine, "request")} waiting. <a href={tab(changesMine)}>View</a>
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
};
