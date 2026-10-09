import React, { useEffect, useRef, useState } from "react";

// Mintlify evaluates each export on its own, so the components can't share module-level constants.
// The rules for which answers fit together live in AgentVaultSetupQuestions (BUILDS), and are
// repeated in AgentVaultSetupDiagram, AgentVaultSetupStep, AgentVaultSetupSummary, and
// AgentVaultSetupBranch. Keep them in sync.

export const AgentVaultSetupPage = ({ title, description, children }) => {
  const rootRef = useRef(null);

  useEffect(() => {
    const navbar = document.getElementById("navbar");
    if (rootRef.current && navbar) {
      rootRef.current.style.setProperty(
        "--avsp-top",
        `${Math.round(navbar.getBoundingClientRect().height)}px`,
      );
    }
  }, []);

  return (
    <div className="ifx-avsp" ref={rootRef}>
      <header className="ifx-avsp__hero">
        <h1 className="ifx-avsp__title">{title}</h1>
        {description ? <div className="ifx-avsp__description">{description}</div> : null}
      </header>
      {/* Frame mode drops Mintlify's typography, so the MDX content opts back into its prose classes. */}
      <div className="ifx-avsp__body prose dark:prose-invert">{children}</div>
    </div>
  );
};

export const AgentVaultSetupLayout = ({ aside, children }) => (
  <div className="ifx-avsp__layout">
    <div className="ifx-avsp__content">{children}</div>
    <aside className="ifx-avsp__aside">
      <div className="ifx-avsp__aside-inner">{aside}</div>
    </aside>
  </div>
);

export const AgentVaultSetupQuestions = () => {
  const docsPath =
    typeof window === "undefined" ? "" : window.location.pathname;
  const docsBase =
    docsPath === "/docs" || docsPath.startsWith("/docs/") ? "/docs" : "";

  const AGENT_IMG_BASE = "/images/agent-vault-agents";
  const AGENT_IMAGES = {
    "claude-code": { dark: "claude-code.svg" },
    codex: { light: "OpenAI.png", dark: "OpenAIWhite.png" },
    hermes: { light: "hermes.png", dark: "hermes.on-dark.png" },
    opencode: { light: "opencode.svg", dark: "opencode.on-dark.svg" },
    openclaw: { dark: "openclaw.svg" },
  };

  const BUILDS = [
    {
      id: "personal",
      label: "A coding agent for yourself",
      example: "An agent that you work alongside, on your computer or a dev box.",
      runs: ["computer", "server", "container"],
    },
    {
      id: "assistant",
      label: "An always-on assistant",
      example: "An agent that keeps running and answers messages, such as a chat bot.",
      runs: ["computer", "server", "container"],
    },
    {
      id: "scheduled",
      label: "A scheduled or unattended job",
      example: "An agent that runs on a schedule or in CI, such as one that triages new issues.",
      runs: ["computer", "server", "container", "ci"],
    },
    {
      id: "platform",
      label: "A service that starts agents for tasks",
      example: "Your own service that starts a separate agent for each task it receives.",
      runs: ["server", "container", "ci"],
    },
  ];

  const RUNS = [
    { id: "computer", label: "Your computer", example: "Your laptop or desktop." },
    { id: "server", label: "A server or VM", example: "Such as a dev box, a cloud VM, or a home server." },
    { id: "container", label: "A container", example: "Such as a Docker container or a dev container." },
    { id: "ci", label: "A CI runner", example: "Such as a GitHub Actions job." },
  ];

  const AGENTS = [
    { id: "claude-code", label: "Claude Code" },
    { id: "codex", label: "Codex" },
    { id: "opencode", label: "OpenCode" },
    { id: "hermes", label: "Hermes Agent" },
    { id: "openclaw", label: "OpenClaw" },
    { id: "custom", label: "Your own agent" },
  ];

  const SELECTION_EVENT = "av-setup-selection-change";

  const readSelection = () => {
    const params = new URLSearchParams(window.location.search);
    const build =
      BUILDS.find((option) => option.id === params.get("building")) ?? BUILDS[0];
    const runs = RUNS.find((option) => option.id === params.get("runs"));
    const agent = AGENTS.find((option) => option.id === params.get("agent"));
    return {
      building: build.id,
      runs: runs && build.runs.includes(runs.id) ? runs.id : null,
      agent: agent ? agent.id : null,
    };
  };

  const [selection, setSelection] = useState({
    building: "personal",
    runs: null,
    agent: null,
  });

  useEffect(() => {
    const sync = () => setSelection(readSelection());
    sync();
    window.addEventListener(SELECTION_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(SELECTION_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const choose = (dimension, value) => {
    const toggledOff = dimension !== "building" && selection[dimension] === value;
    const next = { ...selection, [dimension]: toggledOff ? null : value };
    if (dimension === "building") {
      const build = BUILDS.find((option) => option.id === next.building);
      if (next.runs && !build.runs.includes(next.runs)) next.runs = null;
    }
    const params = new URLSearchParams(window.location.search);
    ["building", "runs", "agent"].forEach((key) => {
      if (next[key]) params.set(key, next[key]);
      else params.delete(key);
    });
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    window.dispatchEvent(new Event(SELECTION_EVENT));
  };

  const activeBuild = BUILDS.find((option) => option.id === selection.building);
  const visibleRuns = RUNS.filter((option) => activeBuild.runs.includes(option.id));

  const renderAgentIcon = (id) => {
    if (id === "custom") {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m16 18 6-6-6-6" />
          <path d="m8 6-6 6 6 6" />
        </svg>
      );
    }
    const image = AGENT_IMAGES[id];
    const src = (file) => `${docsBase}${AGENT_IMG_BASE}/${encodeURIComponent(file)}`;
    const lightFile = image.light ?? image.dark;
    const darkFile = image.dark ?? image.light;
    if (lightFile === darkFile) {
      return <img src={src(lightFile)} alt="" className="ifx-avqs__img" />;
    }
    return (
      <>
        <img src={src(lightFile)} alt="" className="ifx-avqs__img ifx-avqs__img--light-only" />
        <img src={src(darkFile)} alt="" className="ifx-avqs__img ifx-avqs__img--dark-only" />
      </>
    );
  };

  const renderOption = (dimension, option, children) => {
    const active = selection[dimension] === option.id;
    return (
      <button
        key={option.id}
        type="button"
        aria-pressed={active}
        className={active ? "ifx-avsp__card ifx-avsp__card--active" : "ifx-avsp__card"}
        onClick={() => choose(dimension, option.id)}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="ifx-avsp__questions not-prose">
      <section className="ifx-avsp__step" data-avsp-focus="building">
        <h2 className="ifx-avsp__step-title">1. What are you building?</h2>
        <p className="ifx-avsp__step-desc">
          Your answer decides who creates each session and how long each session lasts.
        </p>
        <div className="ifx-avsp__cards">
          {BUILDS.map((option) =>
            renderOption("building", option, (
              <>
                <span className="ifx-avsp__card-label">{option.label}</span>
                <span className="ifx-avsp__card-desc">{option.example}</span>
              </>
            )),
          )}
        </div>
      </section>

      <section className="ifx-avsp__step" data-avsp-focus="runs">
        <h2 className="ifx-avsp__step-title">
          {activeBuild.id === "platform"
            ? "2. Where do the agents run?"
            : "2. Where does the agent run?"}
        </h2>
        <p className="ifx-avsp__step-desc">
          Your answer decides where to run the proxy and how the agent starts.
        </p>
        <div className="ifx-avsp__cards">
          {visibleRuns.map((option) =>
            renderOption("runs", option, (
              <>
                <span className="ifx-avsp__card-label">{option.label}</span>
                <span className="ifx-avsp__card-desc">{option.example}</span>
              </>
            )),
          )}
        </div>
      </section>

      <section className="ifx-avsp__step" data-avsp-focus="agent">
        <h2 className="ifx-avsp__step-title">3. Which agent?</h2>
        <p className="ifx-avsp__step-desc">
          Your answer decides which guide to follow and which command starts the agent.
        </p>
        <div className="ifx-avsp__cards">
          {AGENTS.map((option) =>
            renderOption("agent", option, (
              <span className="ifx-avsp__card-agent">
                <span className="ifx-avsp__card-icon">{renderAgentIcon(option.id)}</span>
                <span className="ifx-avsp__card-label">{option.label}</span>
              </span>
            )),
          )}
        </div>
      </section>
    </div>
  );
};

export const AgentVaultSetupDiagram = ({ inline, reveal }) => {
  const RULES = {
    personal: { model: "user", runs: ["computer", "server", "container"] },
    assistant: { model: "user", runs: ["computer", "server", "container"] },
    scheduled: { model: "job", runs: ["computer", "server", "container", "ci"] },
    platform: { model: "orchestrator", runs: ["server", "container", "ci"] },
  };
  const HOSTS = {
    computer: "Your computer",
    server: "Server or VM",
    container: "Container",
    ci: "CI runner",
  };

  // Each question and each walkthrough step explains part of the diagram. While one is in view, the
  // diagram highlights those lanes and messages and dims the rest. A step-<message id> focus
  // highlights that one message and the two lanes it connects.
  const FOCUS = {
    building: { lanes: ["infisical", "creator"], messages: ["create", "token", "start", "revoke"] },
    runs: { lanes: ["agent", "proxy"], messages: ["start", "request"] },
    agent: { lanes: ["agent"], messages: ["start", "request"] },
    "step-before": { lanes: ["infisical", "proxy"], messages: [] },
  };

  const SELECTION_EVENT = "av-setup-selection-change";

  const AGENT_IDS = ["claude-code", "codex", "opencode", "hermes", "openclaw", "custom"];

  const readSelection = () => {
    const params = new URLSearchParams(window.location.search);
    const building = RULES[params.get("building")] ? params.get("building") : "personal";
    const runs = params.get("runs");
    const agent = params.get("agent");
    return {
      building,
      model: RULES[building].model,
      runs: RULES[building].runs.includes(runs) ? runs : null,
      agent: AGENT_IDS.includes(agent) ? agent : null,
    };
  };

  const [selection, setSelection] = useState({
    building: "personal",
    model: "user",
    runs: null,
    agent: null,
  });
  const [focus, setFocus] = useState(null);
  const buildRef = useRef(null);

  // A setup that one guide covers links straight to that guide. The others take several pages,
  // so the button jumps to the list of them in "Build your setup".
  const GUIDES = "/documentation/platform/agent-vault";
  let buildHref = "#build-your-setup";
  if (selection.model === "user") {
    const guide = {
      "claude-code": "guides/claude-code",
      codex: "guides/codex",
      opencode: "guides/opencode",
      hermes: selection.building === "assistant" ? "guides/hermes-gateway" : "guides/hermes",
      openclaw: selection.building === "assistant" ? "guides/openclaw-gateway" : "guides/openclaw",
      custom: "guides/custom-agent",
    }[selection.agent];
    buildHref = `${GUIDES}/${guide ?? "quickstart"}`;
  }

  // Mintlify doesn't reliably add the /docs base path to links in snippets, so add it here only
  // when the page is under /docs and the rendered link doesn't already have it.
  useEffect(() => {
    const link = buildRef.current;
    if (!link) return;
    const href = link.getAttribute("href") || "";
    const underDocs =
      window.location.pathname === "/docs" || window.location.pathname.startsWith("/docs/");
    if (underDocs && href.startsWith("/") && !href.startsWith("/docs/")) {
      link.setAttribute("href", `/docs${href}`);
    }
  }, [buildHref]);

  useEffect(() => {
    const sync = () => setSelection(readSelection());
    sync();
    window.addEventListener(SELECTION_EVENT, sync);
    window.addEventListener("popstate", sync);

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // The last question whose top has passed the line stays highlighted through the gap before
        // the next one, so the highlight doesn't flicker off between questions.
        const line = window.innerHeight * 0.4;
        const sections = Array.from(document.querySelectorAll("[data-avsp-focus]"));
        let current = null;
        sections.forEach((el) => {
          if (el.getBoundingClientRect().top <= line) current = el;
        });
        const last = sections[sections.length - 1];
        if (current === last && last.getBoundingClientRect().bottom <= line) current = null;
        // Marking the current part on the page lets CSS dim the other walkthrough steps.
        sections.forEach((el) => el.toggleAttribute("data-avsp-active", el === current));
        setFocus(current ? current.getAttribute("data-avsp-focus") : null);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener(SELECTION_EVENT, sync);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const sharesHost = selection.model === "job";

  const creator = {
    user: { label: "You", sub: "Infisical dashboard" },
    job: { label: "Infisical CLI", sub: "Machine identity" },
    orchestrator: { label: "Orchestrator", sub: "Machine identity" },
  }[selection.model];

  const lanes = [
    { id: "infisical", label: "Infisical", sub: "Cloud or self-hosted" },
    { id: "creator", label: creator.label, sub: creator.sub },
    { id: "agent", label: "Agent", sub: selection.runs ? HOSTS[selection.runs] : "Agent's host" },
    { id: "proxy", label: "Proxy", sub: "Its own host" },
    { id: "api", label: "API", sub: "Such as GitHub" },
  ];
  const laneIndex = (id) => lanes.findIndex((lane) => lane.id === id);

  const messages = [
    {
      id: "create",
      from: "creator",
      to: "infisical",
      label: {
        user: "Create a session",
        job: "Log in and create a session",
        orchestrator: "Create a session for the task",
      }[selection.model],
    },
    { id: "token", from: "infisical", to: "creator", label: "Session token", reply: true },
    {
      id: "start",
      from: "creator",
      to: "agent",
      label: selection.model === "orchestrator" ? "Start an agent with the token" : "Start the agent with the token",
    },
    { id: "request", from: "agent", to: "proxy", label: "API request" },
    { id: "fetch", from: "proxy", to: "infisical", label: "Get the session's credentials" },
    { id: "forward", from: "proxy", to: "api", label: "Request with the real credential" },
  ];
  if (selection.model === "job") {
    messages.push({
      id: "revoke",
      from: "creator",
      to: "infisical",
      label: "Revoke the session when the agent exits",
    });
  }
  if (selection.model === "orchestrator") {
    messages.push({
      id: "revoke",
      from: "creator",
      to: "infisical",
      label: "Revoke the session when the task ends",
    });
  }

  const scrollToStep = (id) => {
    const block = document.querySelector(`[data-avsp-focus="step-${id}"]`);
    if (block) block.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  let highlight = null;
  if (focus) {
    const stepMessage = messages.find((message) => `step-${message.id}` === focus);
    highlight = stepMessage
      ? { lanes: [stepMessage.from, stepMessage.to], messages: [stepMessage.id] }
      : FOCUS[focus] ?? null;
  }
  const stateClass = (base, active) => {
    if (!highlight) return base;
    return active ? `${base} ${base}--focus` : `${base} ${base}--dim`;
  };

  // In the walkthrough, the diagram builds up as the reader scrolls: "before step 1" shows only
  // Infisical and the proxy, and each step adds its arrow and any part it reaches for the first
  // time. Earlier arrows stay, faded, so the reader sees what's been built so far. Before the
  // walkthrough starts it shows the "before step 1" stage, and after it ends it shows everything.
  let revealed = null;
  if (reveal) {
    let stage = 0;
    if (focus === null) {
      stage = messages.length;
    } else if (focus.startsWith("step-") && focus !== "step-before") {
      stage = messages.findIndex((message) => `step-${message.id}` === focus) + 1;
    }
    const shown = messages.slice(0, stage);
    const current = focus && focus.startsWith("step-") && stage > 0 ? shown[stage - 1] : null;
    const shownLanes = new Set(["infisical", "proxy"]);
    shown.forEach((message) => {
      shownLanes.add(message.from);
      shownLanes.add(message.to);
    });
    revealed = { shown: new Set(shown.map((message) => message.id)), shownLanes, current };
  }

  const laneClass = (id) => {
    if (!revealed) return stateClass("ifx-avsp__lane", highlight && highlight.lanes.includes(id));
    if (!revealed.shownLanes.has(id)) return "ifx-avsp__lane ifx-avsp__lane--hidden";
    const focused = revealed.current
      ? [revealed.current.from, revealed.current.to].includes(id)
      : focus === "step-before";
    return focused ? "ifx-avsp__lane ifx-avsp__lane--focus" : "ifx-avsp__lane";
  };

  const messageClass = (id) => {
    if (!revealed) {
      return stateClass("ifx-avsp__message", highlight && highlight.messages.includes(id));
    }
    if (!revealed.shown.has(id)) return "ifx-avsp__message ifx-avsp__message--hidden";
    if (!revealed.current) return "ifx-avsp__message";
    return revealed.current.id === id
      ? "ifx-avsp__message ifx-avsp__message--focus"
      : "ifx-avsp__message ifx-avsp__message--past";
  };

  const lifelineClass = (id) =>
    revealed && !revealed.shownLanes.has(id)
      ? "ifx-avsp__lifeline ifx-avsp__lifeline--hidden"
      : "ifx-avsp__lifeline";

  const laneCount = lanes.length;
  const center = (index) => `${((index + 0.5) / laneCount) * 100}%`;

  return (
    <div className={inline ? "ifx-avsp__diagram-inline not-prose" : "not-prose"}>
      <div className="ifx-avsp__panel-head">
        <a ref={buildRef} href={buildHref} className="ifx-btn ifx-btn--primary ifx-avsp__build-button">
          Build
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </div>
      <div className="ifx-avsp__diagram-scroll">
        <div
          className="ifx-avsp__diagram"
          role="img"
          aria-label={`Sequence diagram: ${messages
            .map((message, index) => `${index + 1}. ${message.label}`)
            .join(", ")}`}
        >
          <div className="ifx-avsp__lanes" aria-hidden="true">
            {sharesHost && (!revealed || revealed.shownLanes.has("creator")) && (
              <div className="ifx-avsp__boundary">
                <span className="ifx-avsp__boundary-label">Same host</span>
              </div>
            )}
            {lanes.map((lane) => (
              <div key={lane.id} className={laneClass(lane.id)}>
                <span className="ifx-avsp__lane-label">{lane.label}</span>
                <span className="ifx-avsp__lane-sub">{lane.sub}</span>
              </div>
            ))}
          </div>
          <div className="ifx-avsp__messages" aria-hidden="true">
            {lanes.map((lane, index) => (
              <span
                key={lane.id}
                className={lifelineClass(lane.id)}
                style={{ left: center(index) }}
              />
            ))}
            {messages.map((message, index) => {
              const from = laneIndex(message.from);
              const to = laneIndex(message.to);
              const start = Math.min(from, to);
              const span = Math.abs(to - from);
              const classes = ["ifx-avsp__arrow"];
              classes.push(to > from ? "ifx-avsp__arrow--right" : "ifx-avsp__arrow--left");
              if (message.reply) classes.push("ifx-avsp__arrow--reply");
              if (start === 0) classes.push("ifx-avsp__arrow--first-lane");
              else if (start + span === laneCount - 1) classes.push("ifx-avsp__arrow--last-lane");
              return (
                <div key={message.id} className={messageClass(message.id)}>
                  <div
                    className={classes.join(" ")}
                    style={{ left: center(start), width: `${(span / laneCount) * 100}%` }}
                  >
                    <span className="ifx-avsp__arrow-label">
                      {/* The number jumps to the step's block in the walkthrough. The block repeats
                          what the arrow shows, so screen readers lose nothing by skipping the diagram. */}
                      <span
                        className="ifx-avsp__arrow-num ifx-avsp__arrow-num--link"
                        onClick={() => scrollToStep(message.id)}
                      >
                        {index + 1}
                      </span>
                      {message.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export const AgentVaultSetupStep = ({ step, children }) => {
  const MODELS = {
    personal: "user",
    assistant: "user",
    scheduled: "job",
    platform: "orchestrator",
  };
  const CREATORS = { user: "You", job: "Infisical CLI", orchestrator: "Orchestrator" };

  const SELECTION_EVENT = "av-setup-selection-change";

  const readModel = () => {
    const params = new URLSearchParams(window.location.search);
    return MODELS[params.get("building")] ?? "user";
  };

  const [model, setModel] = useState("user");

  useEffect(() => {
    const sync = () => setModel(readModel());
    sync();
    window.addEventListener(SELECTION_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(SELECTION_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  // These numbers match the arrows in AgentVaultSetupDiagram, so the reader can find each step in
  // the diagram. The titles describe the same arrows in full sentences, while the diagram keeps its
  // short labels. Keep the numbering and order in sync with the diagram.
  const creator = CREATORS[model];
  const STEPS = {
    before: {  },
    create: {
      number: 1,
      title: {
        user: "You create a session",
        job: "The CLI logs in and creates a session",
        orchestrator: "The orchestrator creates a session for the task",
      }[model],
      route: `${creator} → Infisical`,
    },
    token: { number: 2, title: "Infisical returns a session token", route: `Infisical → ${creator}` },
    start: {
      number: 3,
      title: {
        user: "You start the agent with the token",
        job: "The CLI starts the agent with the token",
        orchestrator: "The orchestrator starts an agent with the token",
      }[model],
      route: `${creator} → Agent`,
    },
    request: { number: 4, title: "The agent sends an API request", route: "Agent → Proxy" },
    fetch: { number: 5, title: "The proxy gets the session's credentials", route: "Proxy → Infisical" },
    forward: { number: 6, title: "The proxy sends the request with the real credential", route: "Proxy → API" },
    revoke: {
      number: 7,
      title:
        model === "orchestrator"
          ? "The orchestrator revokes the session when the task ends"
          : "The CLI revokes the session when the agent exits",
      route: `${creator} → Infisical`,
    },
  };

  const current = STEPS[step];
  if (!current || (step === "revoke" && model === "user")) return null;

  return (
    <section className="ifx-avsp__walk-step" data-avsp-focus={`step-${step}`}>
      <div className="ifx-avsp__walk-head not-prose">
        {current.number ? (
          <span className="ifx-avsp__walk-num">{current.number}</span>
        ) : null}
        <div>
          <h3 className="ifx-avsp__walk-title">{current.title}</h3>
          {current.route ? <p className="ifx-avsp__walk-route">{current.route}</p> : null}
        </div>
      </div>
      <div className="ifx-avsp__walk-body">{children}</div>
    </section>
  );
};

export const AgentVaultSetupSummary = () => {
  const BUILDS = {
    personal: "coding agent for yourself",
    assistant: "an always-on assistant",
    scheduled: "a scheduled or unattended job",
    platform: "a service that starts agents for tasks",
  };
  const RUNS = {
    personal: ["computer", "server", "container"],
    assistant: ["computer", "server", "container"],
    scheduled: ["computer", "server", "container", "ci"],
    platform: ["server", "container", "ci"],
  };
  const PLACES = {
    computer: "on your computer",
    server: "on a server or VM",
    container: "in a container",
    ci: "in a CI runner",
  };
  const AGENTS = {
    "claude-code": "Claude Code",
    codex: "Codex",
    opencode: "OpenCode",
    hermes: "Hermes Agent",
    openclaw: "OpenClaw",
    custom: "your own agent",
  };

  const SELECTION_EVENT = "av-setup-selection-change";

  const readSelection = () => {
    const params = new URLSearchParams(window.location.search);
    const building = BUILDS[params.get("building")] ? params.get("building") : "personal";
    const runs = params.get("runs");
    const agent = params.get("agent");
    return {
      building,
      runs: RUNS[building].includes(runs) ? runs : null,
      agent: AGENTS[agent] ? agent : null,
    };
  };

  const [selection, setSelection] = useState({ building: "personal", runs: null, agent: null });

  useEffect(() => {
    const sync = () => setSelection(readSelection());
    sync();
    window.addEventListener(SELECTION_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(SELECTION_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  let buildText = BUILDS[selection.building];
  if (selection.runs) {
    buildText =
      selection.building === "platform"
        ? `a service that starts agents ${PLACES[selection.runs]} for each task`
        : `${buildText} that runs ${PLACES[selection.runs]}`;
  }
  const agentText = selection.agent ? `, using ${AGENTS[selection.agent]}` : "";
  const missing = [];
  if (!selection.runs) missing.push("where the agent runs");
  if (!selection.agent) missing.push("which agent you use");

  return (
    <p>
      You're building {buildText}
      {agentText}.
      
      Here's how the setup works:
      {missing.length > 0 && ` Choose ${missing.join(" and ")} to fill in the rest of the setup.`}
    </p>
  );
};

export const AgentVaultSetupBranch = ({ building, runs, agent, model, children }) => {
  const SELECTION_EVENT = "av-setup-selection-change";

  const RULES = {
    personal: { model: "user", runs: ["computer", "server", "container"] },
    assistant: { model: "user", runs: ["computer", "server", "container"] },
    scheduled: { model: "job", runs: ["computer", "server", "container", "ci"] },
    platform: { model: "orchestrator", runs: ["server", "container", "ci"] },
  };
  const ALL_AGENTS = ["claude-code", "codex", "opencode", "hermes", "openclaw", "custom"];

  const readSelection = () => {
    const params = new URLSearchParams(window.location.search);
    const buildingId = RULES[params.get("building")] ? params.get("building") : "personal";
    const rule = RULES[buildingId];
    const runsId = params.get("runs");
    const agentId = params.get("agent");
    return {
      building: buildingId,
      model: rule.model,
      runs: rule.runs.includes(runsId) ? runsId : null,
      agent: ALL_AGENTS.includes(agentId) ? agentId : null,
    };
  };

  const [selection, setSelection] = useState({
    building: "personal",
    model: "user",
    runs: null,
    agent: null,
  });

  useEffect(() => {
    const sync = () => setSelection(readSelection());
    sync();
    window.addEventListener(SELECTION_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(SELECTION_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const matches = (wanted, current) => {
    if (wanted === undefined || wanted === null) return true;
    const list = String(wanted)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return list.length === 0 || list.includes(current ?? "none");
  };

  if (
    !matches(building, selection.building) ||
    !matches(model, selection.model) ||
    !matches(runs, selection.runs) ||
    !matches(agent, selection.agent)
  ) {
    return null;
  }
  return <>{children}</>;
};
