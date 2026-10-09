import React, { useEffect, useRef, useState } from "react";

// Mintlify evaluates each export on its own, so the components can't share module-level constants.
// The rules for which answers fit together live in AgentVaultSetupQuestions (BUILDS), and are
// repeated in AgentVaultSetupDiagram, AgentVaultSetupSummary, and AgentVaultSetupBranch. Keep the
// four in sync.

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

export const AgentVaultSetupDiagram = ({ inline }) => {
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

  // Each question decides part of the diagram. While a question is in view, the diagram highlights
  // those lanes and messages and dims the rest.
  const FOCUS = {
    building: { lanes: ["infisical", "creator"], messages: ["create", "token", "start", "revoke"] },
    runs: { lanes: ["agent", "proxy"], messages: ["start", "request"] },
    agent: { lanes: ["agent"], messages: ["start", "request"] },
  };

  const SELECTION_EVENT = "av-setup-selection-change";

  const readSelection = () => {
    const params = new URLSearchParams(window.location.search);
    const building = RULES[params.get("building")] ? params.get("building") : "personal";
    const runs = params.get("runs");
    return {
      model: RULES[building].model,
      runs: RULES[building].runs.includes(runs) ? runs : null,
    };
  };

  const [selection, setSelection] = useState({ model: "user", runs: null });
  const [focus, setFocus] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const expandRef = useRef(null);
  const closeRef = useRef(null);

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

  useEffect(() => {
    if (!expanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (closeRef.current) closeRef.current.focus();
    const onKey = (event) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      if (expandRef.current) expandRef.current.focus();
    };
  }, [expanded]);

  const sharesHost = selection.model === "job";

  const creator = {
    user: {
      label: "You",
      sub: "Infisical dashboard",
      detail: "Signs in to Infisical with your own account",
    },
    job: {
      label: "Infisical CLI",
      sub: "Machine identity",
      detail: "Holds the credentials of a machine identity granted one access bundle",
    },
    orchestrator: {
      label: "Orchestrator",
      sub: "Machine identity",
      detail: "Holds the credentials of a machine identity granted an access bundle for each kind of task",
    },
  }[selection.model];

  const lanes = [
    {
      id: "infisical",
      label: "Infisical",
      sub: "Cloud or self-hosted",
      detail: "Stores the access bundles and the real credentials for each service",
    },
    { id: "creator", label: creator.label, sub: creator.sub, detail: creator.detail },
    {
      id: "agent",
      label: "Agent",
      sub: selection.runs ? HOSTS[selection.runs] : "Agent's host",
      detail:
        selection.model === "job"
          ? "Holds the session token, and can read the machine identity's credentials from its environment"
          : "Holds only the session token",
    },
    {
      id: "proxy",
      label: "Proxy",
      sub: "Its own host",
      detail: "Holds its own access token and the private key of its certificate authority",
    },
    {
      id: "api",
      label: "API",
      sub: "Such as GitHub",
      detail: "Receives each request with the real credential attached",
    },
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
      detail: {
        user: "In the dashboard, choose the access bundle and when the session expires",
        job: "The infisical agent-vault run command logs in as the machine identity",
        orchestrator: "Through the Infisical API, with the access bundle for the task",
      }[selection.model],
    },
    {
      id: "token",
      from: "infisical",
      to: "creator",
      label: "Session token",
      detail: "Works for one access bundle until the session expires or is revoked",
      reply: true,
    },
    {
      id: "start",
      from: "creator",
      to: "agent",
      label: selection.model === "orchestrator" ? "Start an agent with the token" : "Start the agent with the token",
      detail: {
        user: "infisical agent-vault run sends the agent's requests through the proxy",
        job: "The CLI sends the agent's requests through the proxy",
        orchestrator: "Only the session token goes to the agent's host",
      }[selection.model],
    },
    {
      id: "request",
      from: "agent",
      to: "proxy",
      label: "API request",
      detail: "Sent with the session token instead of a real API key",
    },
    {
      id: "fetch",
      from: "proxy",
      to: "infisical",
      label: "Get the session's credentials",
      detail: "The proxy checks each session again every poll interval, 60 seconds by default",
    },
    {
      id: "forward",
      from: "proxy",
      to: "api",
      label: "Request with the real credential",
      detail: "The proxy attaches the service's credential and sends the request on",
    },
  ];
  if (selection.model === "job") {
    messages.push({
      id: "revoke",
      from: "creator",
      to: "infisical",
      label: "Revoke the session when the agent exits",
      detail: "The CLI revokes the session, so the token stops working",
    });
  }
  if (selection.model === "orchestrator") {
    messages.push({
      id: "revoke",
      from: "creator",
      to: "infisical",
      label: "Revoke the session when the task ends",
      detail: "Revoke it even if the agent fails, so the token stops working",
    });
  }

  const laneCount = lanes.length;
  const center = (index) => `${((index + 0.5) / laneCount) * 100}%`;

  const renderDiagram = (detailed) => {
    const highlight = !detailed && focus ? FOCUS[focus] : null;
    const stateClass = (base, active) => {
      if (!highlight) return base;
      return active ? `${base} ${base}--focus` : `${base} ${base}--dim`;
    };

    return (
      <div className="ifx-avsp__diagram-scroll">
        <div
          className={detailed ? "ifx-avsp__diagram ifx-avsp__diagram--detailed" : "ifx-avsp__diagram"}
          role="img"
          aria-label={`Sequence diagram: ${messages
            .map((message, index) => `${index + 1}. ${message.label}`)
            .join(", ")}`}
        >
          <div className="ifx-avsp__lanes" aria-hidden="true">
            {sharesHost && (
              <div className="ifx-avsp__boundary">
                <span className="ifx-avsp__boundary-label">Same host</span>
              </div>
            )}
            {lanes.map((lane) => (
              <div
                key={lane.id}
                className={stateClass("ifx-avsp__lane", highlight && highlight.lanes.includes(lane.id))}
              >
                <span className="ifx-avsp__lane-label">{lane.label}</span>
                <span className="ifx-avsp__lane-sub">{lane.sub}</span>
                {detailed && <span className="ifx-avsp__lane-detail">{lane.detail}</span>}
              </div>
            ))}
          </div>
          <div className="ifx-avsp__messages" aria-hidden="true">
            {lanes.map((lane, index) => (
              <span
                key={lane.id}
                className="ifx-avsp__lifeline"
                style={{ left: center(index) }}
              />
            ))}
            {messages.map((message, index) => {
              const from = laneIndex(message.from);
              const to = laneIndex(message.to);
              const start = Math.min(from, to);
              const span = Math.abs(to - from);
              const lineClasses = ["ifx-avsp__arrow"];
              lineClasses.push(to > from ? "ifx-avsp__arrow--right" : "ifx-avsp__arrow--left");
              if (message.reply) lineClasses.push("ifx-avsp__arrow--reply");
              let edgeClass = "";
              if (start === 0) edgeClass = "ifx-avsp__arrow--first-lane";
              else if (start + span === laneCount - 1) edgeClass = "ifx-avsp__arrow--last-lane";
              const rowClass = stateClass(
                "ifx-avsp__message",
                highlight && highlight.messages.includes(message.id),
              );
              const position = { left: center(start), width: `${(span / laneCount) * 100}%` };
              const label = (
                <>
                  <span className="ifx-avsp__arrow-num">{index + 1}</span>
                  {message.label}
                </>
              );

              if (!detailed) {
                return (
                  <div key={message.id} className={rowClass}>
                    <div className={[...lineClasses, edgeClass].join(" ")} style={position}>
                      <span className="ifx-avsp__arrow-label">{label}</span>
                    </div>
                  </div>
                );
              }

              // With room for detail, the text sits in the flow above its arrow, so each row
              // grows to fit its text instead of having a fixed height.
              return (
                <div key={message.id} className={rowClass}>
                  <div className={`ifx-avsp__step-span ${edgeClass}`} style={position}>
                    <span className="ifx-avsp__step-label">{label}</span>
                    <span className="ifx-avsp__step-detail">{message.detail}</span>
                    <div className={lineClasses.join(" ")} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const expandIcon = (
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
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  );

  const closeIcon = (
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );

  return (
    <div className={inline ? "ifx-avsp__diagram-inline not-prose" : "not-prose"}>
      <div className="ifx-avsp__panel-head">
        <p className="ifx-avsp__panel-title">How your setup connects</p>
        <button
          ref={expandRef}
          type="button"
          className="ifx-avsp__panel-button"
          onClick={() => setExpanded(true)}
        >
          {expandIcon}
          Expand
        </button>
      </div>
      {renderDiagram(false)}

      {expanded && (
        <div className="ifx-avsp__overlay" onClick={() => setExpanded(false)}>
          <div
            className="ifx-avsp__overlay-panel"
            role="dialog"
            aria-modal="true"
            aria-label="How your setup connects"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ifx-avsp__panel-head">
              <p className="ifx-avsp__panel-title">How your setup connects</p>
              <button
                ref={closeRef}
                type="button"
                className="ifx-avsp__panel-button"
                onClick={() => setExpanded(false)}
              >
                {closeIcon}
                Close
              </button>
            </div>
            {renderDiagram(true)}
          </div>
        </div>
      )}
    </div>
  );
};

export const AgentVaultSetupSummary = () => {
  const BUILDS = {
    personal: "a coding agent for yourself",
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
      {agentText}. Each section that follows covers one part of this setup and names the steps in
      the diagram that it explains.
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
