import { faCopy, faQuestionCircle, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SingleValue } from "react-select";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FilterableSelect,
  FormLabel,
  IconButton,
  Input,
  ModalClose,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import {
  useAddIdentityTokenAuth,
  useCreateTokenIdentityTokenAuth,
  useGetIdentityMembershipOrgs,
  useGetIdentityTokenAuth,
  useGetRelays
} from "@app/hooks/api";
import { slugSchema } from "@app/lib/schemas";

import { RelayOption } from "./RelayOption";

const baseFormSchema = z.object({
  name: slugSchema({ field: "name" }),
  relay: z
    .object(
      {
        id: z.string(),
        name: z.string()
      },
      { required_error: "Relay is required" }
    )
    .nullable()
    .refine((val) => val !== null, { message: "Relay is required" })
});

const formSchemaWithIdentity = baseFormSchema.extend({
  identity: z
    .object(
      {
        id: z.string(),
        name: z.string()
      },
      { required_error: "Machine identity is required" }
    )
    .nullable()
    .refine((val) => val !== null, { message: "Machine identity is required" })
});

const formSchemaWithToken = baseFormSchema.extend({
  identityToken: z.string().min(1, "Token is required")
});

export const GatewayCliSystemdDeploymentMethod = () => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const navigate = useNavigate({
    from: ROUTE_PATHS.Organization.NetworkingPage.path
  });

  const [autogenerateToken, setAutogenerateToken] = useState(true);
  const [step, setStep] = useState<"form" | "command">("form");
  const [name, setName] = useState("");
  const [relay, setRelay] = useState<null | {
    id: string;
    name: string;
  }>({ id: "_auto", name: "Auto Select Relay" });
  const [identity, setIdentity] = useState<null | {
    id: string;
    name: string;
  }>(null);
  const [identityToken, setIdentityToken] = useState("");
  const [formErrors, setFormErrors] = useState<z.ZodIssue[]>([]);

  const errors = useMemo(() => {
    const errorMap: Record<string, string | undefined> = {};
    formErrors.forEach((issue) => {
      if (issue.path.length > 0) {
        errorMap[String(issue.path[0])] = issue.message;
      }
    });
    return errorMap;
  }, [formErrors]);

  const { data: relays, isPending: isRelaysLoading } = useGetRelays();

  const { currentOrg } = useOrganization();
  const organizationId = currentOrg?.id || "";

  const { permission } = useOrgPermission();
  const canCreateToken = permission.can(
    OrgPermissionIdentityActions.CreateToken,
    OrgPermissionSubjects.Identity
  );

  const { data: identityMembershipOrgsData, isPending: isIdentitiesLoading } =
    useGetIdentityMembershipOrgs({
      organizationId,
      limit: 20000
    });
  const identityMembershipOrgs = identityMembershipOrgsData?.identityMemberships || [];

  const { mutateAsync: createToken, isPending: isCreatingToken } =
    useCreateTokenIdentityTokenAuth();
  const { mutateAsync: addIdentityTokenAuth, isPending: isAddingTokenAuth } =
    useAddIdentityTokenAuth();
  const { refetch } = useGetIdentityTokenAuth(identity?.id ?? "");

  const handleGenerateCommand = async () => {
    setFormErrors([]);

    if (canCreateToken && autogenerateToken) {
      const validation = formSchemaWithIdentity.safeParse({
        name,
        relay,
        identity
      });
      if (!validation.success) {
        setFormErrors(validation.error.issues);
        return;
      }

      const validatedIdentity = validation.data.identity;

      try {
        const { data: identityTokenAuth } = await refetch();
        if (!identityTokenAuth) {
          await addIdentityTokenAuth({
            identityId: validatedIdentity.id,
            organizationId,
            accessTokenTTL: 2592000,
            accessTokenMaxTTL: 2592000,
            accessTokenNumUsesLimit: 0,
            accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
          });
          createNotification({
            text: "Token authentication has been automatically enabled for the selected identity. By default, it is configured to allow all IP addresses with a default token TTL of 30 days. You can manage these settings in Access Control.",
            type: "warning"
          });
        }

        const token = await createToken({
          identityId: validatedIdentity.id,
          name: `gateway token for ${name} (autogenerated)`
        });
        setIdentityToken(token.accessToken);
        createNotification({
          text: "Automatically generated a token for the selected identity.",
          type: "info"
        });
        setStep("command");
      } catch {
        setIdentityToken("");
      }
    } else {
      const validation = formSchemaWithToken.safeParse({
        name,
        relay,
        identityToken
      });
      if (!validation.success) {
        setFormErrors(validation.error.issues);
        return;
      }
      setStep("command");
    }
  };

  const installCommand = useMemo(() => {
    const relayPart = relay?.id !== "_auto" ? ` --target-relay-name=${relay?.name || ""}` : "";
    return `sudo infisical gateway systemd install --name=${name}${relayPart} --domain=${siteURL} --token=${identityToken}`;
  }, [name, relay, identityToken, siteURL]);

  const startServiceCommand = "sudo systemctl start infisical-gateway";

  if (step === "command") {
    return (
      <>
        <FormLabel label="Installation Command" />
        <div className="flex gap-2">
          <Input value={installCommand} isDisabled />
          <IconButton
            ariaLabel="copy install command"
            variant="outline_bg"
            colorSchema="secondary"
            onClick={() => {
              navigator.clipboard.writeText(installCommand);
              createNotification({
                text: "Installation command copied to clipboard",
                type: "info"
              });
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
          {
            id: "_auto",
            name: "Auto Select Relay"
          },
          {
            id: "_create",
            name: "Deploy New Relay"
          },
          ...(relays || [])
        ]}
        placeholder="Select relay..."
        getOptionLabel={(option) => option.name}
        getOptionValue={(option) => option.id}
        components={{ Option: RelayOption }}
      />
      {errors.relay && <p className="mt-1 text-sm text-red">{errors.relay}</p>}

      {canCreateToken && autogenerateToken ? (
        <>
          <FormLabel
            label="Machine Identity"
            tooltipText="The machine identity that your gateway will use for authentication."
            className="mt-4"
          />
          <FilterableSelect
            value={identity}
            onChange={(e) =>
              setIdentity(
                e as SingleValue<{
                  id: string;
                  name: string;
                }>
              )
            }
            isLoading={isIdentitiesLoading}
            placeholder="Select machine identity..."
            options={identityMembershipOrgs.map((membership) => membership.identity)}
            getOptionValue={(option) => option.id}
            getOptionLabel={(option) => option.name}
          />
          {errors.identity && <p className="mt-1 text-sm text-red">{errors.identity}</p>}
        </>
      ) : (
        <>
          <FormLabel
            label="Machine Identity Token"
            tooltipText="The machine identity token that your gateway will use for authentication."
            className="mt-4"
          />
          <Input
            value={identityToken}
            onChange={(e) => setIdentityToken(e.target.value)}
            placeholder="Enter machine identity token..."
            isError={Boolean(errors.identityToken)}
          />
          {errors.identityToken && <p className="mt-1 text-sm text-red">{errors.identityToken}</p>}
        </>
      )}

      {canCreateToken && (
        <div className="mt-2">
          <Checkbox
            isChecked={autogenerateToken}
            onCheckedChange={(e) => {
              setAutogenerateToken(Boolean(e));
            }}
            id="autogenerate-token"
            className="mr-2"
          >
            <div className="flex items-center">
              <span>Automatically enable token auth and generate a token for machine identity</span>
              <Tooltip
                className="max-w-md"
                content={
                  <>
                    Token authentication will be automatically enabled for the selected machine
                    identity if it isn&apos;t already configured. By default, it will be configured
                    to allow all IP addresses with a token TTL of 30 days. You can manage these
                    settings in Access Control.
                    <br />
                    <br />A token will automatically be generated to be used with the CLI command.
                  </>
                }
              >
                <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="mt-0.5 ml-1" />
              </Tooltip>
            </div>
          </Checkbox>
        </div>
      )}

      <div className="mt-6 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          colorSchema="secondary"
          onClick={handleGenerateCommand}
          isLoading={isCreatingToken || isAddingTokenAuth}
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
