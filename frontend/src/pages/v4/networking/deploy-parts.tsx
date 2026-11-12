import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Field } from "@infisical/cipher/ui/field";
import { Select } from "@infisical/cipher/ui/select";

import { useTimeRemaining } from "@app/hooks/useTimeRemaining";

import { useV4Adapter } from "../data/adapters";

export const AUTO_RELAY = { id: "_auto", name: "Auto Select Relay" };

export type RelayChoice = { id: string; name: string };

export const PLACEHOLDER_ADDRESS = "<gateway-address>:8443";

export const siteUrl = () => {
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port && port !== "80" ? `:${port}` : ""}`;
};

export const DeployRestricted = ({ resource }: { resource: "gateway" | "relay" }) => (
  <Alert tone="warn" title="Access restricted">
    {`You don't have permission to generate ${resource} deployment commands.`}
  </Alert>
);

export const RelaySelect = ({
  value,
  onChange
}: {
  value: RelayChoice;
  onChange: (relay: RelayChoice) => void;
}) => {
  const { data: relays, isPending } = useV4Adapter("networking").useRelays();
  const choices = [AUTO_RELAY, ...(relays ?? [])];
  return (
    <Field
      label="Relay"
      description={
        value.id === AUTO_RELAY.id
          ? undefined
          : "Auto Select chooses a healthy relay and fails over if needed."
      }
    >
      <Select
        value={value.id}
        disabled={isPending}
        placeholder="Select relay"
        options={choices.map((relay) => ({ value: relay.id, label: relay.name }))}
        onValueChange={(id) => onChange(choices.find((relay) => relay.id === id) ?? AUTO_RELAY)}
      />
    </Field>
  );
};

export const useEnrollmentExpiry = (expiresAt?: string) => {
  const { label, isExpired } = useTimeRemaining(expiresAt);
  return {
    isExpired,
    badge: expiresAt ? (
      <Badge tone={isExpired ? "bad" : "soft"} mono>
        {label}
      </Badge>
    ) : undefined
  };
};
