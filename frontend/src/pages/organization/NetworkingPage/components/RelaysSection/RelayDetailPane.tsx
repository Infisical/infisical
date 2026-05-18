import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  BanIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClipboardListIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  RocketIcon,
  TrashIcon,
  TriangleAlertIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Separator
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { usePopUp, useTimedReset } from "@app/hooks";
import {
  useDeleteRelayById,
  useGenerateRelayEnrollmentToken,
  useGetRelayById,
  useRevokeRelayAccess
} from "@app/hooks/api/relays";
import { TRelayAuthMethodView, TRelayWithAuthMethod } from "@app/hooks/api/relays/types";

import { RelayAuthMethodModal } from "../../RelayDetailsByIDPage/components/RelayAuthMethod/RelayAuthMethodModal";
import { RelayEnrollmentTokenDialog } from "../../RelayDetailsByIDPage/components/RelayDeploySection/RelayEnrollmentTokenDialog";

type Props = {
  relayId: string | null;
  onBack?: () => void;
};

const HealthBadge = ({ relay }: { relay: TRelayWithAuthMethod }) => {
  if (!relay.heartbeat) return <Badge variant="warning">Pending</Badge>;
  const lastHeartbeat = new Date(relay.heartbeat);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (lastHeartbeat > oneHourAgo) return <Badge variant="success">Healthy</Badge>;
  return <Badge variant="danger">Unreachable</Badge>;
};

const AuthMethodBadge = ({ method }: { method: TRelayAuthMethodView["method"] }) => {
  if (method === "aws") return <Badge variant="info">AWS Auth</Badge>;
  if (method === "token") return <Badge variant="info">Token Auth</Badge>;
  return <Badge variant="warning">Machine Identity</Badge>;
};

const RelayDetail = ({ relay, onBack }: { relay: TRelayWithAuthMethod; onBack?: () => void }) => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";

  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({ initialState: "" });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);

  const { mutateAsync: deleteRelay } = useDeleteRelayById();
  const { mutateAsync: revokeRelay } = useRevokeRelayAccess();
  const { mutateAsync: mint, isPending: isMinting } = useGenerateRelayEnrollmentToken();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteRelay",
    "revokeRelay"
  ] as const);

  const { authMethod } = relay;
  const isIdentityRelay = authMethod.method === "identity";

  const onDelete = async () => {
    await deleteRelay(relay.id);
    createNotification({ type: "success", text: "Successfully deleted relay" });
    navigate({
      to: "/organizations/$orgId/networking",
      params: { orgId },
      search: { selectedTab: "relays" }
    });
  };

  const onRevoke = async () => {
    try {
      await revokeRelay({ relayId: relay.id });
      createNotification({ type: "success", text: "Relay access revoked" });
      handlePopUpToggle("revokeRelay", false);
    } catch {
      createNotification({ type: "error", text: "Failed to revoke relay access" });
    }
  };

  const handleDeployClick = async () => {
    if (authMethod.method === "aws") {
      createNotification({
        type: "info",
        text: "AWS deploy command not yet implemented for relays"
      });
      return;
    }
    try {
      const result = await mint({ relayId: relay.id });
      setEnrollmentToken(result.token);
    } catch {
      createNotification({ type: "error", text: "Failed to generate enrollment token" });
    }
  };

  return (
    <>
      <div className="flex h-full w-full flex-col">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-base font-semibold">
              {onBack && (
                <button type="button" onClick={onBack} className="dashboard:hidden">
                  <ChevronLeftIcon size={18} />
                </button>
              )}
              {relay.name}
            </span>
            <div className="flex items-center gap-2">
              {!isIdentityRelay && (
                <OrgPermissionCan
                  I={OrgRelayPermissionActions.EditRelays}
                  a={OrgPermissionSubjects.Relay}
                >
                  {(isAllowed) => {
                    let deployVariant: "neutral" | "org" | "sub-org" = "neutral";
                    if (!relay.heartbeat) deployVariant = isSubOrganization ? "sub-org" : "org";
                    return (
                      <Button
                        variant={deployVariant}
                        size="sm"
                        isPending={isMinting}
                        isDisabled={!isAllowed || isMinting}
                        onClick={handleDeployClick}
                      >
                        <RocketIcon className="size-3.5" />
                        Deploy
                      </Button>
                    );
                  }}
                </OrgPermissionCan>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <EllipsisVerticalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={2}>
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(relay.id);
                      createNotification({ type: "info", text: "Relay ID copied" });
                    }}
                  >
                    <CopyIcon />
                    Copy ID
                  </DropdownMenuItem>
                  {relay.canRevoke && (
                    <OrgPermissionCan
                      I={OrgRelayPermissionActions.RevokeRelayAccess}
                      a={OrgPermissionSubjects.Relay}
                    >
                      {(isAllowed) => (
                        <DropdownMenuItem
                          variant="danger"
                          isDisabled={!isAllowed}
                          onClick={() => handlePopUpOpen("revokeRelay")}
                        >
                          <BanIcon />
                          Revoke Access
                        </DropdownMenuItem>
                      )}
                    </OrgPermissionCan>
                  )}
                  <OrgPermissionCan
                    I={OrgRelayPermissionActions.DeleteRelays}
                    a={OrgPermissionSubjects.Relay}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        variant="danger"
                        isDisabled={!isAllowed}
                        onClick={() => handlePopUpOpen("deleteRelay")}
                      >
                        <TrashIcon />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="flex-1 p-4">
          <div className="flex flex-col gap-6">
            {/* General */}
            <DetailGroup>
              <DetailGroupHeader>General</DetailGroupHeader>
              <Detail className="flex-row items-center gap-4">
                <DetailLabel className="w-32 shrink-0">ID</DetailLabel>
                <DetailValue className="flex items-center gap-x-1">
                  <span className="font-mono text-xs">{relay.id}</span>
                  <IconButton
                    aria-label="copy id"
                    onClick={() => {
                      navigator.clipboard.writeText(relay.id);
                      setCopyTextId("Copied");
                    }}
                    variant="ghost"
                    size="xs"
                  >
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </IconButton>
                </DetailValue>
              </Detail>
              <Detail className="flex-row items-center gap-4">
                <DetailLabel className="w-32 shrink-0">Host</DetailLabel>
                <DetailValue>{relay.host}</DetailValue>
              </Detail>
              <Detail className="flex-row items-center gap-4">
                <DetailLabel className="w-32 shrink-0">Health</DetailLabel>
                <DetailValue>
                  <HealthBadge relay={relay} />
                </DetailValue>
              </Detail>
              <Detail className="flex-row items-center gap-4">
                <DetailLabel className="w-32 shrink-0">Last Heartbeat</DetailLabel>
                <DetailValue>
                  {relay.heartbeat ? (
                    format(new Date(relay.heartbeat), "PPpp")
                  ) : (
                    <span className="text-muted">&mdash;</span>
                  )}
                </DetailValue>
              </Detail>
              <Detail className="flex-row items-center gap-4">
                <DetailLabel className="w-32 shrink-0">Created</DetailLabel>
                <DetailValue>{format(new Date(relay.createdAt), "PPpp")}</DetailValue>
              </Detail>
            </DetailGroup>

            <Separator />

            {/* Authentication */}
            <DetailGroup>
              <DetailGroupHeader className="flex items-center justify-between">
                Authentication
                {!isIdentityRelay && (
                  <OrgPermissionCan
                    I={OrgRelayPermissionActions.EditRelays}
                    a={OrgPermissionSubjects.Relay}
                  >
                    {(isAllowed) => (
                      <IconButton
                        size="xs"
                        variant="ghost-muted"
                        aria-label="edit auth"
                        isDisabled={!isAllowed}
                        onClick={() => setAuthModalOpen(true)}
                      >
                        <PencilIcon />
                      </IconButton>
                    )}
                  </OrgPermissionCan>
                )}
              </DetailGroupHeader>
              {isIdentityRelay && (
                <Alert variant="warning">
                  <TriangleAlertIcon />
                  <AlertTitle>Machine Identity (Legacy)</AlertTitle>
                  <AlertDescription>
                    This relay uses legacy machine identity auth. Create a new relay instead.
                  </AlertDescription>
                </Alert>
              )}
              {!isIdentityRelay && (
                <Detail className="flex-row items-center gap-4">
                  <DetailLabel className="w-32 shrink-0">Method</DetailLabel>
                  <DetailValue>
                    <AuthMethodBadge method={authMethod.method} />
                  </DetailValue>
                </Detail>
              )}
              {authMethod.method === "aws" && (
                <>
                  <Detail className="flex-row items-center gap-4">
                    <DetailLabel className="w-32 shrink-0">STS Endpoint</DetailLabel>
                    <DetailValue>{authMethod.config.stsEndpoint}</DetailValue>
                  </Detail>
                  <Detail className="flex-row items-center gap-4">
                    <DetailLabel className="w-32 shrink-0">Allowed Principal ARNs</DetailLabel>
                    <DetailValue>
                      {authMethod.config.allowedPrincipalArns || (
                        <span className="text-muted">&mdash;</span>
                      )}
                    </DetailValue>
                  </Detail>
                  <Detail className="flex-row items-center gap-4">
                    <DetailLabel className="w-32 shrink-0">Allowed Account IDs</DetailLabel>
                    <DetailValue>
                      {authMethod.config.allowedAccountIds || (
                        <span className="text-muted">&mdash;</span>
                      )}
                    </DetailValue>
                  </Detail>
                </>
              )}
              {authMethod.method === "identity" && authMethod.config.identityName && (
                <Detail className="flex-row items-center gap-4">
                  <DetailLabel className="w-32 shrink-0">Machine Identity</DetailLabel>
                  <DetailValue>{authMethod.config.identityName}</DetailValue>
                </Detail>
              )}
            </DetailGroup>
          </div>
        </div>
      </div>

      {!isIdentityRelay && (
        <RelayAuthMethodModal
          isOpen={authModalOpen}
          onOpenChange={setAuthModalOpen}
          relayId={relay.id}
          currentMethod={authMethod}
        />
      )}
      {enrollmentToken && (
        <RelayEnrollmentTokenDialog
          isOpen
          onOpenChange={(open) => !open && setEnrollmentToken(null)}
          relayName={relay.name}
          enrollmentToken={enrollmentToken}
        />
      )}
      <DeleteActionModal
        isOpen={popUp.deleteRelay.isOpen}
        title={`Delete relay "${relay.name}"?`}
        onChange={(isOpen) => handlePopUpToggle("deleteRelay", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={onDelete}
      />
      <DeleteActionModal
        isOpen={popUp.revokeRelay.isOpen}
        title={`Revoke access for "${relay.name}"?`}
        subTitle="The relay will be disconnected and any active tokens will be invalidated."
        onChange={(isOpen) => handlePopUpToggle("revokeRelay", isOpen)}
        deleteKey="confirm"
        buttonText="Revoke access"
        onDeleteApproved={onRevoke}
      />
    </>
  );
};

export const RelayDetailPane = ({ relayId, onBack }: Props) => {
  const { data: relay, isPending } = useGetRelayById(relayId ?? "");

  if (!relayId) {
    return (
      <Empty className="h-full w-full">
        <EmptyHeader>
          <EmptyTitle>Select a relay to view details</EmptyTitle>
          <EmptyDescription>
            Choose a relay from the list to see its configuration and authentication.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isPending) {
    return (
      <Empty className="h-full w-full">
        <EmptyHeader>
          <EmptyTitle>Loading...</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!relay) {
    return (
      <Empty className="h-full w-full">
        <EmptyHeader>
          <EmptyTitle>Relay not found</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return <RelayDetail relay={relay} onBack={onBack} />;
};
