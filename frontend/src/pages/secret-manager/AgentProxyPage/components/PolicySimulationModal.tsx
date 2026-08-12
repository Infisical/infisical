import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  CircleAlertIcon,
  GlobeIcon,
  LucideIcon,
  PlusIcon,
  SendIcon,
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
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
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
  parsePolicyRequest,
  PolicyRuleMismatch,
  TEvaluatedRule,
  TPolicyRequest
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

const MISMATCH_LABEL: Record<PolicyRuleMismatch, string> = {
  [PolicyRuleMismatch.Host]: "different host",
  [PolicyRuleMismatch.Port]: "different port",
  [PolicyRuleMismatch.Scheme]: "different scheme",
  [PolicyRuleMismatch.Path]: "path outside the rule",
  [PolicyRuleMismatch.Method]: "method not covered"
};

type TStageState = "idle" | "pass" | "stop";

const STAGE_CLASSNAME: Record<TStageState, string> = {
  idle: "border-border bg-container/40 text-muted",
  pass: "border-success/25 bg-success/5 text-success",
  stop: "border-danger/25 bg-danger/5 text-danger"
};

const FlowStage = ({
  label,
  icon: Icon,
  value,
  state,
  className,
  children
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  state: TStageState;
  className?: string;
  children?: ReactNode;
}) => (
  <div
    className={cn(
      "flex min-w-0 flex-1 flex-col gap-1 rounded-md border px-3 py-2.5",
      STAGE_CLASSNAME[state],
      className
    )}
  >
    <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-label uppercase">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {state === "pass" && <CheckIcon className="ml-auto size-3.5 shrink-0" />}
      {state === "stop" && <XIcon className="ml-auto size-3.5 shrink-0" />}
    </div>
    <div className="truncate text-sm text-foreground" title={value}>
      {value}
    </div>
    {children}
  </div>
);

// The link between two stages: solid once traffic has reached the next one, severed where it stops.
const FlowLink = ({ state }: { state: TStageState }) => (
  <div className="flex w-7 shrink-0 items-center justify-center">
    <ArrowRightIcon
      className={cn(
        "size-4",
        state === "pass" && "text-success",
        state === "stop" && "text-danger/50",
        state === "idle" && "text-muted/40"
      )}
    />
  </div>
);

type TSide = {
  name: string;
  isMatched: boolean;
  rules: TEvaluatedRule[];
};

const RulePanel = ({
  heading,
  side,
  // Before a request can be read there is nothing to dim: rules render as written, with no verdict.
  isIdle
}: {
  heading: string;
  side: TSide;
  isIdle: boolean;
}) => (
  <div className="flex min-w-0 flex-col rounded-md border border-border bg-container/50">
    <div className="border-b border-border px-3 py-2 text-[11px] tracking-wide text-label uppercase">
      {heading}
    </div>
    <div className="flex flex-col divide-y divide-border">
      {side.rules.map((rule) => {
        const isDimmed = !isIdle && !rule.isMatched;

        return (
          <div
            key={rule.id}
            className={cn(
              "flex items-start gap-2 px-3 py-2.5 transition-opacity duration-150",
              isDimmed ? "opacity-45" : "opacity-100"
            )}
          >
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {isIdle && <span className="size-1.5 rounded-full bg-muted" />}
              {!isIdle && rule.isMatched && <CheckIcon className="size-4 text-success" />}
              {isDimmed && <XIcon className="size-4 text-muted" />}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "font-mono text-xs break-all",
                  rule.isMatched && !isIdle ? "text-foreground" : "text-muted"
                )}
              >
                {rule.hostPattern}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="neutral">
                  {rule.methods.length ? rule.methods.join(", ") : "Any"}
                </Badge>
                {rule.isDeciding && !isIdle && <Badge variant="success">Deciding</Badge>}
                {isDimmed && (
                  <span className="text-xs text-muted">
                    {rule.mismatches.map((reason) => MISMATCH_LABEL[reason]).join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
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

// Neither policy is a subset of the other and nothing is precomputed, so the only honest way to show
// where a request lands is to put one through. Matching is pure and the rules are already loaded, so it
// runs on every change rather than behind a button: the answer is the feedback on what you typed.
//
// The two gates are drawn in series, but they are an AND of two independent checks, not a pipeline:
// each reports its own verdict even when the one before it already stopped the request.
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

  const result = useMemo(() => {
    if (!resolvedAgentPolicy || !resolvedUserPolicy) return null;

    const idleSide = (policy: { name: string; rules: TAgentPolicy["rules"] }): TSide => ({
      name: policy.name,
      isMatched: false,
      rules: policy.rules.map((rule) => ({
        ...rule,
        isMatched: false,
        isDeciding: false,
        mismatches: []
      }))
    });

    if (!request) {
      return {
        request: null as TPolicyRequest | null,
        agent: idleSide(resolvedAgentPolicy),
        user: idleSide(resolvedUserPolicy),
        isBrokered: false,
        reason: null as string | null,
        contender: null
      };
    }

    const agent = evaluatePolicyRules(resolvedAgentPolicy.rules, request);
    const user = evaluatePolicyRules(resolvedUserPolicy.rules, request);

    let reason: string | null = null;
    // The agent side is named first when neither matches, the same order the proxy reports it in.
    if (!agent.isMatched)
      reason = `No rule on agent policy "${resolvedAgentPolicy.name}" covers this request.`;
    else if (!user.isMatched)
      reason = `No rule on user policy "${resolvedUserPolicy.name}" covers this request.`;

    return {
      request,
      agent: { name: resolvedAgentPolicy.name, ...agent },
      user: { name: resolvedUserPolicy.name, ...user },
      isBrokered: agent.isMatched && user.isMatched,
      reason,
      contender: agent.specificity
        ? findContendingAgentPolicy(
            resolvedAgentPolicy,
            agentPolicies ?? [],
            agent.specificity,
            request
          )
        : null
    };
  }, [resolvedAgentPolicy, resolvedUserPolicy, agentPolicies, request]);

  const anchoredName = agentPolicy?.name ?? userPolicy?.name;
  const isIdle = !result?.request;

  const stageState = (isPassing: boolean): TStageState => {
    if (isIdle) return "idle";
    return isPassing ? "pass" : "stop";
  };

  const outcomeLabel = (() => {
    if (isIdle) return "—";
    return result?.isBrokered ? "Brokered" : "Blocked";
  })();

  // The fix for a blocked request is one rule on whichever side turned it away, so it is offered here
  // rather than sending the reader back to the policy form to re-derive it. The host alone is used,
  // not the path: it is the narrowest rule that is still obvious to read later.
  const handleAllowRequest = async (side: "agent" | "user") => {
    const blocked = result?.request;
    const policy = side === "agent" ? resolvedAgentPolicy : resolvedUserPolicy;
    if (!blocked || !policy) return;

    const rules = withRequestAllowed(policy.rules, blocked.host, method);
    try {
      if (side === "agent") {
        await updateAgentPolicy.mutateAsync({ policyId: policy.id, projectId, rules });
      } else {
        await updateUserPolicy.mutateAsync({ policyId: policy.id, projectId, rules });
      }
      createNotification({
        type: "success",
        text: `${policy.name} now allows ${method} on ${blocked.host}`
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Test a Request</DialogTitle>
          <DialogDescription>
            A request is brokered when it matches a rule on both sides.{" "}
            {anchoredName
              ? `Type one to watch it land against ${anchoredName} and the policy you pick.`
              : "Pick the two policies to put a request through."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-3">
            <Field className="min-w-56 flex-1">
              <FieldLabel>{isAgentAnchored ? "User Policy" : "Agent Policy"}</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  placeholder={
                    isAgentAnchored ? "Select a user policy..." : "Select an agent policy..."
                  }
                  options={counterparts}
                  value={counterpart}
                  onChange={(option) => setCounterpartId((option as { id: string } | null)?.id)}
                  getOptionValue={(option) => option.id}
                  getOptionLabel={(option) => option.name}
                />
              </FieldContent>
              {!counterparts.length && (
                <FieldDescription>
                  No {isAgentAnchored ? "user" : "agent"} policies in this project yet, so nothing
                  is brokered.
                </FieldDescription>
              )}
            </Field>
            <Field className="w-28 shrink-0">
              <FieldLabel>Method</FieldLabel>
              <FieldContent>
                <Select
                  value={method}
                  onValueChange={(value) => setMethod(value as PolicyRuleMethod)}
                >
                  <SelectTrigger className="w-full">
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
              </FieldContent>
            </Field>
            <Field className="min-w-64 flex-[2]">
              <FieldLabel>URL</FieldLabel>
              <FieldContent>
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://api.slack.com/chat.postMessage"
                  isError={Boolean(error)}
                  autoFocus
                />
              </FieldContent>
              {error ? (
                <FieldError>{error}</FieldError>
              ) : (
                <FieldDescription>
                  A missing scheme is read as https. The query string is ignored.
                </FieldDescription>
              )}
            </Field>
          </div>

          {result && (
            <>
              <div className="flex items-stretch rounded-md border border-border bg-container/30 p-3">
                <FlowStage
                  label="Request"
                  icon={SendIcon}
                  state={isIdle ? "idle" : "pass"}
                  value={result.request ? formatPolicyRequest(result.request) : "Waiting for a URL"}
                  // The URL is the longest thing on the rail, and the one worth reading in full.
                  className="flex-[1.8]"
                >
                  <Badge className="w-fit" variant="neutral">
                    {method}
                  </Badge>
                </FlowStage>
                <FlowLink state={isIdle ? "idle" : "pass"} />
                <FlowStage
                  label="Agent Policy"
                  icon={BotIcon}
                  state={stageState(result.agent.isMatched)}
                  value={result.agent.name}
                />
                <FlowLink state={stageState(result.agent.isMatched)} />
                <FlowStage
                  label="User Policy"
                  icon={UserIcon}
                  state={stageState(result.user.isMatched)}
                  value={result.user.name}
                />
                <FlowLink state={stageState(result.isBrokered)} />
                <FlowStage
                  label="Upstream"
                  icon={GlobeIcon}
                  state={stageState(result.isBrokered)}
                  value={outcomeLabel}
                />
              </div>

              {/* Kept in the flow whether or not there is a reason, so the panels below it do not jump
                  as the verdict changes under the cursor. */}
              <p className="min-h-8 text-xs text-danger">
                {result.reason}
                {result.reason && !result.agent.isMatched && (
                  <span className="text-muted">
                    {" "}
                    A host on the proxy&apos;s allowlist still passes through without a credential.
                  </span>
                )}
              </p>

              {!isIdle && !result.isBrokered && result.request && (
                <div className="-mt-2 flex flex-wrap items-center gap-2">
                  {!result.agent.isMatched && resolvedAgentPolicy && canEditAgentPolicy && (
                    <Button
                      variant="outline"
                      size="sm"
                      isPending={updateAgentPolicy.isPending}
                      onClick={() => handleAllowRequest("agent")}
                    >
                      <PlusIcon />
                      Allow {method} on {result.request.host} in {resolvedAgentPolicy.name}
                    </Button>
                  )}
                  {!result.user.isMatched && resolvedUserPolicy && canEditUserPolicy && (
                    <Button
                      variant="outline"
                      size="sm"
                      isPending={updateUserPolicy.isPending}
                      onClick={() => handleAllowRequest("user")}
                    >
                      <PlusIcon />
                      Allow {method} on {result.request.host} in {resolvedUserPolicy.name}
                    </Button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <RulePanel heading="Agent Rules" side={result.agent} isIdle={isIdle} />
                <RulePanel heading="User Rules" side={result.user} isIdle={isIdle} />
              </div>

              {result.contender && (
                <Alert variant="warning">
                  <CircleAlertIcon />
                  <AlertTitle>Another agent policy wins this request</AlertTitle>
                  <AlertDescription>
                    <span>
                      {result.contender.name} matches it more specifically for{" "}
                      {result.contender.agentNames.join(", ")}, so its credentials are the ones
                      brokered.
                    </span>
                  </AlertDescription>
                </Alert>
              )}
            </>
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
