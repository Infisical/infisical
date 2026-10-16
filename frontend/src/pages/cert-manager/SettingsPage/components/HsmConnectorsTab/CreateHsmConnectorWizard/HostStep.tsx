import { Controller, useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ServerIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker/GatewayPicker";
import { useOrganization, useSubscription } from "@app/context";
import { gatewayPoolsQueryKeys } from "@app/hooks/api/gateway-pools/queries";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";

import { HostForm } from "./schemas";

type Props = {
  form: ReturnType<typeof useForm<HostForm>>;
};

export const isHsmCapableGateway = (gateway: TGatewayV2) => gateway.capabilities?.pkcs11 === true;

// The HSM forms store the route as "gateway:<id>" or "pool:<id>"; the picker works with the two ids.
export const toGatewayPickerValue = (reachedFrom: string) => {
  const [kind, id] = reachedFrom.split(":");
  return {
    gatewayId: kind === "gateway" && id ? id : null,
    gatewayPoolId: kind === "pool" && id ? id : null
  };
};

export const fromGatewayPickerValue = ({
  gatewayId,
  gatewayPoolId
}: {
  gatewayId: string | null;
  gatewayPoolId: string | null;
}) => {
  if (gatewayPoolId) return `pool:${gatewayPoolId}`;
  if (gatewayId) return `gateway:${gatewayId}`;
  return "";
};

export const HostStep = ({ form }: Props) => {
  const { orgId } = useParams({ strict: false });
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const isPoolRequired = Boolean(currentOrg?.requireGatewayPools);
  const showPools = Boolean(subscription?.gatewayPool) || isPoolRequired;

  const { data: gateways = [], isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());
  const { data: pools = [], isPending: isPoolsLoading } = useQuery({
    ...gatewayPoolsQueryKeys.list(),
    enabled: showPools
  });
  const isLoading = isGatewaysLoading || (showPools && isPoolsLoading);
  const hasPools = showPools && pools.length > 0;
  const hasUsableRoute = isPoolRequired ? hasPools : hasPools || gateways.some(isHsmCapableGateway);

  return (
    <FieldGroup>
      <Controller
        name="reachedFrom"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Gateway <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <GatewayPicker
                isRequired
                value={toGatewayPickerValue(field.value)}
                onChange={(next) => field.onChange(fromGatewayPickerValue(next))}
                filterGateway={isHsmCapableGateway}
                placeholder="Select a Gateway or Gateway Pool..."
                isError={Boolean(error)}
              />
              <FieldDescription>
                A{" "}
                <a
                  href="https://infisical.com/docs/documentation/platform/gateways/overview"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Gateway
                </a>{" "}
                is a lightweight agent that performs HSM operations on Infisical&apos;s behalf. It
                runs inside your network and handles the communication with your HSM.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {!isLoading && !hasUsableRoute && (
        <div className="rounded-md border border-border bg-surface-raised p-4">
          <div className="flex items-start gap-3">
            <ServerIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            {isPoolRequired ? (
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p className="font-medium text-foreground">No gateway pools exist yet</p>
                <p className="text-muted">
                  Your organization requires HSM Connectors to connect through a gateway pool. Add
                  Gateways with PKCS#11 support to a pool, then come back to select it.{" "}
                  <Link
                    to="/organizations/$orgId/networking"
                    params={{ orgId: orgId ?? "" }}
                    search={{ selectedTab: "gateways", gatewayView: "gateway-pools" }}
                    className="text-project hover:underline"
                  >
                    Create a pool in Networking
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p className="font-medium text-foreground">
                  No Gateways are connected to an HSM yet
                </p>
                <p className="text-muted">
                  A Gateway with PKCS#11 support must be running on a machine that can reach your
                  HSM. This is set up by someone with network and infrastructure access.{" "}
                  <a
                    href="https://infisical.com/docs/documentation/platform/pki/settings/hsm-connectors"
                    target="_blank"
                    rel="noreferrer"
                    className="text-project hover:underline"
                  >
                    Read the HSM Connectors setup guide
                  </a>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </FieldGroup>
  );
};
