import { useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  BotIcon,
  ChevronsLeftRightEllipsisIcon,
  GlobeIcon,
  InfoIcon
} from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProxiedServiceTemplate } from "@app/helpers/proxiedServiceTemplates";

import { TProxiedServiceForm } from "./schema";

type Props = {
  template?: ProxiedServiceTemplate;
};

const truncate = (value: string, max = 16) =>
  value.length > max ? `${value.slice(0, max)}…` : value;

const Connector = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 py-1.5 pl-3.5">
    <div className="flex flex-col items-center">
      <div className="h-3 w-px bg-border" />
      <ArrowDownIcon className="-mt-1 size-3 text-muted" />
    </div>
    <span className="text-[11px] leading-tight text-muted">{label}</span>
  </div>
);

const Node = ({
  icon,
  title,
  accent,
  children
}: {
  icon: React.ReactNode;
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) => (
  <div
    className={`rounded-md border p-2.5 ${
      accent
        ? "border-proxied-service/30 bg-proxied-service/10"
        : "border-border bg-mineshaft-700/40"
    }`}
  >
    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
      {icon}
      {title}
    </div>
    <div className="mt-1.5">{children}</div>
  </div>
);

const ServiceIcon = ({ template }: { template?: ProxiedServiceTemplate }) => {
  const [imgError, setImgError] = useState(false);

  if (template && !imgError) {
    return (
      <img
        src={`/images/integrations/${template.image}`}
        alt=""
        className="size-3.5 shrink-0 object-contain"
        onError={() => setImgError(true)}
      />
    );
  }
  return <GlobeIcon className="size-3.5 text-bunker-300" />;
};

export const ProxiedServiceSubstitutionDiagram = ({ template }: Props) => {
  const { watch } = useFormContext<TProxiedServiceForm>();
  const substitutions = watch("substitutions");
  const example = substitutions?.find((s) => s.placeholderKey) ?? substitutions?.[0];

  const envVar = example?.placeholderKey || "API_KEY";
  const placeholder = truncate(example?.placeholderValue || "sk-xxxxxxxxxxxx");

  return (
    <div className="rounded-md border border-border bg-container/40 p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <p className="text-xs font-semibold text-foreground">On the wire</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="size-3 cursor-help text-muted" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            When an agent launches with{" "}
            <span className="font-mono">infisical secrets agent-proxy connect</span>, Infisical sets
            each placeholder as an environment variable on it. The agent sends the placeholder in
            its requests, and the proxy swaps it for the real secret on the wire.
          </TooltipContent>
        </Tooltip>
      </div>

      <Node icon={<BotIcon className="size-3.5 text-bunker-300" />} title="Your Agent">
        <p className="font-mono text-[11px] break-all">
          <span className="text-bunker-300">{envVar}</span>
          <span className="text-muted">=</span>
          <span className="text-foreground">{placeholder}</span>
        </p>
        <p className="mt-1 text-[11px] leading-tight text-muted">
          Infisical sets this env var to a fake, real-looking value.
        </p>
      </Node>

      <Connector label="Agent sends the placeholder in its request" />

      <Node
        icon={<ChevronsLeftRightEllipsisIcon className="size-3.5 text-proxied-service" />}
        title="Agent Proxy"
        accent
      >
        <p className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
          <span className="text-muted line-through">{placeholder}</span>
          <ArrowRightIcon className="size-3 shrink-0 text-muted" />
          <span className="text-foreground">real secret</span>
        </p>
        <p className="mt-1 text-[11px] leading-tight text-muted">
          Swaps the placeholder for the real secret.
        </p>
      </Node>

      <Connector label="Forwards the real request" />

      <Node icon={<ServiceIcon template={template} />} title={template?.name || "External Service"}>
        <p className="text-[11px] leading-tight text-muted">
          Receives the real credential. Your agent never held it.
        </p>
      </Node>
    </div>
  );
};
