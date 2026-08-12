import { useState } from "react";
import { BotIcon, CopyIcon, UserIcon } from "lucide-react";

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { TPolicyRuleInput, useGetAgentPolicies } from "@app/hooks/api/agentPolicies";
import { useGetUserPolicies } from "@app/hooks/api/userPolicies";

import { findPolicyTemplate } from "./PolicyTargetCell";

type Props = {
  onCopy: (rules: TPolicyRuleInput[]) => void;
  // The policy being edited, so it is not offered as a source for itself.
  excludePolicyId?: string;
};

// Both sides of a brokered request are matched against the same rule shape, so rules are worth copying
// across the two policy kinds as well as within one. This is a one-time copy, never a reference, so the
// two policies drift freely afterwards. Copying then narrowing is the common case.
export const CopyRulesPopover = ({ onCopy, excludePolicyId }: Props) => {
  const { projectId } = useProject();
  const [isOpen, setIsOpen] = useState(false);

  const { data: agentPolicies } = useGetAgentPolicies(projectId);
  const { data: userPolicies } = useGetUserPolicies(projectId);

  const sources = [
    { key: "agent", heading: "Agent Policies", icon: BotIcon, policies: agentPolicies },
    { key: "user", heading: "User Policies", icon: UserIcon, policies: userPolicies }
  ]
    .map((source) => ({
      ...source,
      policies: (source.policies ?? []).filter(
        (policy) => policy.id !== excludePolicyId && policy.rules.length
      )
    }))
    .filter((source) => source.policies.length);

  if (!sources.length) return null;

  const handleSelect = (rules: TPolicyRuleInput[]) => {
    onCopy(rules.map((rule) => ({ hostPattern: rule.hostPattern, methods: rule.methods })));
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" type="button" role="combobox" aria-expanded={isOpen}>
          <CopyIcon className="mr-1 size-4" />
          Copy Rules From
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search policies..." />
          <CommandList>
            <CommandEmpty>No policies found.</CommandEmpty>
            {sources.map(({ key, heading, icon: Icon, policies }, i) => (
              <div key={key}>
                {i > 0 && <CommandSeparator />}
                <CommandGroup heading={heading}>
                  {policies.map((policy) => (
                    <CommandItem
                      key={policy.id}
                      value={`${key}-${policy.id}`}
                      keywords={[
                        policy.name,
                        findPolicyTemplate(policy.target)?.name ?? policy.target
                      ]}
                      onSelect={() => handleSelect(policy.rules)}
                    >
                      <Icon />
                      <span className="truncate">{policy.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted">
                        {policy.rules.length} {policy.rules.length === 1 ? "rule" : "rules"}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
