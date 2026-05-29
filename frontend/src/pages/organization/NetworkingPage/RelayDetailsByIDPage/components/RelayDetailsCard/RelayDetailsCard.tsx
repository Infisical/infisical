import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  IconButton,
  Input,
  Separator
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { useUpdateRelay } from "@app/hooks/api/relays";
import { TRelayAuthMethodView, TRelayWithAuthMethod } from "@app/hooks/api/relays/types";

import { RelayAuthMethodModal } from "../RelayAuthMethod/RelayAuthMethodModal";

const HealthBadge = ({ relay }: { relay: TRelayWithAuthMethod }) => {
  if (!relay.heartbeat) {
    return <Badge variant="warning">Unregistered</Badge>;
  }
  const lastHeartbeat = new Date(relay.heartbeat);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (lastHeartbeat > oneHourAgo) {
    return <Badge variant="success">Healthy</Badge>;
  }
  return <Badge variant="danger">Unreachable</Badge>;
};

const AuthMethodBadge = ({ method }: { method: TRelayAuthMethodView["method"] }) => {
  if (method === "aws") return <Badge variant="info">AWS Auth</Badge>;
  if (method === "token") return <Badge variant="info">Token Auth</Badge>;
  return <Badge variant="warning">Machine Identity</Badge>;
};

const EditGeneralModal = ({
  isOpen,
  onOpenChange,
  relayId,
  currentHost
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  relayId: string;
  currentHost: string;
}) => {
  const [host, setHost] = useState(currentHost);
  const { mutateAsync: updateRelay, isPending } = useUpdateRelay();
  const { isSubOrganization } = useOrganization();

  const onSubmit = async () => {
    if (!host.trim()) return;
    try {
      await updateRelay({ relayId, host: host.trim() });
      createNotification({ type: "success", text: "Relay updated" });
      onOpenChange(false);
    } catch {
      createNotification({ type: "error", text: "Failed to update relay" });
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) setHost(currentHost);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Relay</DialogTitle>
          <DialogDescription>Update the relay host address.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Host</FieldLabel>
          <FieldContent>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="10.0.0.5 or relay.example.com"
            />
          </FieldContent>
        </Field>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={isSubOrganization ? "sub-org" : "org"}
            isPending={isPending}
            isDisabled={isPending || !host.trim() || host.trim() === currentHost}
            onClick={onSubmit}
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const RelayDetailsCard = ({ relay }: { relay: TRelayWithAuthMethod }) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [generalModalOpen, setGeneralModalOpen] = useState(false);
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { authMethod } = relay;
  const isIdentityRelay = authMethod.method === "identity";

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <DetailGroupHeader className="flex items-center justify-between">
              General
              <OrgPermissionCan
                I={OrgRelayPermissionActions.EditRelays}
                a={OrgPermissionSubjects.Relay}
              >
                {(isAllowed) => (
                  <IconButton
                    size="xs"
                    variant="ghost-muted"
                    aria-label="edit general"
                    isDisabled={!isAllowed}
                    onClick={() => setGeneralModalOpen(true)}
                  >
                    <PencilIcon />
                  </IconButton>
                )}
              </OrgPermissionCan>
            </DetailGroupHeader>
            <Detail>
              <DetailLabel>ID</DetailLabel>
              <DetailValue className="flex items-center gap-x-1">
                <span className="font-mono text-xs">{relay.id}</span>
                <IconButton
                  aria-label="copy relay id"
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
            <Detail>
              <DetailLabel>Host</DetailLabel>
              <DetailValue>{relay.host}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Health</DetailLabel>
              <DetailValue>
                <HealthBadge relay={relay} />
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Last Heartbeat</DetailLabel>
              <DetailValue>
                {relay.heartbeat ? (
                  format(new Date(relay.heartbeat), "PPpp")
                ) : (
                  <span className="text-muted">&mdash;</span>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Created</DetailLabel>
              <DetailValue>{format(new Date(relay.createdAt), "PPpp")}</DetailValue>
            </Detail>
          </DetailGroup>
          <Separator className="my-4" />
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
                      aria-label="edit auth method"
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
                <AlertTitle>Authenticated via Machine Identity (Legacy)</AlertTitle>
                <AlertDescription>
                  <p>
                    This relay is still using machine identity. We recommend creating a new relay.
                  </p>
                  <Link
                    to="/organizations/$orgId/networking"
                    params={{ orgId }}
                    search={{ selectedTab: "relays" }}
                    className="underline underline-offset-4"
                  >
                    Create a new relay
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            {!isIdentityRelay && (
              <Detail>
                <DetailLabel>Method</DetailLabel>
                <DetailValue>
                  <AuthMethodBadge method={authMethod.method} />
                </DetailValue>
              </Detail>
            )}
            {authMethod.method === "aws" && (
              <>
                <Detail>
                  <DetailLabel>STS Endpoint</DetailLabel>
                  <DetailValue>{authMethod.config.stsEndpoint}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Allowed Principal ARNs</DetailLabel>
                  <DetailValue>
                    {authMethod.config.allowedPrincipalArns || (
                      <span className="text-muted">&mdash;</span>
                    )}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Allowed Account IDs</DetailLabel>
                  <DetailValue>
                    {authMethod.config.allowedAccountIds || (
                      <span className="text-muted">&mdash;</span>
                    )}
                  </DetailValue>
                </Detail>
              </>
            )}
            {authMethod.method === "identity" && authMethod.config.identityName && (
              <Detail>
                <DetailLabel>Machine Identity</DetailLabel>
                <DetailValue>{authMethod.config.identityName}</DetailValue>
              </Detail>
            )}
          </DetailGroup>
        </CardContent>
      </Card>

      <EditGeneralModal
        isOpen={generalModalOpen}
        onOpenChange={setGeneralModalOpen}
        relayId={relay.id}
        currentHost={relay.host}
      />

      {!isIdentityRelay && (
        <RelayAuthMethodModal
          isOpen={authModalOpen}
          onOpenChange={setAuthModalOpen}
          relayId={relay.id}
          currentMethod={authMethod}
        />
      )}
    </>
  );
};
