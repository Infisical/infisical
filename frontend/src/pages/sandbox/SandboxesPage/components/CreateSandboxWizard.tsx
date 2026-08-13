import { useEffect, useRef, useState } from "react";
import { BoxIcon, TerminalIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep,
  TextArea
} from "@app/components/v3";
import {
  SandboxAgentType,
  streamSandboxStart,
  TSandboxBootEvent,
  useAddSandboxIntegration,
  useCreateSandbox,
  useUpdateSandbox
} from "@app/hooks/api/sandboxes";

import { AGENT_MODELS, getDefaultModel } from "../../components/agentModels";
import {
  SandboxAccessPanel,
  TAccessIntegration,
  TAddIntegrationPayload
} from "../../components/SandboxAccessPanel";
import { markSandboxJustCreated } from "../../components/SandboxShine";
import { AGENT_ICONS } from "../../SandboxPage/components/agentIcons";
import { BootTerminal, TBootLine, TBootStep } from "./BootTerminal";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: (sandboxId: string) => void;
};

const STEPS = [
  {
    name: "Agent",
    short: "Who works here",
    title: "Choose an agent",
    subtitle: "The sandbox can run an AI agent, or stay a plain machine you drive yourself."
  },
  {
    name: "Access",
    short: "What it can reach",
    title: "Grant access",
    subtitle:
      "Pick the services and databases this sandbox may reach. It never holds the credentials."
  },
  {
    name: "Details",
    short: "Name it",
    title: "Name your sandbox",
    subtitle: "Something you will recognise in the list."
  },
  {
    name: "Boot",
    short: "Start it up",
    title: "Starting your sandbox",
    subtitle: "Building the container and opening its brokered connections."
  }
];

const AGENTS = [
  { type: SandboxAgentType.Gemini, name: "Gemini", tokenLabel: "Google AI API key" },
  { type: SandboxAgentType.Claude, name: "Claude", tokenLabel: "Anthropic API key" },
  { type: SandboxAgentType.Codex, name: "ChatGPT", tokenLabel: "OpenAI API key" },
  { type: SandboxAgentType.Copilot, name: "Copilot", tokenLabel: "GitHub token" }
];

const BOOT_STEP_ORDER = [
  { label: "container", fallback: "Creating the container" },
  { label: "databases", fallback: "Opening brokered sessions" },
  { label: "credentials", fallback: "Resolving credentials" },
  { label: "proxy", fallback: "Starting the egress proxy" },
  { label: "ready", fallback: "Ready" }
];

export const CreateSandboxWizard = ({ isOpen, onOpenChange, onCreated }: Props) => {
  const createSandbox = useCreateSandbox();
  const updateSandbox = useUpdateSandbox();
  const addIntegration = useAddSandboxIntegration();

  const [step, setStep] = useState(0);
  const [agentType, setAgentType] = useState<SandboxAgentType | null>(null);
  const [isPlainVm, setIsPlainVm] = useState(false);
  const [agentToken, setAgentToken] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [drafts, setDrafts] = useState<TAddIntegrationPayload[]>([]);
  const [pamAccountIds, setPamAccountIds] = useState<string[]>([]);

  const [bootSteps, setBootSteps] = useState<TBootStep[]>([]);
  const [bootLines, setBootLines] = useState<TBootLine[]>([]);
  const [isBootDone, setIsBootDone] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = () => {
    setStep(0);
    setAgentType(null);
    setIsPlainVm(false);
    setAgentToken("");
    setAgentModel("");
    setName("");
    setDescription("");
    setDrafts([]);
    setPamAccountIds([]);
    setBootSteps([]);
    setBootLines([]);
    setIsBootDone(false);
    setCreatedId(null);
  };

  const accessIntegrations: TAccessIntegration[] = drafts.map((draft) => ({
    key: draft.type,
    type: draft.type,
    secretKey: draft.secret.secretKey
  }));

  const canContinue = (() => {
    if (step === 0) return isPlainVm || Boolean(agentType && agentToken.trim());
    if (step === 2) return Boolean(name.trim());
    return true;
  })();

  const runBoot = async (sandboxId: string) => {
    setBootSteps(
      BOOT_STEP_ORDER.map((s, i) => ({
        label: s.label,
        message: s.fallback,
        state: i === 0 ? "active" : "pending"
      }))
    );

    const controller = new AbortController();
    abortRef.current = controller;

    const apply = (event: TSandboxBootEvent) => {
      if (event.type === "step") {
        setBootSteps((prev) => {
          const index = prev.findIndex((s) => s.label === event.label);
          if (index === -1) return prev;
          return prev.map((s, i) => {
            if (i < index) return s.state === "pending" ? { ...s, state: "done" } : s;
            if (i === index) return { ...s, message: event.message, state: "active" };
            return s;
          });
        });
      } else if (event.type === "log") {
        setBootLines((prev) => [...prev, { text: event.message }]);
      } else if (event.type === "ready") {
        setBootSteps((prev) => prev.map((s) => ({ ...s, state: "done" })));
        setBootLines((prev) => [...prev, { text: "Sandbox ready." }]);
      } else if (event.type === "error") {
        setBootSteps((prev) =>
          prev.map((s) => (s.state === "active" ? { ...s, state: "error" } : s))
        );
        setBootLines((prev) => [...prev, { text: event.message, isError: true }]);
      }
    };

    try {
      await streamSandboxStart(sandboxId, apply, controller.signal);
    } catch (error) {
      apply({
        type: "error",
        message: error instanceof Error ? error.message : "The sandbox failed to start."
      });
    } finally {
      setIsBootDone(true);
      abortRef.current = null;
    }
  };

  const handleCreate = async () => {
    const sandbox = await createSandbox.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      vcpu: 2,
      memoryMb: 2048
    });

    // Creation takes only the basics, so the agent and its grants are applied to the new sandbox
    // before it is started. Each failure is surfaced rather than silently producing a sandbox that
    // is missing an integration the user picked.
    if (agentType && agentToken.trim()) {
      await updateSandbox.mutateAsync({
        sandboxId: sandbox.id,
        agentType,
        agentModel: agentModel || getDefaultModel(agentType),
        agentToken: agentToken.trim()
      });
    }

    if (pamAccountIds.length) {
      await updateSandbox.mutateAsync({ sandboxId: sandbox.id, pamAccountIds });
    }

    // Sequential on purpose: each add rewrites the sandbox's grants, so parallel writes would
    // race and the last one home would drop the others.
    await drafts.reduce(
      (chain, draft) =>
        chain.then(async () => {
          await addIntegration.mutateAsync({ sandboxId: sandbox.id, ...draft });
        }),
      Promise.resolve()
    );

    setCreatedId(sandbox.id);
    setStep(3);
    await runBoot(sandbox.id);
  };

  const goNext = async () => {
    if (step < 2) {
      setStep(step + 1);
      return;
    }

    if (step === 2) {
      try {
        await handleCreate();
      } catch (error) {
        createNotification({
          type: "error",
          text: error instanceof Error ? error.message : "Could not create the sandbox"
        });
      }
    }
  };

  // A PAM account is an integration too, so the summary counts them together.
  const grantCount = drafts.length + pamAccountIds.length;
  const currentStep = STEPS[step];
  const isPending = createSandbox.isPending || updateSandbox.isPending || addIntegration.isPending;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(next) => {
        // Closing mid-boot would orphan the stream, and the sandbox already exists by then.
        if (!next && step === 3 && !isBootDone) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1100px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-product-sandbox/25 bg-gradient-to-br from-product-sandbox/15 to-product-sandbox/5">
                <BoxIcon className="h-5 w-5 sandbox-chrome-icon" />
              </div>
              <div>
                <div className="text-mineshaft-300">Create Sandbox</div>
                <p className="text-sm leading-4 text-mineshaft-400">
                  An isolated container that reaches your systems through credentials it never
                  holds.
                </p>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
              <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
                Setup steps
              </p>
              <Stepper
                className="sandbox-stepper"
                activeStep={step}
                orientation="vertical"
                onStepChange={(i) => {
                  // The sandbox exists once boot starts, so earlier steps no longer apply.
                  if (i < step && step < 3) setStep(i);
                }}
              >
                <StepperList>
                  {STEPS.map((s, i) => (
                    <StepperStep key={s.name} index={i} title={s.name} description={s.short} />
                  ))}
                </StepperList>
              </Stepper>
            </aside>

            <div className="flex thin-scrollbar min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">{currentStep.title}</h2>
                <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
              </div>

              {step === 0 && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    {AGENTS.map((agent) => {
                      const Icon = AGENT_ICONS[agent.type];
                      const isSelected = agentType === agent.type;

                      return (
                        <button
                          key={agent.type}
                          type="button"
                          onClick={() => {
                            setAgentType(agent.type);
                            setAgentModel(getDefaultModel(agent.type));
                            setIsPlainVm(false);
                          }}
                          className={`group flex cursor-pointer items-center gap-3 rounded-md border p-4 text-left transition-all duration-200 hover:scale-[1.01] ${
                            isSelected
                              ? "border-product-sandbox/50 bg-gradient-to-br from-product-sandbox/[0.08] to-transparent"
                              : "border-border bg-card hover:border-mineshaft-500"
                          }`}
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-container [&>svg]:size-4.5">
                            <Icon />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{agent.name}</p>
                            <p className="truncate text-xs text-muted">{agent.tokenLabel}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPlainVm(true);
                      setAgentType(null);
                      setAgentToken("");
                      setAgentModel("");
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-left transition-all duration-200 hover:scale-[1.005] ${
                      isPlainVm
                        ? "border-product-sandbox/50 bg-gradient-to-br from-product-sandbox/[0.08] to-transparent"
                        : "border-border bg-card hover:border-mineshaft-500"
                    }`}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-container">
                      <TerminalIcon className="size-4.5 text-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">Plain VM</p>
                      <p className="text-xs text-muted">
                        No agent. Just a shell you drive from the terminal.
                      </p>
                    </div>
                  </button>

                  {agentType && (
                    <Field className="mt-2">
                      <FieldLabel htmlFor="agent-model">Model</FieldLabel>
                      <Select value={agentModel} onValueChange={setAgentModel}>
                        <SelectTrigger id="agent-model" className="w-full">
                          <SelectValue placeholder="Choose a model" />
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="w-(--radix-select-trigger-width)"
                        >
                          {AGENT_MODELS[agentType].map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              <span className="flex items-center gap-2">
                                {model.name}
                                {model.isRecommended && (
                                  <Badge variant="neutral">Recommended</Badge>
                                )}
                                <span className="text-xs text-muted">{model.hint}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  {agentType && (
                    <Field>
                      <FieldLabel htmlFor="agent-token">
                        {AGENTS.find((a) => a.type === agentType)?.tokenLabel}
                      </FieldLabel>
                      <Input
                        id="agent-token"
                        type="password"
                        value={agentToken}
                        onChange={(e) => setAgentToken(e.target.value)}
                        placeholder="Paste the key"
                        autoComplete="off"
                      />
                      <FieldDescription>
                        Stored encrypted and used by the API. The sandbox never sees it.
                      </FieldDescription>
                    </Field>
                  )}
                </div>
              )}

              {step === 1 && (
                <SandboxAccessPanel
                  integrations={accessIntegrations}
                  pamAccountIds={pamAccountIds}
                  onAddIntegration={(payload) =>
                    setDrafts((prev) => [...prev.filter((d) => d.type !== payload.type), payload])
                  }
                  onRemoveIntegration={(key) =>
                    setDrafts((prev) => prev.filter((d) => d.type !== key))
                  }
                  onTogglePamAccount={(accountId) =>
                    setPamAccountIds((prev) =>
                      prev.includes(accountId)
                        ? prev.filter((id) => id !== accountId)
                        : [...prev, accountId]
                    )
                  }
                />
              )}

              {step === 2 && (
                <div className="flex flex-col gap-4">
                  <Field>
                    <FieldLabel htmlFor="sandbox-name">Name</FieldLabel>
                    <Input
                      id="sandbox-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="sales-agent"
                      autoFocus
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="sandbox-description">
                      Description <span className="text-xs font-normal text-muted">(optional)</span>
                    </FieldLabel>
                    <TextArea
                      id="sandbox-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What this sandbox is for"
                      rows={3}
                    />
                  </Field>

                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
                    <span className="text-xs text-muted">Summary:</span>
                    <Badge variant="neutral">
                      {isPlainVm
                        ? "Plain VM"
                        : (AGENTS.find((a) => a.type === agentType)?.name ?? "No agent")}
                    </Badge>
                    <Badge variant="neutral">2 vCPU · 2 GB</Badge>
                    {grantCount > 0 && (
                      <Badge variant="neutral">
                        {grantCount} integration{grantCount === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <BootTerminal steps={bootSteps} lines={bootLines} isDone={isBootDone} />
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
            <span className="text-xs text-muted" />
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">
                Step {step + 1} of {STEPS.length}
              </span>
              {step > 0 && step < 3 && (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              {step < 3 ? (
                <Button
                  variant="project"
                  onClick={() => {
                    goNext().catch(() => {});
                  }}
                  isDisabled={!canContinue}
                  isPending={isPending}
                >
                  {step === 2 ? "Create & Start" : "Continue"}
                </Button>
              ) : (
                <Button
                  variant="project"
                  isDisabled={!isBootDone}
                  onClick={() => {
                    const id = createdId;
                    if (!id) return;

                    // The sweep is played by the sandbox page on arrival, not here: this
                    // component unmounts on navigation, so anything started here would run
                    // over the page being left behind.
                    markSandboxJustCreated(id);
                    onOpenChange(false);
                    reset();
                    onCreated(id);
                  }}
                >
                  Open Sandbox
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
