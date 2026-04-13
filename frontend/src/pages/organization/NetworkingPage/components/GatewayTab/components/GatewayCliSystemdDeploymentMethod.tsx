import { useMemo, useState } from "react";
import { SingleValue } from "react-select";
import { faCopy, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormLabel,
  IconButton,
  Input,
  ModalClose
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways";
import { useCreateGatewayEnrollmentToken } from "@app/hooks/api/gateways-v2";
import { useGetRelays } from "@app/hooks/api/relays/queries";
import { slugSchema } from "@app/lib/schemas";

import { RelayOption } from "./RelayOption";

const formSchema = z.object({
  name: slugSchema({ field: "name" }),
  relay: z
    .object({ id: z.string(), name: z.string() }, { required_error: "Relay is required" })
    .nullable()
    .refine((val) => val !== null, { message: "Relay is required" })
});

export const GatewayCliSystemdDeploymentMethod = () => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const navigate = useNavigate({ from: ROUTE_PATHS.Organization.NetworkingPage.path });

  const [step, setStep] = useState<"form" | "command">("form");
  const [name, setName] = useState("");
  const [relay, setRelay] = useState<null | { id: string; name: string }>({
    id: "_auto",
    name: "Auto Select Relay"
  });
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [resolvedRelayName, setResolvedRelayName] = useState("");
  const [formErrors, setFormErrors] = useState<z.ZodIssue[]>([]);

  const errors = useMemo(() => {
    const errorMap: Record<string, string | undefined> = {};
    formErrors.forEach((issue) => {
      if (issue.path.length > 0) errorMap[String(issue.path[0])] = issue.message;
    });
    return errorMap;
  }, [formErrors]);

  const { data: gateways } = useQuery(gatewaysQueryKeys.list());
  const { data: relays, isPending: isRelaysLoading } = useGetRelays();
  const { mutateAsync: createEnrollmentToken, isPending: isCreatingToken } =
    useCreateGatewayEnrollmentToken();

  const handleContinue = async () => {
    setFormErrors([]);
    const validation = formSchema.safeParse({ name, relay });
    if (!validation.success) {
      setFormErrors(validation.error.issues);
      return;
    }

    const existingNames = gateways?.map((g) => g.name) || [];
    if (existingNames.includes(name.trim())) {
      createNotification({
        type: "error",
        text: "A gateway or enrollment token with this name already exists."
      });
      return;
    }

    try {
      const result = await createEnrollmentToken({ name });
      setEnrollmentToken(result.token);

      const relayName = relay?.id === "_auto" ? "" : relay?.name ?? "";
      setResolvedRelayName(relayName);
      setStep("command");
    } catch {
      createNotification({ type: "error", text: "Failed to create enrollment token" });
    }
  };

  const installCommand = useMemo(() => {
    const relayPart = resolvedRelayName ? ` --target-relay-name=${resolvedRelayName}` : "";
    return `sudo infisical gateway systemd install ${name} --enroll-method=static --token=${enrollmentToken}${relayPart} --domain=${siteURL}`;
  }, [enrollmentToken, name, resolvedRelayName, siteURL]);

  const startServiceCommand = "sudo systemctl start infisical-gateway";

  if (step === "command") {
    return (
      <>
        <p className="mb-3 text-sm text-mineshaft-300">
          Run the following commands on the machine where you want to deploy the gateway. The token
          expires in 1 hour and can only be used once.
        </p>
        <FormLabel label="Installation Command" />
        <div className="flex gap-2">
          <Input value={installCommand} isDisabled />
          <IconButton
            ariaLabel="copy install command"
            variant="outline_bg"
            colorSchema="secondary"
            onClick={() => {
              navigator.clipboard.writeText(installCommand);
              createNotification({ text: "Installation command copied to clipboard", type: "info" });
            }}
            className="w-10"
          >
            <FontAwesomeIcon icon={faCopy} />
          </IconButton>
        </div>

        <FormLabel label="Start the Gateway Service" className="mt-4" />
        <div className="mb-2 flex gap-2">
          <Input value={startServiceCommand} isDisabled />
          <IconButton
            ariaLabel="copy start service command"
            variant="outline_bg"
            colorSchema="secondary"
            onClick={() => {
              navigator.clipboard.writeText(startServiceCommand);
              createNotification({
                text: "Start service command copied to clipboard",
                type: "info"
              });
            }}
            className="w-10"
          >
            <FontAwesomeIcon icon={faCopy} />
          </IconButton>
        </div>
        <a
          href="https://infisical.com/docs/cli/overview"
          target="_blank"
          className="mt-2 flex h-4 w-fit items-center gap-2 border-b border-mineshaft-400 text-sm text-mineshaft-400 transition-colors duration-100 hover:border-yellow-400 hover:text-yellow-400"
          rel="noreferrer"
        >
          <span>Install the Infisical CLI</span>
          <FontAwesomeIcon icon={faUpRightFromSquare} className="size-3" />
        </a>
        <div className="mt-6 flex items-center">
          <ModalClose asChild>
            <Button className="mr-4" size="sm" colorSchema="secondary">
              Done
            </Button>
          </ModalClose>
        </div>
      </>
    );
  }

  return (
    <>
      <FormLabel label="Name" tooltipText="The name for your gateway." />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter gateway name..."
        isError={Boolean(errors.name)}
      />
      {errors.name && <p className="mt-1 text-sm text-red">{errors.name}</p>}

      <FormLabel label="Relay" tooltipText="The relay to use with your gateway." className="mt-4" />
      <FilterableSelect
        value={relay}
        onChange={(newValue) => {
          if ((newValue as SingleValue<{ id: string }>)?.id === "_create") {
            navigate({
              search: (prev) => ({ ...prev, selectedTab: "relays", action: "deploy-relay" })
            });
            return;
          }
          setRelay(newValue as SingleValue<{ id: string; name: string }>);
        }}
        isLoading={isRelaysLoading}
        options={[
          { id: "_auto", name: "Auto Select Relay" },
          { id: "_create", name: "Deploy New Relay" },
          ...(relays || [])
        ]}
        placeholder="Select relay..."
        getOptionLabel={(option) => option.name}
        getOptionValue={(option) => option.id}
        components={{ Option: RelayOption }}
      />
      {errors.relay && <p className="mt-1 text-sm text-red">{errors.relay}</p>}

      <div className="mt-6 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          colorSchema="secondary"
          onClick={handleContinue}
          isLoading={isCreatingToken}
        >
          Continue
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </>
  );
};
