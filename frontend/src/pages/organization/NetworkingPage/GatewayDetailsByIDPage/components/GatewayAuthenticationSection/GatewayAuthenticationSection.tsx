import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { NoticeBannerV2 } from "@app/components/v2";
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  IconButton
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { GatewayAuthMethodView } from "@app/hooks/api/gateways-v2/types";

import { GatewayAuthMethodSheet } from "./GatewayAuthMethodSheet";
import { ViewGatewayAuth } from "./ViewGatewayAuth";

type Props = {
  gatewayId: string;
  authMethod: GatewayAuthMethodView;
};

const AuthMethodBadge = ({ method }: { method: GatewayAuthMethodView["method"] }) => {
  if (method === "aws") return <Badge variant="info">AWS Auth</Badge>;
  if (method === "token") return <Badge variant="info">Token Auth</Badge>;
  return <Badge variant="warning">Machine Identity</Badge>;
};

export const GatewayAuthenticationSection = ({ gatewayId, authMethod }: Props) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const isIdentityGateway = authMethod.method === "identity";

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>Authentication</CardTitle>
          {!isIdentityGateway && (
            <CardAction>
              <OrgPermissionCan
                I={OrgGatewayPermissionActions.EditGateways}
                a={OrgPermissionSubjects.Gateway}
              >
                {(isAllowed) => (
                  <IconButton
                    aria-label="edit auth method"
                    variant="ghost"
                    size="xs"
                    isDisabled={!isAllowed}
                    onClick={() => setSheetOpen(true)}
                  >
                    <PencilIcon />
                  </IconButton>
                )}
              </OrgPermissionCan>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {isIdentityGateway && (
              <NoticeBannerV2 title="Authenticated via machine identity (legacy)">
                <p className="text-sm text-mineshaft-300">
                  This gateway is still using machine identity. We recommend creating a new gateway.{" "}
                  <Link
                    to="/organizations/$orgId/networking"
                    params={{ orgId }}
                    search={{ selectedTab: "gateways" }}
                    className="text-primary-400 underline-offset-2 hover:underline"
                  >
                    Create a new gateway
                  </Link>
                </p>
              </NoticeBannerV2>
            )}
            <DetailGroup>
              <Detail>
                <DetailLabel>Method</DetailLabel>
                <DetailValue>
                  <AuthMethodBadge method={authMethod.method} />
                </DetailValue>
              </Detail>
            </DetailGroup>
            <ViewGatewayAuth authMethod={authMethod} />
          </div>
        </CardContent>
      </Card>

      {!isIdentityGateway && (
        <GatewayAuthMethodSheet
          isOpen={sheetOpen}
          onOpenChange={setSheetOpen}
          gatewayId={gatewayId}
          currentMethod={authMethod}
        />
      )}
    </>
  );
};
