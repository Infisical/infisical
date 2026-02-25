import { useCallback, useState } from "react";
import * as Icons from "lucide-react";
import {
  ActivityIcon,
  EditIcon,
  FilterIcon,
  MoreHorizontalIcon,
  PowerOffIcon,
  SearchIcon
} from "lucide-react";

import {
  Badge,
  Button,
  DocumentationLinkBadge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  UnstableCard,
  UnstableCardAction,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuLabel,
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
  return Icon ? <Icon className="size-3.5 text-label" /> : null;
};

const STATUSES = ["Active", "Inactive"] as const;

export const AgentsTab = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const handleStatusToggle = useCallback(
    (status: string) =>
      setStatusFilter((prev) =>
        prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
      ),
    []
  );

  const isTableFiltered = statusFilter.length > 0;

  const filteredAgents = AGENTS.filter((agent) =>
    agent.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <UnstableCard>
      <UnstableCardHeader>
        <UnstableCardTitle>
          Agents
          <DocumentationLinkBadge href="/" />
        </UnstableCardTitle>
        <UnstableCardDescription>
          Registered agents and their current status.
        </UnstableCardDescription>
        <UnstableCardAction>
          <Button variant="project">
            <Icons.CloudUploadIcon />
            Deploy Agent
          </Button>
        </UnstableCardAction>
      </UnstableCardHeader>
      <div className="flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents by name..."
          />
        </InputGroup>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton variant={isTableFiltered ? "org" : "outline"}>
              <FilterIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            <UnstableDropdownMenuLabel>Filter by Status</UnstableDropdownMenuLabel>
            {STATUSES.map((status) => (
              <UnstableDropdownMenuCheckboxItem
                key={status}
                checked={statusFilter.includes(status)}
                onClick={(e) => {
                  e.preventDefault();
                  handleStatusToggle(status);
                }}
              >
                {status}
              </UnstableDropdownMenuCheckboxItem>
            ))}
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </div>
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
          {filteredAgents.map((agent) => (
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
