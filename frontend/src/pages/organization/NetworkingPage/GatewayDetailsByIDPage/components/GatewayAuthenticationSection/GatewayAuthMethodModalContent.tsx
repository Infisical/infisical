import { useState } from "react";

import { FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";

import {
  AVAILABLE_GATEWAY_AUTH_METHODS,
  GatewayAuthMethod,
  gatewayAuthMethodToNameMap
} from "./AuthMethodComponentMap";
import { GatewayAwsAuthForm } from "./GatewayAwsAuthForm";
import { GatewayTokenAuthForm } from "./GatewayTokenAuthForm";

type Props = {
  gatewayId: string;
  attachedMethods: GatewayAuthMethod[];
  initialMethod?: GatewayAuthMethod;
  isUpdate?: boolean;
  onClose: () => void;
};

export const GatewayAuthMethodModalContent = ({
  gatewayId,
  attachedMethods,
  initialMethod,
  isUpdate,
  onClose
}: Props) => {
  const isAlreadyAttached = (m: GatewayAuthMethod) => attachedMethods.includes(m);

  const initial =
    initialMethod ??
    AVAILABLE_GATEWAY_AUTH_METHODS.find((m) => !isAlreadyAttached(m)) ??
    AVAILABLE_GATEWAY_AUTH_METHODS[0];

  const [method, setMethod] = useState<GatewayAuthMethod>(initial);

  const isEditingAttached = isUpdate && isAlreadyAttached(method);

  return (
    <div>
      {!isUpdate && (
        <FormControl label="Auth Method">
          <Select
            value={method}
            onValueChange={(value) => {
              const v = value as GatewayAuthMethod;
              if (!isAlreadyAttached(v)) setMethod(v);
            }}
            className="w-full"
          >
            {AVAILABLE_GATEWAY_AUTH_METHODS.map((m) => {
              const attached = isAlreadyAttached(m);
              return (
                <Tooltip
                  key={`gateway-auth-method-${m}`}
                  content="This auth method is already configured on the gateway"
                  isDisabled={!attached}
                >
                  <SelectItem isDisabled={attached} value={m}>
                    {gatewayAuthMethodToNameMap[m]}{" "}
                    {attached && <Badge variant="info">Configured</Badge>}
                  </SelectItem>
                </Tooltip>
              );
            })}
          </Select>
        </FormControl>
      )}

      {method === "aws" && (
        <GatewayAwsAuthForm gatewayId={gatewayId} isUpdate={isEditingAttached} onClose={onClose} />
      )}
      {method === "token" && <GatewayTokenAuthForm gatewayId={gatewayId} onClose={onClose} />}
    </div>
  );
};
