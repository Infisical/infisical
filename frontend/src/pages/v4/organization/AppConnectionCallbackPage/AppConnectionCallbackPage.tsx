import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { Loader } from "@app/components/v4/ui/loader";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { CONNECTION_PRESETS } from "../../data/integrations/connection-presets";
import { takeConnectionRedirect } from "../../data/integrations/connection-redirect";
import { orgHref, v4Path } from "../../links";
import { useResolveV4Href } from "../../resolveV4Href";

const ROUTE = v4Path("/organizations/$orgId/app-connections/$appConnection/callback");

const isV4Return = (href: string) => href.startsWith(v4Path("/"));

export const AppConnectionCallbackPage = () => {
  const { orgId, appConnection } = useParams({ from: ROUTE });
  const { state, ...callback } = useSearch({ from: ROUTE });
  const integrations = useV4Adapter("integrations");
  const createConnection = integrations.useCreateConnection();
  const updateConnection = integrations.useUpdateConnection();
  const navigate = useNavigate();
  const resolve = useResolveV4Href();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const appName = APP_CONNECTION_MAP[appConnection as AppConnection]?.name ?? "app";
    const back = (returnTo: string | undefined, connection?: { id: string; name: string }) => {
      const url = new URL(
        returnTo && isV4Return(returnTo) ? returnTo : orgHref(orgId, "/integrations"),
        window.location.origin
      );
      if (connection) {
        url.searchParams.set("connectionId", connection.id);
        url.searchParams.set("connectionName", connection.name);
      }
      return navigate({ href: resolve(`${url.pathname}${url.search}${url.hash}`), replace: true });
    };
    const fail = (message: string, returnTo?: string, error?: unknown) => {
      back(returnTo).then(() =>
        failed(`Could not connect ${appName}`, error ?? new Error(message))
      );
    };

    const taken = takeConnectionRedirect(state);
    if (taken.status === "missing" || taken.status === "corrupt") {
      fail("This connection session expired or was already completed. Start the connection again.");
      return;
    }
    if (taken.status === "mismatch") {
      fail(
        "The response did not match the connection you started. Start the connection again.",
        taken.pending.returnTo
      );
      return;
    }
    const { pending } = taken;
    const redirect = CONNECTION_PRESETS[pending.app as AppConnection]?.methods.find(
      (entry) => entry.value === pending.method
    )?.redirect;
    if (pending.app !== appConnection || !redirect) {
      fail(
        "The response was for a different app than the one you started with. Start the connection again.",
        pending.returnTo
      );
      return;
    }
    const credentials = redirect.credentials({
      callback,
      stored: pending.credentials
    }) as TAppConnection["credentials"];
    const gateway =
      pending.gatewayId !== undefined || pending.gatewayPoolId !== undefined
        ? { gatewayId: pending.gatewayId ?? null, gatewayPoolId: pending.gatewayPoolId ?? null }
        : {};
    const settled = pending.connectionId
      ? updateConnection
          .mutateAsync({
            connectionId: pending.connectionId,
            app: pending.app as AppConnection,
            credentials,
            ...gateway
          })
          .then((connection) => ({ connection, message: `${connection.name} reconnected` }))
      : createConnection
          .mutateAsync({
            app: pending.app,
            name: pending.name,
            method: pending.method as TAppConnection["method"],
            credentials,
            description: pending.description?.trim() || null,
            projectId: pending.projectId,
            ...gateway
          } as TCreateAppConnectionDTO)
          .then((connection) => ({ connection, message: `${appName} connection created` }));
    settled
      .then(({ connection, message }) => {
        back(pending.returnTo, connection).then(() => saved(message));
      })
      .catch((error: unknown) => fail("", pending.returnTo, error));
  }, []);

  return <Loader size="page" label="Connecting" />;
};
