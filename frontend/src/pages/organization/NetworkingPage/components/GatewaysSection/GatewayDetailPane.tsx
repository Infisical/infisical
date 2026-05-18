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
  HeartPulseIcon,
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
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { usePopUp, useTimedReset } from "@app/hooks";
import {
  useDeleteGatewayV2ById,
  useGetGatewayV2ById,
  useMintGatewayToken,
  useRevokeGatewayAccess,
  useTriggerGatewayV2Heartbeat
} from "@app/hooks/api/gateways-v2";
import {
  GatewayAuthMethodView,
  GatewayHealthCheckStatus,
  TGatewayV2WithAuthMethod
} from "@app/hooks/api/gateways-v2/types";

import { AwsStartCommandDialog } from "../../GatewayDetailsByIDPage/components/GatewayAuthMethod/AwsStartCommandDialog";
import { EnrollmentTokenDialog } from "../../GatewayDetailsByIDPage/components/GatewayAuthMethod/EnrollmentTokenDialog";
import { GatewayAuthMethodModal } from "../../GatewayDetailsByIDPage/components/GatewayAuthMethod/GatewayAuthMethodModal";
import { ViewGatewayAuth } from "../../GatewayDetailsByIDPage/components/GatewayAuthMethod/ViewGatewayAuth";
import { GatewayConnectedResourcesSection } from "../../GatewayDetailsByIDPage/components/GatewayConnectedResourcesSection/GatewayConnectedResourcesSection";

type Props = {
  gatewayId: string | null;
  onBack?: () => void;
};

const HealthBadge = ({ gateway }: { gateway: TGatewayV2WithAuthMethod }) => {
  if (!gateway.heartbeat && !gateway.lastHealthCheckStatus) {
    return <Badge variant="warning">Pending</Badge>;
  }
  if (gateway.lastHealthCheckStatus === GatewayHealthCheckStatus.Healthy) {
    return <Badge variant="success">Healthy</Badge>;
  }
  return <Badge variant="danger">Unreachable</Badge>;
};

const AuthMethodBadge = ({ method }: { method: GatewayAuthMethodView["method"] }) => {
  if (method === "aws") return <Badge variant="info">AWS Auth</Badge>;
  if (method === "token") return <Badge variant="info">Token Auth</Badge>;
  return <Badge variant="warning">Machine Identity</Badge>;
};

const GatewayDetail = ({
  gateway,
  onBack
}: {
  gateway: TGatewayV2WithAuthMethod;
  onBack?: () => void;
}) => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";

  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({ initialState: "" });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [showAwsCommand, setShowAwsCommand] = useState(false);
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);

  const { mutateAsync: deleteGateway } = useDeleteGatewayV2ById();
  const { mutateAsync: revokeGateway } = useRevokeGatewayAccess();
  const { mutateAsync: triggerHeartbeat, isPending: isHeartbeating } =
    useTriggerGatewayV2Heartbeat();
  const { mutateAsync: mint, isPending: isMinting } = useMintGatewayToken();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteGateway",
    "revokeGateway"
  ] as const);

  const { authMethod } = gateway;
  const isIdentityGateway = authMethod.method === "identity";
  const isRegistered = Boolean(gateway.heartbeat || gateway.lastHealthCheckStatus);

  const onDelete = async () => {
    await deleteGateway(gateway.id);
    createNotification({ type: "success", text: "Successfully deleted gateway" });
    navigate({
      to: "/organizations/$orgId/networking",
      params: { orgId },
      search: { selectedTab: "gateways" }
    });
  };

  const onRevoke = async () => {
    try {
      await revokeGateway({ gatewayId: gateway.id });
      createNotification({ type: "success", text: "Gateway access revoked" });
      handlePopUpToggle("revokeGateway", false);
    } catch {
      createNotification({ type: "error", text: "Failed to revoke gateway access" });
    }
  };

  const handleDeployClick = async () => {
    if (authMethod.method === "aws") {
      setShowAwsCommand(true);
      return;
    }
    try {
      const result = await mint({ gatewayId: gateway.id });
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
              {gateway.name}
              <Badge variant="neutral">v2</Badge>
            </span>
            <div className="flex items-center gap-2">
              {!isIdentityGateway && (
                <OrgPermissionCan
                  I={OrgGatewayPermissionActions.EditGateways}
                  a={OrgPermissionSubjects.Gateway}
                >
                  {(isAllowed) => {
                    let deployVariant: "neutral" | "org" | "sub-org" = "neutral";
                    if (!gateway.heartbeat) deployVariant = isSubOrganization ? "sub-org" : "org";
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
                      navigator.clipboard.writeText(gateway.id);
                      createNotification({ type: "info", text: "Gateway ID copied" });
                    }}
                  >
                    <CopyIcon />
                    Copy ID
                  </DropdownMenuItem>
                  {isRegistered && (
                    <DropdownMenuItem
                      isDisabled={isHeartbeating}
                      onClick={async () => {
                        try {
                          await triggerHeartbeat(gateway.id);
                          createNotification({ type: "success", text: "Health check successful" });
                        } catch {
                          createNotification({ type: "error", text: "Health check failed" });
                        }
                      }}
                    >
                      <HeartPulseIcon />
                      Health Check
                    </DropdownMenuItem>
                  )}
                  {gateway.canRevoke && (
                    <OrgPermissionCan
                      I={OrgGatewayPermissionActions.RevokeGatewayAccess}
                      a={OrgPermissionSubjects.Gateway}
                    >
                      {(isAllowed) => (
                        <DropdownMenuItem
                          variant="danger"
                          isDisabled={!isAllowed}
                          onClick={() => handlePopUpOpen("revokeGateway")}
                        >
                          <BanIcon />
                          Revoke Access
                        </DropdownMenuItem>
                      )}
                    </OrgPermissionCan>
                  )}
                  <OrgPermissionCan
                    I={OrgGatewayPermissionActions.DeleteGateways}
                    a={OrgPermissionSubjects.Gateway}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        variant="danger"
                        isDisabled={!isAllowed}
                        onClick={() => handlePopUpOpen("deleteGateway")}
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
                  <span className="font-mono text-xs">{gateway.id}</span>
                  <IconButton
                    aria-label="copy id"
                    onClick={() => {
                      navigator.clipboard.writeText(gateway.id);
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
                <DetailLabel className="w-32 shrink-0">Health</DetailLabel>
                <DetailValue>
                  <HealthBadge gateway={gateway} />
                </DetailValue>
              </Detail>
              <Detail className="flex-row items-center gap-4">
                <DetailLabel className="w-32 shrink-0">Last Heartbeat</DetailLabel>
                <DetailValue>
                  {gateway.heartbeat ? (
                    format(new Date(gateway.heartbeat), "PPpp")
                  ) : (
                    <span className="text-muted">&mdash;</span>
                  )}
                </DetailValue>
              </Detail>
              <Detail className="flex-row items-center gap-4">
                <DetailLabel className="w-32 shrink-0">Created</DetailLabel>
                <DetailValue>{format(new Date(gateway.createdAt), "PPpp")}</DetailValue>
              </Detail>
            </DetailGroup>

            <Separator />

            {/* Authentication */}
            <DetailGroup>
              <DetailGroupHeader className="flex items-center justify-between">
                Authentication
                {!isIdentityGateway && (
                  <OrgPermissionCan
                    I={OrgGatewayPermissionActions.EditGateways}
                    a={OrgPermissionSubjects.Gateway}
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
              {isIdentityGateway && (
                <Alert variant="warning">
                  <TriangleAlertIcon />
                  <AlertTitle>Machine Identity (Legacy)</AlertTitle>
                  <AlertDescription>
                    This gateway uses legacy machine identity auth. Create a new gateway instead.
                  </AlertDescription>
                </Alert>
              )}
              {!isIdentityGateway && (
                <Detail className="flex-row items-center gap-4">
                  <DetailLabel className="w-32 shrink-0">Method</DetailLabel>
                  <DetailValue>
                    <AuthMethodBadge method={authMethod.method} />
                  </DetailValue>
                </Detail>
              )}
              <ViewGatewayAuth authMethod={authMethod} />
            </DetailGroup>

            <Separator />

            {/* Connected Resources */}
            <GatewayConnectedResourcesSection gatewayId={gateway.id} />
          </div>
        </div>
      </div>

      {/* Modals */}
      {!isIdentityGateway && (
        <GatewayAuthMethodModal
          isOpen={authModalOpen}
          onOpenChange={setAuthModalOpen}
          gatewayId={gateway.id}
          currentMethod={authMethod}
        />
      )}
      {authMethod.method === "aws" && (
        <AwsStartCommandDialog
          isOpen={showAwsCommand}
          onOpenChange={setShowAwsCommand}
          gatewayId={gateway.id}
          gatewayName={gateway.name}
        />
      )}
      {enrollmentToken && (
        <EnrollmentTokenDialog
          isOpen
          onOpenChange={(open) => !open && setEnrollmentToken(null)}
          gatewayName={gateway.name}
          enrollmentToken={enrollmentToken}
        />
      )}
      <DeleteActionModal
        isOpen={popUp.deleteGateway.isOpen}
        title={`Delete gateway "${gateway.name}"?`}
        onChange={(isOpen) => handlePopUpToggle("deleteGateway", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={onDelete}
      />
      <DeleteActionModal
        isOpen={popUp.revokeGateway.isOpen}
        title={`Revoke access for "${gateway.name}"?`}
        subTitle="The gateway will be disconnected and any active tokens will be invalidated."
        onChange={(isOpen) => handlePopUpToggle("revokeGateway", isOpen)}
        deleteKey="confirm"
        buttonText="Revoke access"
        onDeleteApproved={onRevoke}
      />
    </>
  );
};

export const GatewayDetailPane = ({ gatewayId, onBack }: Props) => {
  const { data: gateway, isPending } = useGetGatewayV2ById(gatewayId ?? "");

  if (!gatewayId) {
    return (
      <Empty className="h-full w-full">
        <EmptyHeader>
          <EmptyTitle>Select a gateway to view details</EmptyTitle>
          <EmptyDescription>
            Choose a gateway from the list to see its configuration, authentication, and connected
            resources.
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

  if (!gateway) {
    return (
      <Empty className="h-full w-full">
        <EmptyHeader>
          <EmptyTitle>Gateway not found</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return <GatewayDetail gateway={gateway} onBack={onBack} />;
};
