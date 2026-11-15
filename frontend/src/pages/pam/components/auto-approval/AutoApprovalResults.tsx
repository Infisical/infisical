import { Check, ExternalLink, X, Zap } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@app/components/v3";
import { TAutoApprovalOutcome } from "@app/hooks/api/approvalPolicies";

type Props = {
  outcome: TAutoApprovalOutcome;
};

export const LinkedRecordValue = ({ input }: { input: TAutoApprovalOutcome["inputs"][number] }) =>
  input.url ? (
    <a
      href={input.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
    >
      {input.value}
      <ExternalLink className="size-3" />
    </a>
  ) : (
    <span className="text-foreground">{input.value}</span>
  );

const LinkedRecords = ({ inputs }: { inputs: TAutoApprovalOutcome["inputs"] }) => {
  if (!inputs.length) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {inputs.map((input) => (
        <span key={`${input.label}:${input.value}`} className="text-muted">
          {input.label}: <LinkedRecordValue input={input} />
        </span>
      ))}
    </div>
  );
};

const ConditionResult = ({
  condition
}: {
  condition: TAutoApprovalOutcome["rules"][number]["conditions"][number];
}) => (
  <li className="flex items-start gap-2 text-xs">
    {condition.passed ? (
      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
    ) : (
      <X className="mt-0.5 size-3.5 shrink-0 text-danger" />
    )}
    <div className="min-w-0">
      <p className="text-foreground">{condition.description}</p>
      {!condition.passed && condition.reason && <p className="text-muted">{condition.reason}</p>}
    </div>
  </li>
);

type TRuleOutcome = TAutoApprovalOutcome["rules"][number];

const RuleSummary = ({ rule }: { rule: TRuleOutcome }) => {
  const failed = rule.conditions.filter((condition) => !condition.passed);
  if (!failed.length) {
    return <span className="text-muted">All {rule.conditions.length} checks passed</span>;
  }
  const [first] = failed;
  return (
    <span className="min-w-0 truncate text-muted">
      {first.reason ?? first.description}
      {failed.length > 1 && ` (+${failed.length - 1} more)`}
    </span>
  );
};

// Each rule collapses to one line, so a policy with many rules stays short
const RuleResults = ({ rules }: { rules: TRuleOutcome[] }) => (
  <Accordion type="multiple" variant="ghost">
    {rules.map((rule) => {
      const passed = rule.conditions.every((condition) => condition.passed);
      return (
        <AccordionItem key={rule.id} value={rule.id} className="border-b-0">
          <AccordionTrigger className="gap-2 text-xs font-normal group-data-[variant=ghost]/accordion:min-h-7 group-data-[variant=ghost]/accordion:py-1 [&>[data-slot=accordion-chevron]]:order-last [&>[data-slot=accordion-chevron]]:ml-auto [&>[data-slot=accordion-chevron]]:opacity-50">
            {passed ? (
              <Check className="size-3.5 shrink-0 text-success" />
            ) : (
              <X className="size-3.5 shrink-0 text-danger" />
            )}
            <span className="shrink-0 font-medium text-foreground">{rule.name}</span>
            <RuleSummary rule={rule} />
          </AccordionTrigger>
          <AccordionContent className="pl-6 group-data-[variant=ghost]/accordion:pt-1 group-data-[variant=ghost]/accordion:pb-2">
            <ul className="flex flex-col gap-1.5">
              {rule.conditions.map((condition) => (
                <ConditionResult key={condition.id} condition={condition} />
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

// Why a request was auto-approved, or why each rule did not approve it
export const AutoApprovalResults = ({ outcome }: Props) => {
  const approvingRule = outcome.rules.find((rule) => rule.id === outcome.approvedByRuleId);
  const isApproved = Boolean(outcome.approvedAt && approvingRule);

  return (
    <div
      className={
        isApproved
          ? "flex flex-col gap-1.5 rounded-md border border-success/40 bg-success/5 px-3 py-2.5"
          : "flex flex-col gap-1.5 rounded-md border border-border bg-container px-3 py-2.5"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {isApproved && <Zap className="size-3.5 shrink-0 text-success" />}
          {isApproved ? "Approved" : "No rule passed"}
        </p>
        <LinkedRecords inputs={outcome.inputs} />
      </div>
      <RuleResults rules={isApproved && approvingRule ? [approvingRule] : outcome.rules} />
    </div>
  );
};
