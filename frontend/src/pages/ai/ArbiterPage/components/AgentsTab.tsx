import * as Icons from "lucide-react";

import {
  Badge,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";

import { AGENTS } from "../data";

const AGENT_DESCRIPTIONS: Record<string, string> = {
  triage: "Classifies and routes incoming tickets to the appropriate agent.",
  support: "Handles customer inquiries, issues credits, and processes refunds.",
  escalation: "Reviews escalated cases and provides override authority.",
  fulfillment: "Manages inventory checks and order fulfillment."
};

const getIcon = (name: string) => {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name];
  return Icon ? <Icon className="h-5 w-5" /> : null;
};

export const AgentsTab = () => {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {AGENTS.map((agent) => (
        <UnstableCard key={agent.id}>
          <UnstableCardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {getIcon(agent.icon)}
              </div>
              <div>
                <UnstableCardTitle>{agent.name}</UnstableCardTitle>
                <Badge variant="success" className="mt-1">
                  Active
                </Badge>
              </div>
            </div>
          </UnstableCardHeader>
          <UnstableCardContent>
            <p className="text-sm text-accent">
              {AGENT_DESCRIPTIONS[agent.id] ?? "No description available."}
            </p>
          </UnstableCardContent>
        </UnstableCard>
      ))}
    </div>
  );
};
