import { useEffect, useMemo, useState } from "react";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  LucideIcon,
  PlusIcon,
  UserIcon,
  XIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterableSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  evaluatePolicyRules,
  findContendingAgentPolicy,
  formatPolicyRequest,
  parsePolicyPattern,
  parsePolicyRequest,
  PolicyRuleMismatch,
  TEvaluatedRule,
  TPolicyRequest,
  TPolicyRuleSpecificity
} from "@app/helpers/policyMatch";
import { useDebounce } from "@app/hooks";
import {
  PolicyRuleMethod,
  TAgentPolicy,
  TPolicyRule,
  useGetAgentPolicies,
  useUpdateAgentPolicy
} from "@app/hooks/api/agentPolicies";
import { TUserPolicy, useGetUserPolicies, useUpdateUserPolicy } from "@app/hooks/api/userPolicies";

const CLAUSE_LABEL: Record<PolicyRuleMismatch, string> = {
  [PolicyRuleMismatch.Host]: "host",
  [PolicyRuleMismatch.Scheme]: "scheme",
  [PolicyRuleMismatch.Port]: "port",
  [PolicyRuleMismatch.Path]: "path",
  [PolicyRuleMismatch.Method]: "method"
};

type TMissContext = {
  pattern: ReturnType<typeof parsePolicyPattern>;
  request: TPolicyRequest;
  rule: TEvaluatedRule;
};

const MISS_REASON: Record<PolicyRuleMismatch, (context: TMissContext) => string> = {
  [PolicyRuleMismatch.Host]: ({ request }) => `${request.host} is a different host`,
  [PolicyRuleMismatch.Scheme]: ({ pattern, request }) =>
    `${request.scheme} is not ${pattern.scheme}`,
  [PolicyRuleMismatch.Port]: ({ pattern, request }) =>
    `port ${request.port} is not ${pattern.port}`,
  [PolicyRuleMismatch.Path]: ({ pattern, request }) => `${request.path} is outside ${pattern.path}`,
  [PolicyRuleMismatch.Method]: ({ request, rule }) =>
    `${request.method} is not in ${rule.methods.join(", ")}`
};

const countLabel = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

// Every clause the rule constrains, in one fixed order so the marks line up as columns down the list.
// A rule naming no method still gets a method mark: "Any covers this one" answers the same question.
const listRuleClauses = (rule: TEvaluatedRule) => {
  const pattern = parsePolicyPattern(rule.hostPattern);
  const clauses = [PolicyRuleMismatch.Host];
  if (pattern.scheme) clauses.push(PolicyRuleMismatch.Scheme);
  if (pattern.port) clauses.push(PolicyRuleMismatch.Port);
  if (pattern.path) clauses.push(PolicyRuleMismatch.Path);
  clauses.push(PolicyRuleMismatch.Method);

  return clauses.map((clause) => ({ clause, isMatched: !rule.mismatches.includes(clause) }));
};

const joinReasons = (reasons: string[]) => {
  if (reasons.length < 2) return reasons[0] ?? "";
  return `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
};

// The rule that failed on the fewest clauses is the one the author most likely meant to cover the
// request, so it gets a sentence rather than leaving them to read every row's marks.
const describeClosestMiss = (rules: TEvaluatedRule[], request: TPolicyRequest) => {
  const closest = rules
    .filter((rule) => !rule.isMatched)
    .reduce<
      TEvaluatedRule | undefined
    >((best, rule) => (!best || rule.mismatches.length < best.mismatches.length ? rule : best), undefined);
  if (!closest) return null;

  const pattern = parsePolicyPattern(closest.hostPattern);
  const reasons = joinReasons(
    closest.mismatches.map((clause) => MISS_REASON[clause]({ pattern, request, rule: closest }))
  );

  // Leading with the clause the rule did cover is what turns a list of failures into a diagnosis.
  const lead = () => {
    if (closest.methods.length && !closest.mismatches.includes(PolicyRuleMismatch.Method))
      return `allows ${request.method}, but`;
    if (!closest.mismatches.includes(PolicyRuleMismatch.Host)) return "matches the host, but";
    return "turns it away:";
  };

  return { hostPattern: closest.hostPattern, detail: `${lead()} ${reasons}.` };
};

type TGateSide = {
  name: string;
  isMatched: boolean;
  matchedCount: number;
  rules: TEvaluatedRule[];
};

const evaluateSide = (
  policy: { name: string; rules: TAgentPolicy["rules"] } | undefined,
  request: TPolicyRequest | null
): { side: TGateSide; specificity?: TPolicyRuleSpecificity } | null => {
  if (!policy) return null;

  // Before a request can be read there is nothing to judge: the rules render as written, no verdict.
  if (!request) {
    return {
      side: {
        name: policy.name,
        isMatched: false,
        matchedCount: 0,
        rules: policy.rules.map((rule) => ({
          ...rule,
          isMatched: false,
          isDeciding: false,
          mismatches: []
        }))
      },
      specificity: undefined
    };
  }

  const evaluated = evaluatePolicyRules(policy.rules, request);
  return {
    side: {
      name: policy.name,
      isMatched: evaluated.isMatched,
      matchedCount: evaluated.rules.filter((rule) => rule.isMatched).length,
      rules: evaluated.rules
    },
    specificity: evaluated.specificity
  };
};

type TGateVerdict = "idle" | "open" | "closed";

const GATE_STYLE: Record<TGateVerdict, { card: string; divider: string; verdict: string }> = {
  idle: { card: "border-border bg-container/30", divider: "border-border", verdict: "text-muted" },
  open: {
    card: "border-success/25 bg-success/5",
    divider: "border-success/20",
    verdict: "text-success"
  },
  closed: {
    card: "border-danger/25 bg-danger/5",
    divider: "border-danger/20",
    verdict: "text-danger"
  }
};

const gateVerdict = (side: TGateSide | null, request: TPolicyRequest | null): TGateVerdict => {
  if (!side || !request) return "idle";
  return side.isMatched ? "open" : "closed";
};

const GateCard = ({
  index,
  kind,
  icon: Icon,
  side,
  request,
  isPrecededByClosedGate,
  isExpanded,
  onExpandedChange,
  missingPolicyMessage
}: {
  index: number;
  kind: string;
  icon: LucideIcon;
  side: TGateSide | null;
  request: TPolicyRequest | null;
  isPrecededByClosedGate: boolean;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  missingPolicyMessage: string;
}) => {
  const verdict = gateVerdict(side, request);
  // A gate the request never reached keeps neutral chrome, so the gate that decided stays the one the
  // colour points at.
  const style = GATE_STYLE[isExpanded ? verdict : "idle"];
  const miss = side && request && !side.isMatched ? describeClosestMiss(side.rules, request) : null;

  const verdictLabel = () => {
    if (!side) return null;
    if (verdict === "idle") return countLabel(side.rules.length, "rule");
    if (verdict === "open") return `open · ${countLabel(side.matchedCount, "rule")} matched`;
    if (isPrecededByClosedGate)
      return `also closed · ${countLabel(side.rules.length, "rule")} checked`;
    return "closed · no rule matched";
  };

  const header = (
    <>
      <Icon className="size-3.5 shrink-0 text-label" />
      <span className="shrink-0 text-[11px] tracking-wide text-label uppercase">
        Gate {index} · {kind}
      </span>
      {side && (
        <span className="min-w-0 truncate font-mono text-xs text-foreground" title={side.name}>
          {side.name}
        </span>
      )}
      <span
        className={cn(
          "ml-auto flex shrink-0 items-center gap-1 text-xs",
          GATE_STYLE[verdict].verdict
        )}
      >
        {verdict === "open" && <CheckIcon className="size-3.5" />}
        {verdict === "closed" && <XIcon className="size-3.5" />}
        {verdictLabel()}
      </span>
      {side && (
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted transition-transform",
            !isExpanded && "-rotate-90"
          )}
        />
      )}
    </>
  );

  return (
    <div className={cn("overflow-hidden rounded-md border transition-colors", style.card)}>
      {side ? (
        <button
          type="button"
          onClick={() => onExpandedChange(!isExpanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-container/30"
        >
          {header}
        </button>
      ) : (
        <div className="flex w-full items-center gap-2 px-3 py-2">{header}</div>
      )}

      {!side && (
        <p className={cn("border-t px-3 py-2.5 text-xs text-label", style.divider)}>
          {missingPolicyMessage}
        </p>
      )}

      {side && isExpanded && (
        <div className={cn("border-t", style.divider)}>
          {!side.rules.length && (
            <p className="px-3 py-2.5 text-xs text-label">
              No rules on this policy, so nothing is brokered.
            </p>
          )}
          {side.rules.map((rule) => (
            <div
              key={rule.id}
              className={cn("flex items-center gap-3 px-3 py-2", rule.isMatched && "bg-success/10")}
            >
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
                title={rule.hostPattern}
              >
                {rule.hostPattern}
              </span>
              <Badge variant="neutral">
                {rule.methods.length ? rule.methods.join(", ") : "Any"}
              </Badge>
              {rule.isDeciding && <Badge variant="success">Deciding</Badge>}
              {Boolean(request) && (
                <div className="flex shrink-0 items-center gap-2.5">
                  {listRuleClauses(rule).map(({ clause, isMatched }) => (
                    <span
                      key={clause}
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        isMatched ? "text-success" : "text-danger"
                      )}
                    >
                      {isMatched ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
                      {CLAUSE_LABEL[clause]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {miss && (
            <p className={cn("border-t px-3 py-2 text-xs text-label", style.divider)}>
              Closest miss: <span className="font-mono text-foreground">{miss.hostPattern}</span>{" "}
              {miss.detail}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

type TOutcome = "idle" | "brokered" | "blocked";

const OUTCOME_STYLE: Record<TOutcome, string> = {
  idle: "border-border bg-container/30",
  brokered: "border-success/25 bg-success/5",
  blocked: "border-danger/25 bg-danger/5"
};

const OutcomeCard = ({
  outcome,
  host,
  idleMessage
}: {
  outcome: TOutcome;
  host?: string;
  idleMessage: string;
}) => (
  <div
    className={cn(
      "flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border px-3 py-2.5",
      OUTCOME_STYLE[outcome]
    )}
  >
    {outcome === "idle" && <p className="text-sm text-label">{idleMessage}</p>}

    {outcome === "brokered" && (
      <>
        <p className="text-sm text-foreground">
          <span className="font-semibold text-success">Brokered</span>: the policy&apos;s
          credentials go on the request before it leaves the proxy.
        </p>
        <span className="ml-auto shrink-0 font-mono text-xs text-muted">reaches {host}</span>
      </>
    )}

    {outcome === "blocked" && (
      <>
        <p className="text-sm text-foreground">
          <span className="font-semibold text-danger">Blocked</span>: the proxy answers 403 and no
          credential is attached.
        </p>
        <span className="ml-auto shrink-0 font-mono text-xs text-muted">
          nothing reaches {host}
        </span>
        <p className="w-full text-xs text-muted">
          A host on the proxy&apos;s allowlist still passes through, without a credential.
        </p>
      </>
    )}
  </div>
);

const ruleKey = (rule: { hostPattern: string; methods: PolicyRuleMethod[] }) =>
  `${rule.hostPattern.toLowerCase()} ${[...rule.methods].sort().join(",")}`;

// Merged into the host's existing rule rather than appended, because a second rule for the same host
// reads as a mistake. Widening one rule can make it identical to another on the same host, which the
// API rejects as a duplicate, so the result is deduplicated before it is sent.
const withRequestAllowed = (
  rules: TPolicyRule[],
  hostPattern: string,
  method: PolicyRuleMethod
) => {
  const covers = (rule: TPolicyRule) =>
    rule.hostPattern.toLowerCase() === hostPattern.toLowerCase();
  const existing = rules.find(covers);

  const next = existing
    ? rules.map((rule) =>
        rule === existing
          ? {
              hostPattern: rule.hostPattern,
              // An empty list already means every method, so widening it would narrow the rule.
              methods: rule.methods.length ? [...new Set([...rule.methods, method])] : []
            }
          : { hostPattern: rule.hostPattern, methods: rule.methods }
      )
    : [
        ...rules.map((rule) => ({ hostPattern: rule.hostPattern, methods: rule.methods })),
        { hostPattern, methods: [method] }
      ];

  const seen = new Set<string>();
  return next.filter((rule) => {
    const key = ruleKey(rule);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const RailSegment = () => <div className="ml-6 h-3 w-px shrink-0 bg-border" />;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // The row the test was started from. Whichever side is missing is the one picked here.
  agentPolicy?: TAgentPolicy;
  userPolicy?: TUserPolicy;
  // A request to open with, so a row in the activity feed can be replayed against the policies that
  // judged it rather than retyped.
  initialRequest?: { method: PolicyRuleMethod; url: string };
};

type TGateKey = "agent" | "user";

// Neither policy is a subset of the other and nothing is precomputed, so the only honest way to show
// where a request lands is to put one through. Matching is pure and the rules are already loaded, so it
// runs on every change rather than behind a button: the answer is the feedback on what you typed.
//
// The two gates are stacked in the order the proxy reports them, but they are an AND of two independent
// checks, not a pipeline: each reports its own verdict even when the one before it already stopped the
// request.
export const PolicySimulationModal = ({
  isOpen,
  onOpenChange,
  agentPolicy,
  userPolicy,
  initialRequest
}: Props) => {
  const { projectId } = useProject();
  const { permission } = useProjectPermission();
  const [counterpartId, setCounterpartId] = useState<string>();
  const [method, setMethod] = useState<PolicyRuleMethod>(PolicyRuleMethod.Get);
  const [url, setUrl] = useState("");
  const [expandedGates, setExpandedGates] = useState<Partial<Record<TGateKey, boolean>>>({});

  const { data: agentPolicies } = useGetAgentPolicies(projectId);
  const { data: userPolicies } = useGetUserPolicies(projectId);
  const updateAgentPolicy = useUpdateAgentPolicy();
  const updateUserPolicy = useUpdateUserPolicy();

  const isAgentAnchored = Boolean(agentPolicy);
  const counterparts = useMemo(
    () =>
      (isAgentAnchored ? (userPolicies ?? []) : (agentPolicies ?? [])).map(({ id, name }) => ({
        id,
        name
      })),
    [isAgentAnchored, agentPolicies, userPolicies]
  );

  useEffect(() => {
    if (!isOpen) return;
    setMethod(initialRequest?.method ?? PolicyRuleMethod.Get);
    setUrl(initialRequest?.url ?? "");
    setExpandedGates({});
    // A caller that already knows both sides seeds the picker with the counterpart it used; otherwise
    // one policy on the other side means there is nothing to choose.
    const seeded = isAgentAnchored ? userPolicy?.id : agentPolicy?.id;
    setCounterpartId(seeded ?? (counterparts.length === 1 ? counterparts[0].id : undefined));
  }, [
    isOpen,
    agentPolicy?.id,
    userPolicy?.id,
    counterparts.length,
    initialRequest?.method,
    initialRequest?.url
  ]);

  // The anchored side is fixed by the caller; the other one follows the picker, so a seeded counterpart
  // can still be swapped for another policy. Both are re-read from the loaded list rather than used as
  // handed over, so a rule added from here re-evaluates the request instead of leaving the caller's
  // snapshot on screen.
  const resolvedAgentPolicy = isAgentAnchored
    ? (agentPolicies?.find((policy) => policy.id === agentPolicy?.id) ?? agentPolicy)
    : agentPolicies?.find((policy) => policy.id === counterpartId);
  const resolvedUserPolicy = isAgentAnchored
    ? userPolicies?.find((policy) => policy.id === counterpartId)
    : (userPolicies?.find((policy) => policy.id === userPolicy?.id) ?? userPolicy);
  const counterpart = counterparts.find((option) => option.id === counterpartId) ?? null;

  // Only the URL settles: a half-typed host parses fine, so evaluating every keystroke would flash a
  // verdict for a request nobody meant to make. A method is a whole choice, so it applies at once.
  const [settledUrl] = useDebounce(url, 250);
  const { request, error } = useMemo(
    () => parsePolicyRequest(settledUrl, method),
    [settledUrl, method]
  );

  const agentGate = useMemo(
    () => evaluateSide(resolvedAgentPolicy, request),
    [resolvedAgentPolicy, request]
  );
  const userGate = useMemo(
    () => evaluateSide(resolvedUserPolicy, request),
    [resolvedUserPolicy, request]
  );

  const contender = useMemo(() => {
    if (!resolvedAgentPolicy || !request || !agentGate?.specificity) return null;
    return findContendingAgentPolicy(
      resolvedAgentPolicy,
      agentPolicies ?? [],
      agentGate.specificity,
      request
    );
  }, [resolvedAgentPolicy, agentPolicies, agentGate, request]);

  const isAgentGateClosed = Boolean(request && agentGate && !agentGate.side.isMatched);
  const isUserGateClosed = Boolean(request && userGate && !userGate.side.isMatched);
  // A gate the request never reached is folded to its verdict: the first closed gate is the answer, and
  // clicking it open is there for the reader who wants the rest anyway.
  const isGateExpanded = (key: TGateKey, isPrecededByClosedGate: boolean) =>
    expandedGates[key] ?? !isPrecededByClosedGate;

  const outcome = (): TOutcome => {
    if (!request || !agentGate || !userGate) return "idle";
    return agentGate.side.isMatched && userGate.side.isMatched ? "brokered" : "blocked";
  };

  const missingCounterpartMessage = counterparts.length
    ? `Pick ${isAgentAnchored ? "a user" : "an agent"} policy above to check this gate.`
    : `No ${isAgentAnchored ? "user" : "agent"} policies in this project yet, so nothing is brokered.`;

  const idleMessage =
    !resolvedAgentPolicy || !resolvedUserPolicy
      ? "Nothing is brokered until both gates have a policy."
      : "Type a URL above to see where a request lands.";

  // Only worth saying when the rules were matched against something other than what was typed: a filled
  // in scheme, a dropped query string, a normalised address.
  const requestHint = () => {
    if (error) return error;
    const formatted = request && formatPolicyRequest(request);
    if (formatted && formatted !== settledUrl.trim()) return `Reads as ${formatted}`;
    return "A missing scheme is read as https. The query string is ignored.";
  };

  // The fix for a blocked request is one rule on whichever side turned it away, so it is offered here
  // rather than sending the reader back to the policy form to re-derive it. The host alone is used,
  // not the path: it is the narrowest rule that is still obvious to read later.
  const handleAllowRequest = async (side: TGateKey) => {
    const policy = side === "agent" ? resolvedAgentPolicy : resolvedUserPolicy;
    if (!request || !policy) return;

    const rules = withRequestAllowed(policy.rules, request.host, method);
    try {
      if (side === "agent") {
        await updateAgentPolicy.mutateAsync({ policyId: policy.id, projectId, rules });
      } else {
        await updateUserPolicy.mutateAsync({ policyId: policy.id, projectId, rules });
      }
      createNotification({
        type: "success",
        text: `${policy.name} now allows ${method} on ${request.host}`
      });
    } catch {
      // The shared mutation error handler surfaces the API error.
    }
  };

  const canEditAgentPolicy = permission.can(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.AgentPolicies
  );
  const canEditUserPolicy = permission.can(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.UserPolicies
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Test a Request</DialogTitle>
          <DialogDescription>
            A request is brokered only when it clears both gates.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as PolicyRuleMethod)}
              >
                <SelectTrigger className="w-24 shrink-0" aria-label="Method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(PolicyRuleMethod).map((option) => (
                    <SelectItem value={option} key={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://api.slack.com/chat.postMessage"
                className="min-w-56 flex-1 font-mono"
                isError={Boolean(error)}
                aria-label="URL"
                autoFocus
              />
              <div className="w-52 shrink-0">
                <FilterableSelect
                  aria-label={isAgentAnchored ? "User Policy" : "Agent Policy"}
                  placeholder={
                    isAgentAnchored ? "Select a user policy..." : "Select an agent policy..."
                  }
                  options={counterparts}
                  value={counterpart}
                  onChange={(option) => setCounterpartId((option as { id: string } | null)?.id)}
                  getOptionValue={(option) => option.id}
                  getOptionLabel={(option) => option.name}
                />
              </div>
            </div>
            <p className={cn("text-xs", error ? "text-danger" : "text-muted")}>{requestHint()}</p>
          </div>

          <div className="flex flex-col">
            <RailSegment />
            <GateCard
              index={1}
              kind="Agent Policy"
              icon={BotIcon}
              side={agentGate?.side ?? null}
              request={request}
              isPrecededByClosedGate={false}
              isExpanded={isGateExpanded("agent", false)}
              onExpandedChange={(isExpanded) =>
                setExpandedGates((prev) => ({ ...prev, agent: isExpanded }))
              }
              missingPolicyMessage={missingCounterpartMessage}
            />
            <RailSegment />
            <GateCard
              index={2}
              kind="User Policy"
              icon={UserIcon}
              side={userGate?.side ?? null}
              request={request}
              isPrecededByClosedGate={isAgentGateClosed}
              isExpanded={isGateExpanded("user", isAgentGateClosed)}
              onExpandedChange={(isExpanded) =>
                setExpandedGates((prev) => ({ ...prev, user: isExpanded }))
              }
              missingPolicyMessage={missingCounterpartMessage}
            />
            <RailSegment />
            <OutcomeCard outcome={outcome()} host={request?.host} idleMessage={idleMessage} />
          </div>

          {request && (isAgentGateClosed || isUserGateClosed) && (
            <div className="flex flex-wrap items-center gap-2">
              {isAgentGateClosed && resolvedAgentPolicy && canEditAgentPolicy && (
                <Button
                  variant="outline"
                  size="sm"
                  isPending={updateAgentPolicy.isPending}
                  onClick={() => handleAllowRequest("agent")}
                >
                  <PlusIcon />
                  Allow {method} on {request.host} in {resolvedAgentPolicy.name}
                </Button>
              )}
              {isUserGateClosed && resolvedUserPolicy && canEditUserPolicy && (
                <Button
                  variant="outline"
                  size="sm"
                  isPending={updateUserPolicy.isPending}
                  onClick={() => handleAllowRequest("user")}
                >
                  <PlusIcon />
                  Allow {method} on {request.host} in {resolvedUserPolicy.name}
                </Button>
              )}
            </div>
          )}

          {contender && (
            <Alert variant="warning">
              <CircleAlertIcon />
              <AlertTitle>Another agent policy wins this request</AlertTitle>
              <AlertDescription>
                <span>
                  {contender.name} matches it more specifically for{" "}
                  {contender.agentNames.join(", ")}, so its credentials are the ones brokered.
                </span>
              </AlertDescription>
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
