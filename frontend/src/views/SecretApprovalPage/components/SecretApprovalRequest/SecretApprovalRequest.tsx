import { useState } from "react";
import { faCheck, faCodeBranch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

import { useWorkspace } from "@app/context";
import { useGetSecretApprovalRequests, useGetWorkspaceUsers } from "@app/hooks/api";
import { TSecretApprovalRequest, TWorkspaceUser } from "@app/hooks/api/types";

import {
  generateCommitText,
  SecretApprovalRequestChanges
} from "./components/SecretApprovalRequestChanges";

export const SecretApprovalRequest = () => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?._id || "";
  const [selectedApproval, setSelectedApproval] = useState<TSecretApprovalRequest | null>(null);

  const { data: secretApprovalRequests } = useGetSecretApprovalRequests({ workspaceId });
  const { data: members } = useGetWorkspaceUsers(workspaceId);
  const membersGroupById = members?.reduce<Record<string, TWorkspaceUser>>(
    (prev, curr) => ({ ...prev, [curr._id]: curr }),
    {}
  );

  const isSecretApprovalScreen = Boolean(selectedApproval);

  return (
    <AnimatePresence exitBeforeEnter>
      {isSecretApprovalScreen ? (
        <motion.div
          key="approval-changes-details"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: 30 }}
        >
          <SecretApprovalRequestChanges
            workspaceId={workspaceId}
            members={membersGroupById}
            approvalRequestId={selectedApproval?._id || ""}
            onGoBack={() => setSelectedApproval(null)}
            committer={membersGroupById?.[selectedApproval?.committer || ""]}
          />
        </motion.div>
      ) : (
        <motion.div
          key="approval-changes-list"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: -30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
          className="rounded-md bg-mineshaft-800 text-gray-300"
        >
          <div className="p-4 px-8 flex items-center space-x-8">
            <div>
              <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
              27 Open
            </div>
            <div className="text-gray-500">
              <FontAwesomeIcon icon={faCheck} className="mr-2" />
              27 Closed
            </div>
          </div>
          <div className="flex flex-col border-t border-mineshaft-600">
            {secretApprovalRequests?.map((secretApproval) => {
              const { _id: reqId, commits, committer } = secretApproval;
              return (
                <div
                  key={reqId}
                  className="flex flex-col px-8 py-4 hover:bg-mineshaft-700"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedApproval(secretApproval)}
                  onKeyDown={(evt) => {
                    if (evt.key === "Enter") setSelectedApproval(secretApproval);
                  }}
                >
                  <div className="mb-1">
                    <FontAwesomeIcon icon={faCodeBranch} className="mr-2" />
                    {generateCommitText(commits)}
                  </div>
                  <span className="text-xs text-gray-500">
                    Opened 2 hours ago by {membersGroupById?.[committer]?.user?.firstName}{" "}
                    {membersGroupById?.[committer]?.user?.lastName} (
                    {membersGroupById?.[committer]?.user?.email}) - Review required
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
