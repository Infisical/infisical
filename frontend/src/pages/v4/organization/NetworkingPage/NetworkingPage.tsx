import { useEffect, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import {
  OrgGatewayPermissionActions,
  OrgGatewayPoolPermissionActions,
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";

import { useOrgPermission } from "../../access/permissions";
import { Gate } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { GatewaysPanel } from "./gateways";
import { RelaysPanel } from "./relays";
import { UpgradeDialog } from "./upgrade-dialog";

const routeId = v4Path("/organizations/$orgId/networking/");

const docs = {
  "all-gateways": "https://infisical.com/docs/documentation/platform/gateways/overview",
  "gateway-pools": "https://infisical.com/docs/documentation/platform/gateways/gateway-pools",
  relays: "https://infisical.com/docs/documentation/platform/gateways/relay-deployment"
};

export type NetworkingDialog = "gateway" | "pool" | "relay" | "upgrade";

export const NetworkingPage = () => {
  const { orgId } = useParams({ from: routeId });
  const { selectedTab, gatewayView = "all-gateways", action } = useSearch({ from: routeId });
  const navigate = useNavigate({ from: v4Path("/organizations/$orgId/networking") });
  const { permission } = useOrgPermission();
  const { data: subscription } = useV4Adapter("networking").useSubscription(orgId);
  const [dialog, setDialog] = useState<NetworkingDialog>();
  const isRelays = selectedTab === "relays";
  const isPools = !isRelays && gatewayView === "gateway-pools";

  useEffect(() => {
    if (action !== "deploy-relay") return;
    setDialog("relay");
    navigate({ search: (prev) => ({ ...prev, action: undefined }), replace: true });
  }, [action, navigate]);

  const canCreateGateway = permission.can(
    OrgGatewayPermissionActions.CreateGateways,
    OrgPermissionSubjects.Gateway
  );
  const canCreatePool = permission.can(
    OrgGatewayPoolPermissionActions.CreateGatewayPools,
    OrgPermissionSubjects.GatewayPool
  );
  const canCreateRelay = permission.can(
    OrgRelayPermissionActions.CreateRelays,
    OrgPermissionSubjects.Relay
  );

  let create = (
    <Gate allowed={canCreateGateway}>
      <Button
        variant="accent"
        icon="plus"
        disabled={!canCreateGateway}
        onClick={() => setDialog("gateway")}
      >
        Create gateway
      </Button>
    </Gate>
  );
  if (isPools)
    create = (
      <Gate allowed={canCreatePool}>
        <Button
          variant="accent"
          icon="plus"
          disabled={!canCreatePool}
          onClick={() => setDialog(subscription?.gatewayPool ? "pool" : "upgrade")}
        >
          Create pool
        </Button>
      </Gate>
    );
  if (isRelays)
    create = (
      <Gate allowed={canCreateRelay}>
        <Button
          variant="accent"
          icon="plus"
          disabled={!canCreateRelay}
          onClick={() => setDialog("relay")}
        >
          Create relay
        </Button>
      </Gate>
    );

  const closeDialog = () => setDialog(undefined);

  return (
    <Stack gap={24}>
      <PageHeader
        title="Networking"
        description="Gateways and relays connect Infisical to your private infrastructure."
        badges={<DocumentationLinkBadge href={docs[isRelays ? "relays" : gatewayView]} />}
        actions={create}
        tabs={
          <Tabs
            label="Networking sections"
            value={isRelays ? "relays" : "gateways"}
            onChange={(value) =>
              navigate({
                search: { selectedTab: value as "gateways" | "relays" },
                replace: true
              })
            }
            tabs={[
              { value: "gateways", label: "Gateways", content: null },
              { value: "relays", label: "Relays", content: null }
            ]}
          />
        }
      />
      {isRelays ? (
        <RelaysPanel creating={dialog === "relay"} onCloseCreate={closeDialog} />
      ) : (
        <GatewaysPanel
          view={gatewayView}
          onViewChange={(view) =>
            navigate({ search: (prev) => ({ ...prev, gatewayView: view }), replace: true })
          }
          dialog={dialog}
          onDialogChange={setDialog}
        />
      )}
      <UpgradeDialog open={dialog === "upgrade"} onOpenChange={(open) => !open && closeDialog()} />
    </Stack>
  );
};
