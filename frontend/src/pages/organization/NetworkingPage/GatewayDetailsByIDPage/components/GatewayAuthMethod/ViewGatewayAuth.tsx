import { GatewayAuthMethodView } from "@app/hooks/api/gateways-v2/types";

import { ViewGatewayAwsAuthContent } from "./ViewGatewayAwsAuthContent";
import { ViewGatewayIdentityAuthContent } from "./ViewGatewayIdentityAuthContent";

type Props = {
  authMethod: GatewayAuthMethodView;
};

export const ViewGatewayAuth = ({ authMethod }: Props) => {
  if (authMethod.method === "aws") {
    return <ViewGatewayAwsAuthContent config={authMethod.config} />;
  }
  if (authMethod.method === "token") {
    return null;
  }
  return <ViewGatewayIdentityAuthContent config={authMethod.config} />;
};
