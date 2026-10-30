import { ReactNode } from "react";

import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  ScrollableContent
} from "@app/components/v3";
import { TAgentVaultSessionInlineService } from "@app/hooks/api/agentVault/types";

import { inlineServiceDisplayName } from "./sessionInlineServices";

type ListProps = {
  services: TAgentVaultSessionInlineService[];
};

export const InlineServicesList = ({ services }: ListProps) => (
  <div className="flex w-72 flex-col gap-2.5">
    <p className="text-xs text-muted">Sent with the session when it was created.</p>
    {/* A hover card portals out of any open sheet, whose scroll lock would otherwise swallow the wheel. */}
    <ScrollableContent
      aria-label="Inline services"
      edgeBehavior="fade"
      outline={false}
      maxHeight="12rem"
      className="overscroll-contain"
      contentClassName="flex flex-col gap-2"
      onWheel={(event) => event.stopPropagation()}
    >
      {services.map((service) => (
        <div key={service.id} className="flex min-w-0 items-center gap-2">
          <ServiceIcon hostPattern={service.hostPattern} className="size-5" />
          <span className="truncate">{inlineServiceDisplayName(service)}</span>
          {service.name && (
            <span className="truncate text-xs text-muted">{service.hostPattern.split(",")[0]}</span>
          )}
        </div>
      ))}
    </ScrollableContent>
  </div>
);

type HoverCardProps = ListProps & {
  children: ReactNode;
};

export const InlineServicesHoverCard = ({ services, children }: HoverCardProps) => (
  <HoverCard openDelay={150} closeDelay={100}>
    <HoverCardTrigger asChild>{children}</HoverCardTrigger>
    <HoverCardContent align="start" className="w-auto">
      <InlineServicesList services={services} />
    </HoverCardContent>
  </HoverCard>
);
