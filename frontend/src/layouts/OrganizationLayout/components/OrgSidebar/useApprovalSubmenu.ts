import { DoorOpen, FileKey, Shield } from "lucide-react";

import { useProject } from "@app/context";
import { useGetAccessRequestsCount, useGetSecretApprovalRequestCount } from "@app/hooks/api";

import type { Submenu } from "./types";

export const useApprovalSubmenu = (): {
  submenu: Submenu;
  pendingRequestsCount: number;
} => {
  const { currentProject, projectId } = useProject();

  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({ projectId });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({
    projectSlug: currentProject?.slug || ""
  });

  const pendingRequestsCount =
    (secretApprovalReqCount?.open || 0) + (accessApprovalRequestCount?.pendingCount || 0);

  return {
    submenu: {
      title: "Approvals",
      pathSuffix: "approval",
      defaultTab: "approval-requests",
      items: [
        {
          label: "Change Requests",
          icon: FileKey,
          tab: "approval-requests",
          badgeCount: secretApprovalReqCount?.open || undefined
        },
        {
          label: "Access Requests",
          icon: DoorOpen,
          tab: "resource-requests",
          badgeCount: accessApprovalRequestCount?.pendingCount || undefined
        },
        { label: "Policies", icon: Shield, tab: "policies" }
      ]
    },
    pendingRequestsCount
  };
};
