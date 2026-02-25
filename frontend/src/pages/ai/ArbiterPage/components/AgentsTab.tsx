import * as Icons from "lucide-react";
import { ActivityIcon, EditIcon, MoreHorizontalIcon, PowerOffIcon } from "lucide-react";

import {
  Badge,
  UnstableCard,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
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
  return Icon ? <Icon className="size-3" /> : null;
};

export const AgentsTab = () => {
  return (
    <UnstableCard>
      <UnstableCardHeader>
        <UnstableCardTitle>Agents</UnstableCardTitle>
        <UnstableCardDescription>
          Registered agents and their current status.
        </UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead className="w-1/4">Name</UnstableTableHead>
            <UnstableTableHead>Description</UnstableTableHead>
            <UnstableTableHead>Status</UnstableTableHead>
            <UnstableTableHead className="w-5" />
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {AGENTS.map((agent) => (
            <UnstableTableRow key={agent.id}>
              <UnstableTableCell>
                <div className="flex items-center gap-2">
                  {getIcon(agent.icon)}
                  <span className="font-medium">{agent.name}</span>
                </div>
              </UnstableTableCell>
              <UnstableTableCell>
                <span className="text-xs text-accent">
                  {AGENT_DESCRIPTIONS[agent.id] ?? "No description available."}
                </span>
              </UnstableTableCell>
              <UnstableTableCell>
                <Badge variant="success">
                  <ActivityIcon />
                  Active
                </Badge>
              </UnstableTableCell>
              <UnstableTableCell>
                <UnstableDropdownMenu>
                  <UnstableDropdownMenuTrigger asChild>
                    <UnstableIconButton variant="ghost" size="xs">
                      <MoreHorizontalIcon />
                    </UnstableIconButton>
                  </UnstableDropdownMenuTrigger>
                  <UnstableDropdownMenuContent align="end">
                    <UnstableDropdownMenuItem>
                      <EditIcon />
                      Edit Policies
                    </UnstableDropdownMenuItem>
                    <UnstableDropdownMenuItem variant="danger">
                      <PowerOffIcon />
                      Deactivate
                    </UnstableDropdownMenuItem>
                  </UnstableDropdownMenuContent>
                </UnstableDropdownMenu>
              </UnstableTableCell>
            </UnstableTableRow>
          ))}
        </UnstableTableBody>
      </UnstableTable>
    </UnstableCard>
  );
};
