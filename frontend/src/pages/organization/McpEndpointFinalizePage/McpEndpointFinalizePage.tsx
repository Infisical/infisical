import { useState } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faCheckCircle, faPlug, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useFinalizeMcpEndpointOAuth, useGetAiMcpEndpointById } from "@app/hooks/api";

const FinalizeFormSchema = z.object({
  expireIn: z.string().min(1, "Expiration is required")
});

type FormData = z.infer<typeof FinalizeFormSchema>;

export const McpEndpointFinalizePage = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const search = useSearch({
    from: "/_authenticate/organization/mcp-endpoint-finalize"
  });

  const { data: endpoint, isLoading: isEndpointLoading } = useGetAiMcpEndpointById({
    endpointId: search.endpointId
  });

  const { mutateAsync: finalizeOAuth, isPending } = useFinalizeMcpEndpointOAuth();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(FinalizeFormSchema),
    defaultValues: {
      expireIn: "30d"
    }
  });

  const onSubmit = async ({ expireIn }: FormData) => {
    try {
      const { callbackUrl } = await finalizeOAuth({
        endpointId: search.endpointId,
        response_type: search.response_type,
        client_id: search.client_id,
        code_challenge: search.code_challenge,
        code_challenge_method: search.code_challenge_method,
        redirect_uri: search.redirect_uri,
        resource: search.resource,
        expireIn
      });

      setIsRedirecting(true);
      window.location.href = callbackUrl;

      // Fallback: try to close the window after 3 seconds if redirect doesn't navigate away
      setTimeout(() => {
        window.close();
      }, 3000);
    } catch (error) {
      console.error("Failed to authorize:", error);
      createNotification({
        text: "Failed to authorize MCP endpoint access",
        type: "error"
      });
    }
  };

  if (isRedirecting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bunker-800">
        <div className="w-full max-w-md rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <FontAwesomeIcon icon={faCheckCircle} className="text-3xl text-green-500" />
          </div>
          <h1 className="text-xl font-semibold text-mineshaft-100">Authorization Successful</h1>
          <p className="mt-2 text-sm text-bunker-300">
            <FontAwesomeIcon icon={faSpinner} className="mr-2 animate-spin" />
            Redirecting back to the application...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bunker-800">
      <Helmet>
        <title>Authorize MCP Endpoint</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>

      <div className="w-full max-w-md rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8 shadow-lg">
        <Link to="/" className="mb-6 block">
          <img src="/images/gradientLogo.svg" className="mx-auto h-16" alt="Infisical logo" />
        </Link>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <FontAwesomeIcon icon={faPlug} className="text-2xl text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-mineshaft-100">Authorize MCP Access</h1>
          <p className="mt-2 text-sm text-bunker-300">
            An external application is requesting access to your MCP endpoint
          </p>
        </div>

        {isEndpointLoading && (
          <div className="mb-6 animate-pulse rounded-lg border border-mineshaft-600 bg-mineshaft-700 p-4">
            <div className="h-4 w-1/3 rounded bg-mineshaft-600" />
            <div className="mt-2 h-3 w-2/3 rounded bg-mineshaft-600" />
          </div>
        )}
        {!isEndpointLoading && endpoint && (
          <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-700 p-4">
            <p className="text-xs font-medium tracking-wide text-bunker-400 uppercase">Endpoint</p>
            <p className="mt-1 font-medium text-mineshaft-100">{endpoint.name}</p>
            {endpoint.description && (
              <p className="mt-1 text-sm text-bunker-300">{endpoint.description}</p>
            )}
            <div className="mt-3 flex items-center gap-4 text-xs text-bunker-400">
              <span>{endpoint.connectedServers} server(s)</span>
              <span>{endpoint.activeTools} tool(s)</span>
            </div>
          </div>
        )}
        {!isEndpointLoading && !endpoint && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-400">Endpoint not found</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <Controller
            control={control}
            name="expireIn"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Duration"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="How long the access token should be valid (e.g., 1h, 7d, 30d)"
              >
                <Input {...field} placeholder="30d" />
              </FormControl>
            )}
          />

          <div className="mt-6 flex gap-3">
            <Button
              type="submit"
              className="flex-1"
              isLoading={isSubmitting || isPending}
              isDisabled={isSubmitting || isPending || !endpoint}
            >
              Authorize
            </Button>
            <Link to="/">
              <Button variant="outline_bg" colorSchema="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-bunker-400">
          By authorizing, you grant the external application access to interact with the tools
          available through this MCP endpoint.
        </p>
      </div>
    </div>
  );
};
