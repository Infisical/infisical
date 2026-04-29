import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { NoticeBannerV2, Spinner } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from "@app/components/v3";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";

import { GatewayAuthMethod } from "./AuthMethodComponentMap";
import { GatewayAuthMethodModal } from "./GatewayAuthMethodModal";
import { useAttachedAuthMethods } from "./useAttachedAuthMethods";
import { ViewGatewayAuth } from "./ViewGatewayAuth";

type Props = {
  gatewayId: string;
  gatewayName: string;
  identity: { id: string; name: string } | null;
};

export const GatewayAuthenticationSection = ({ gatewayId, gatewayName, identity }: Props) => {
  const { attached, isPending } = useAttachedAuthMethods(gatewayId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMethod, setEditMethod] = useState<GatewayAuthMethod | null>(null);

  const hasAuthMethods = attached.length > 0;
  const isIdentityGateway = Boolean(identity);

  const openAdd = () => {
    setEditMethod(null);
    setModalOpen(true);
  };

  const openEdit = (method: GatewayAuthMethod) => {
    setEditMethod(method);
    setModalOpen(true);
  };

  const renderBody = () => {
    if (isPending) {
      return (
        <div className="flex h-24 items-center justify-center">
          <Spinner className="text-mineshaft-400" />
        </div>
      );
    }
    if (hasAuthMethods) {
      return (
        <ViewGatewayAuth
          gatewayId={gatewayId}
          gatewayName={gatewayName}
          attachedMethods={attached}
          onEdit={openEdit}
        />
      );
    }
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>This gateway has no auth methods configured</EmptyTitle>
          <EmptyDescription>Add an auth method to bootstrap this gateway</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.EditGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Button variant="org" size="xs" isDisabled={!isAllowed} onClick={openAdd}>
                <PlusIcon />
                Add Auth Method
              </Button>
            )}
          </OrgPermissionCan>
        </EmptyContent>
      </Empty>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>Configure authentication methods</CardDescription>
          {hasAuthMethods && (
            <CardAction>
              <OrgPermissionCan
                I={OrgGatewayPermissionActions.EditGateways}
                a={OrgPermissionSubjects.Gateway}
              >
                {(isAllowed) => (
                  <Button
                    variant="outline"
                    isFullWidth
                    size="xs"
                    isDisabled={!isAllowed}
                    onClick={openAdd}
                  >
                    <PlusIcon />
                    Add Auth Method
                  </Button>
                )}
              </OrgPermissionCan>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {isIdentityGateway && (
            <NoticeBannerV2
              title="This gateway is currently authenticated via machine identity"
              className="mb-4"
            >
              <p className="text-sm text-mineshaft-300">
                Bound to identity{" "}
                <span className="font-medium text-mineshaft-200">{identity!.name}</span>. Adding an
                auth method below will unlink this identity from the gateway. The existing daemon
                will keep running on its current JWT until it restarts — make sure to reconfigure it
                with the new auth method before the next restart to avoid downtime.
              </p>
            </NoticeBannerV2>
          )}
          {renderBody()}
        </CardContent>
      </Card>

      <GatewayAuthMethodModal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        gatewayId={gatewayId}
        attachedMethods={attached}
        editMethod={editMethod}
      />
    </>
  );
};
