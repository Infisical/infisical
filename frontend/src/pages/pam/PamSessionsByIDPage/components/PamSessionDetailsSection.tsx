import { useState } from "react";
import { faCheck, faCopy, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { GavelIcon, PackageOpenIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton, Tooltip } from "@app/components/v2";
import { Badge, Button } from "@app/components/v3";
import { ProjectPermissionPamSessionActions, ProjectPermissionSub } from "@app/context";
import { useTimedReset } from "@app/hooks";
import {
  PAM_RESOURCE_TYPE_MAP,
  PamSessionStatus,
  TPamSession,
  useTerminatePamSession
} from "@app/hooks/api/pam";

import { PamSessionStatusBadge } from "../../PamSessionsPage/components/PamSessionStatusBadge";

type Props = {
  session: TPamSession;
};

const DetailItem = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="font-medium">{label}</p>
    {children}
  </div>
);

export const PamSessionDetailsSection = ({
  session: {
    id,
    projectId,
    accountName,
    resourceType,
    resourceName,
    status,
    actorName,
    actorEmail,
    createdAt,
    endedAt,
    actorIp,
    actorUserAgent,
    startedAt,
    expiresAt,
    gatewayIdentityId
  }
}: Props) => {
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);
  const terminateSession = useTerminatePamSession();

  const isActive = status === PamSessionStatus.Active || status === PamSessionStatus.Starting;
  const isGatewaySession = !!gatewayIdentityId;

  const details = PAM_RESOURCE_TYPE_MAP[resourceType];

  return (
    <div className="max-w-[350px] rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Session Details</h3>
      </div>
      <div className="pt-4 text-sm text-mineshaft-300">
        <DetailItem label="Session ID">
          <div className="group flex align-top">
            <p className="truncate">{id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(id);
                    setCopyTextId("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingId ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </DetailItem>

        <DetailItem label="Account">
          <div className="flex items-center gap-2">
            <img
              alt={`${details.name} logo`}
              src={`/images/integrations/${details.image}`}
              className="size-4"
            />
            <p>{accountName}</p>
            <Badge variant="neutral">
              <PackageOpenIcon />
              {resourceName}
            </Badge>
          </div>
        </DetailItem>

        <DetailItem label="Actor">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faUser} className="-translate-y-px" />
            <p>
              <strong>{actorName}</strong> ({actorEmail})
            </p>
          </div>
        </DetailItem>

        <DetailItem label="Status">
          <div className="flex items-center gap-2">
            <PamSessionStatusBadge status={status} />
            {isActive && isGatewaySession && (
              <ProjectPermissionCan
                I={ProjectPermissionPamSessionActions.Terminate}
                a={ProjectPermissionSub.PamSessions}
              >
                {(isAllowed: boolean) => (
                  <Button
                    variant="danger"
                    size="xs"
                    disabled={!isAllowed}
                    onClick={() => setIsTerminateModalOpen(true)}
                  >
                    <GavelIcon size={12} />
                    Terminate
                  </Button>
                )}
              </ProjectPermissionCan>
            )}
          </div>
        </DetailItem>

        <DetailItem label="IP Address">
          <p>{actorIp}</p>
        </DetailItem>

        <DetailItem label="User Agent">
          <p className="truncate">{actorUserAgent}</p>
        </DetailItem>

        <DetailItem label="Created At">
          <p>{new Date(createdAt).toLocaleString()}</p>
        </DetailItem>

        <DetailItem label="Expires At">
          <p>{expiresAt ? new Date(expiresAt).toLocaleString() : "Never"}</p>
        </DetailItem>

        <DetailItem label="Started At">
          <p>{startedAt ? new Date(startedAt).toLocaleString() : "Not Started"}</p>
        </DetailItem>

        <DetailItem label="Ended At">
          <p>{endedAt ? new Date(endedAt).toLocaleString() : "Ongoing"}</p>
        </DetailItem>
      </div>

      <DeleteActionModal
        isOpen={isTerminateModalOpen}
        onChange={(open) => setIsTerminateModalOpen(open)}
        title="Terminate Session"
        deleteKey="terminate"
        onDeleteApproved={async () => {
          await terminateSession.mutateAsync({ sessionId: id, projectId });
          setIsTerminateModalOpen(false);
        }}
        buttonText="Terminate"
      >
        <p className="text-sm text-mineshaft-300">
          Are you sure you want to terminate this session? The user&apos;s connection will be
          immediately dropped.
        </p>
      </DeleteActionModal>
    </div>
  );
};
