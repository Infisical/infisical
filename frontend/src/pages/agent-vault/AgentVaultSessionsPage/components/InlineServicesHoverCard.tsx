import { ReactNode, useState } from "react";

import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  ScrollableContent
} from "@app/components/v3";
import { TAgentVaultSessionInlineService } from "@app/hooks/api/agentVault/types";

import { inlineServiceTarget } from "./sessionInlineServices";

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
      {services.map((service) => {
        const target = inlineServiceTarget(service);
        return (
          <div key={service.id} className="flex min-w-0 items-center gap-2">
            <ServiceIcon hostPattern={service.hostPattern} className="size-5" />
            <span className="truncate">{service.name}</span>
            {/* A service sent without a name goes by its host, which would only repeat here. */}
            {target !== service.name && (
              <span className="truncate text-xs text-muted">{target}</span>
            )}
          </div>
        );
      })}
    </ScrollableContent>
  </div>
);

type HoverCardProps = ListProps & {
  children: ReactNode;
};

export const InlineServicesHoverCard = ({ services, children }: HoverCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <HoverCard open={isOpen} onOpenChange={setIsOpen} openDelay={150} closeDelay={100}>
      {/* A hover card ignores touch, and its trigger cancels the tap's click, so a tap opens it on pointer down. */}
      <HoverCardTrigger
        asChild
        onClick={() => setIsOpen(true)}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") setIsOpen(true);
        }}
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-auto">
        <InlineServicesList services={services} />
      </HoverCardContent>
    </HoverCard>
  );
};
