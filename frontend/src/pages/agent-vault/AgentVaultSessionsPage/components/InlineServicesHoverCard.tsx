import { ReactNode, useState } from "react";

import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  ScrollableContent
} from "@app/components/v3";
import {
  TAgentVaultSessionInlineService,
  TAgentVaultSessionNamedService
} from "@app/hooks/api/agentVault/types";

import { inlineServiceTarget } from "./sessionInlineServices";

const ServiceListFrame = ({
  caption,
  label,
  children
}: {
  caption: string;
  label: string;
  children: ReactNode;
}) => (
  <div className="flex w-72 flex-col gap-2.5">
    <p className="text-xs text-muted">{caption}</p>
    {/* A hover card portals out of any open sheet, whose scroll lock would otherwise swallow the wheel. */}
    <ScrollableContent
      aria-label={label}
      edgeBehavior="fade"
      outline={false}
      maxHeight="12rem"
      className="overscroll-contain"
      contentClassName="flex flex-col gap-2"
      onWheel={(event) => event.stopPropagation()}
    >
      {children}
    </ScrollableContent>
  </div>
);

export const InlineServicesList = ({
  services
}: {
  services: TAgentVaultSessionInlineService[];
}) => (
  <ServiceListFrame caption="Sent with the session when it was created." label="Inline services">
    {services.map((service) => {
      const target = inlineServiceTarget(service);
      return (
        <div key={service.id} className="flex min-w-0 items-center gap-2">
          <ServiceIcon
            hostPattern={hostPatternOf(service)}
            serviceType={service.type}
            className="size-5"
          />
          <span className="truncate">{service.name}</span>
          {/* A service sent without a name goes by its host, which would only repeat here. */}
          {target !== service.name && <span className="truncate text-xs text-muted">{target}</span>}
        </div>
      );
    })}
  </ServiceListFrame>
);

export const NamedServicesList = ({ services }: { services: TAgentVaultSessionNamedService[] }) => (
  <ServiceListFrame
    caption="The project's services, named when the session was created."
    label="Services"
  >
    {services.map((service) => (
      <div key={service.id} className="flex min-w-0 items-center gap-2">
        <ServiceIcon
          hostPattern={service.hostPattern}
          serviceType={service.type}
          className="size-5"
        />
        <span className="truncate">{service.name}</span>
        {service.description && (
          <span className="truncate text-xs text-muted">{service.description}</span>
        )}
      </div>
    ))}
  </ServiceListFrame>
);

type HoverCardProps = {
  content: ReactNode;
  children: ReactNode;
};

export const ServicesHoverCard = ({ content, children }: HoverCardProps) => {
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
        {content}
      </HoverCardContent>
    </HoverCard>
  );
};
