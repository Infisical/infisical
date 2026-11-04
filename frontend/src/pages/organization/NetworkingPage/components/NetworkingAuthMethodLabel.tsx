import { KeyIcon } from "lucide-react";

import { ProviderIcon } from "@app/components/v3";

export type NetworkingAuthMethod = "aws" | "gcp" | "kubernetes" | "token";

export type NetworkingAuthMethodOption = {
  value: NetworkingAuthMethod;
  label: string;
};

export const NETWORKING_AUTH_METHOD_OPTIONS: NetworkingAuthMethodOption[] = [
  { value: "token", label: "Token Auth" },
  { value: "aws", label: "AWS Auth" },
  { value: "gcp", label: "GCP Auth" },
  { value: "kubernetes", label: "Kubernetes Auth" }
];

const NetworkingAuthMethodIcon = ({ method }: { method: NetworkingAuthMethod }) => {
  if (method === "aws") {
    return (
      <ProviderIcon
        icon="Amazon Web Services.png"
        alt=""
        aria-hidden
        className="size-4 object-contain"
      />
    );
  }
  if (method === "gcp") {
    return (
      <img
        src="/images/integrations/Google Cloud Platform.png"
        alt=""
        aria-hidden
        className="size-4 object-contain"
      />
    );
  }
  if (method === "kubernetes") {
    return (
      <img
        src="/images/integrations/Kubernetes.png"
        alt=""
        aria-hidden
        className="size-4 object-contain"
      />
    );
  }
  return <KeyIcon className="size-4 text-accent" />;
};

export const NetworkingAuthMethodLabel = ({
  method,
  label
}: {
  method: NetworkingAuthMethod;
  label?: string;
}) => (
  <span className="flex min-w-0 items-center gap-2">
    <NetworkingAuthMethodIcon method={method} />
    <span className="truncate">
      {label ?? NETWORKING_AUTH_METHOD_OPTIONS.find(({ value }) => value === method)?.label}
    </span>
  </span>
);
