import React, { useEffect, useMemo, useRef, useState } from "react";

export const AgentVaultQuickstartPicker = () => {
  const docsPath =
    typeof window === "undefined" ? "" : window.location.pathname;
  const docsBase =
    docsPath === "/docs" || docsPath.startsWith("/docs/") ? "/docs" : "";

  const SERVICE_IMG_BASE = "/images/agent-vault-templates";
  const AGENT_IMG_BASE = "/images/agent-vault-agents";

  const AGENT_IMAGES = {
    "claude-code": { dark: "claude-code.svg" },
    codex: { light: "OpenAI.png", dark: "OpenAIWhite.png" },
    opencode: { light: "opencode.svg", dark: "opencode.on-dark.svg" }
  };

  const SERVICE_IMAGES = {
    anthropic: { dark: "Anthropic.png" },
    cloudflare: { dark: "Cloudflare.png" },
    cohere: { dark: "Cohere.svg" },
    datadog: { light: "Datadog.png", dark: "DatadogWhite.png" },
    deepseek: { dark: "DeepSeek.svg" },
    discord: { dark: "Discord.svg" },
    fireworks: { dark: "Fireworks.png" },
    gemini: { dark: "Gemini.svg" },
    github: { light: "GitHub.on-light.png", dark: "GitHub.png" },
    "github-npm": { light: "GitHub.on-light.png", dark: "GitHub.png" },
    gitlab: { dark: "GitLab.png" },
    "google-workspace": { dark: "Google Workspace.svg" },
    groq: { dark: "Groq.svg" },
    jira: { dark: "Jira.svg" },
    linear: { dark: "Linear.svg" },
    mistral: { dark: "Mistral.svg" },
    notion: { dark: "Notion.svg" },
    npm: { dark: "NPM.svg" },
    openai: { light: "OpenAI.png", dark: "OpenAIWhite.png" },
    openrouter: { dark: "OpenRouter.png" },
    pagerduty: { dark: "PagerDuty.svg" },
    perplexity: { dark: "Perplexity.svg" },
    postmark: { dark: "Postmark.png" },
    resend: { light: "Resend.on-light.svg", dark: "Resend.svg" },
    sendgrid: { dark: "SendGrid.png" },
    sentry: { light: "Sentry.on-light.svg", dark: "Sentry.svg" },
    shopify: { dark: "Shopify.svg" },
    slack: { dark: "Slack.svg" },
    stripe: { dark: "Stripe.svg" },
    supabase: { dark: "Supabase.png" },
    together: { light: "Together.on-light.svg", dark: "Together.svg" },
    twilio: { dark: "Twilio.svg" },
    vercel: { dark: "Vercel.png" },
    xai: { light: "xAI.on-light.svg", dark: "xAI.svg" }
  };

  const buildSrc = (base, fileName) =>
    `${docsBase}${base}/${fileName.split("/").map(encodeURIComponent).join("/")}`;

  const renderImageIcon = (image, base) => {
    if (!image) return null;
    const lightFile = image.light ?? image.dark;
    const darkFile = image.dark ?? image.light;
    if (lightFile === darkFile) {
      return (
        <img src={buildSrc(base, lightFile)} alt="" className="ifx-avqs__img" />
      );
    }
    return (
      <>
        <img
          src={buildSrc(base, lightFile)}
          alt=""
          className="ifx-avqs__img ifx-avqs__img--light-only"
        />
        <img
          src={buildSrc(base, darkFile)}
          alt=""
          className="ifx-avqs__img ifx-avqs__img--dark-only"
        />
      </>
    );
  };

  const renderAgentIcon = (id) => renderImageIcon(AGENT_IMAGES[id], AGENT_IMG_BASE);

  const renderServiceIcon = (id) => {
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
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      );
    }
    return renderImageIcon(SERVICE_IMAGES[id], SERVICE_IMG_BASE);
  };


  const KNOWN_SERVICE_IDS = new Set([
    "anthropic",
    "cloudflare",
    "cohere",
    "custom",
    "datadog",
    "deepseek",
    "discord",
    "fireworks",
    "gemini",
    "github",
    "github-npm",
    "gitlab",
    "google-workspace",
    "groq",
    "jira",
    "linear",
    "mistral",
    "notion",
    "npm",
    "openai",
    "openrouter",
    "pagerduty",
    "perplexity",
    "postmark",
    "resend",
    "sendgrid",
    "sentry",
    "shopify",
    "slack",
    "stripe",
    "supabase",
    "together",
    "twilio",
    "vercel",
    "xai",
  ]);
  const KNOWN_AGENT_IDS = new Set(["claude-code", "codex", "opencode"]);

  const SERVICES = [
    { id: "custom", label: "Custom API", chip: "a custom API" },
    { id: "anthropic", label: "Anthropic", chip: "Anthropic" },
    { id: "cloudflare", label: "Cloudflare", chip: "Cloudflare" },
    { id: "cohere", label: "Cohere", chip: "Cohere" },
    { id: "datadog", label: "Datadog", chip: "Datadog" },
    { id: "deepseek", label: "DeepSeek", chip: "DeepSeek" },
    { id: "discord", label: "Discord", chip: "Discord" },
    { id: "fireworks", label: "Fireworks AI", chip: "Fireworks AI" },
    { id: "github", label: "GitHub", chip: "GitHub" },
    { id: "github-npm", label: "GitHub Packages", chip: "GitHub Packages" },
    { id: "gitlab", label: "GitLab", chip: "GitLab" },
    { id: "gemini", label: "Google Gemini", chip: "Google Gemini" },
    {
      id: "google-workspace",
      label: "Google Workspace",
      chip: "Google Workspace",
    },
    { id: "groq", label: "Groq", chip: "Groq" },
    { id: "jira", label: "Jira", chip: "Jira" },
    { id: "linear", label: "Linear", chip: "Linear" },
    { id: "mistral", label: "Mistral AI", chip: "Mistral AI" },
    { id: "notion", label: "Notion", chip: "Notion" },
    { id: "npm", label: "npm", chip: "npm" },
    { id: "openai", label: "OpenAI", chip: "OpenAI" },
    { id: "openrouter", label: "OpenRouter", chip: "OpenRouter" },
    { id: "pagerduty", label: "PagerDuty", chip: "PagerDuty" },
    { id: "perplexity", label: "Perplexity", chip: "Perplexity" },
    { id: "postmark", label: "Postmark", chip: "Postmark" },
    { id: "resend", label: "Resend", chip: "Resend" },
    { id: "sendgrid", label: "SendGrid", chip: "SendGrid" },
    { id: "sentry", label: "Sentry", chip: "Sentry" },
    { id: "shopify", label: "Shopify", chip: "Shopify" },
    { id: "slack", label: "Slack", chip: "Slack" },
    { id: "stripe", label: "Stripe", chip: "Stripe" },
    { id: "supabase", label: "Supabase", chip: "Supabase" },
    { id: "together", label: "Together AI", chip: "Together AI" },
    { id: "twilio", label: "Twilio", chip: "Twilio" },
    { id: "vercel", label: "Vercel", chip: "Vercel" },
    { id: "xai", label: "xAI", chip: "xAI" },
  ];

  const AGENTS = [
    { id: "claude-code", label: "Claude Code", chip: "Claude Code" },
    { id: "codex", label: "Codex", chip: "Codex" },
    { id: "opencode", label: "OpenCode", chip: "OpenCode" },
  ];

  const SELECTION_EVENT = "av-quickstart-selection-change";

  const [selection, setSelection] = useState({ service: null, agent: null });
  const [openMenu, setOpenMenu] = useState(null);
  const [searchService, setSearchService] = useState("");
  const [searchAgent, setSearchAgent] = useState("");
  const rootRef = useRef(null);
  const serviceButtonRef = useRef(null);
  const agentButtonRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setSelection({
        service: (() => {
          const v = params.get("service");
          return v && KNOWN_SERVICE_IDS.has(v) ? v : null;
        })(),
        agent: (() => {
          const v = params.get("agent");
          return v && KNOWN_AGENT_IDS.has(v) ? v : null;
        })(),
      });
    };
    sync();
    window.addEventListener(SELECTION_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(SELECTION_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (!openMenu) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        const target =
          openMenu === "service"
            ? serviceButtonRef.current
            : agentButtonRef.current;
        if (target) target.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  useEffect(() => {
    if (openMenu && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [openMenu]);

  const update = (dimension, value) => {
    const params = new URLSearchParams(window.location.search);
    if (value === null) params.delete(dimension);
    else params.set(dimension, value);
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
    window.dispatchEvent(new Event(SELECTION_EVENT));
    setOpenMenu(null);
    setSearchService("");
    setSearchAgent("");
  };

  const reset = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("service");
    params.delete("agent");
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
    window.dispatchEvent(new Event(SELECTION_EVENT));
    setOpenMenu(null);
  };

  const activeService = SERVICES.find(
    (option) => option.id === selection.service,
  );
  const activeAgent = AGENTS.find((option) => option.id === selection.agent);
  const hasSelection = Boolean(selection.service || selection.agent);

  const chevron = (
    <svg
      className="ifx-avqs__chevron"
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const renderMenu = (
    dimension,
    options,
    getIcon,
    activeId,
    searchValue,
    setSearch,
  ) => {
    const query = searchValue.trim().toLowerCase();
    const filtered = query
      ? options.filter((option) => option.label.toLowerCase().includes(query))
      : options;
    return (
      <div
        className="ifx-avqs__menu"
        role="dialog"
        aria-label={`Choose ${dimension}`}
      >
        <div className="ifx-avqs__search">
          <svg
            className="ifx-avqs__search-icon"
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
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            placeholder={`Search ${dimension === "service" ? "services" : "agents"}`}
            className="ifx-avqs__search-input"
            value={searchValue}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {filtered.length > 0 ? (
          <div
            className="ifx-avqs__grid"
            role="listbox"
            aria-label={`${dimension} options`}
          >
            {filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={activeId === option.id}
                className={
                  activeId === option.id
                    ? "ifx-avqs__tile ifx-avqs__tile--active"
                    : "ifx-avqs__tile"
                }
                onClick={() => update(dimension, option.id)}
              >
                {getIcon(option.id) && (
                  <span className="ifx-avqs__tile-icon">
                    {getIcon(option.id)}
                  </span>
                )}
                <span className="ifx-avqs__tile-label">{option.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="ifx-avqs__empty">
            No matches for &ldquo;{searchValue}&rdquo;.
          </div>
        )}
        {activeId && (
          <button
            type="button"
            className="ifx-avqs__clear"
            onClick={() => update(dimension, null)}
          >
            Clear selection
          </button>
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="ifx-avqs">
      <p className="ifx-avqs__sentence">
        I want{" "}
        <span className="ifx-avqs__slot ifx-avqs__slot--agent">
          <button
            ref={agentButtonRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openMenu === "agent"}
            className={
              activeAgent
                ? "ifx-avqs__chip ifx-avqs__chip--filled"
                : "ifx-avqs__chip"
            }
            onClick={() => setOpenMenu(openMenu === "agent" ? null : "agent")}
          >
            {activeAgent && renderAgentIcon(activeAgent.id) && (
              <span className="ifx-avqs__chip-icon">
                {renderAgentIcon(activeAgent.id)}
              </span>
            )}
            <span>{activeAgent ? activeAgent.chip : "an agent"}</span>
            {chevron}
          </button>
          {openMenu === "agent" &&
            renderMenu(
              "agent",
              AGENTS,
              renderAgentIcon,
              selection.agent,
              searchAgent,
              setSearchAgent,
            )}
        </span>{" "}
        to access{" "}
        <span className="ifx-avqs__slot ifx-avqs__slot--service">
          <button
            ref={serviceButtonRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openMenu === "service"}
            className={
              activeService
                ? "ifx-avqs__chip ifx-avqs__chip--filled"
                : "ifx-avqs__chip"
            }
            onClick={() =>
              setOpenMenu(openMenu === "service" ? null : "service")
            }
          >
            {activeService &&
              activeService.id !== "custom" &&
              renderServiceIcon(activeService.id) && (
                <span className="ifx-avqs__chip-icon">
                  {renderServiceIcon(activeService.id)}
                </span>
              )}
            <span>{activeService ? activeService.chip : "a service"}</span>
            {chevron}
          </button>
          {openMenu === "service" &&
            renderMenu(
              "service",
              SERVICES,
              renderServiceIcon,
              selection.service,
              searchService,
              setSearchService,
            )}
        </span>
      </p>
      <p className="ifx-avqs__hint">
        {hasSelection ? (
          <>
            The steps below match your choice.{" "}
            <button type="button" className="ifx-avqs__reset" onClick={reset}>
              Reset
            </button>
          </>
        ) : (
          "Pick to view tailored steps, or leave both to read the generic version of the guide."
        )}
      </p>
    </div>
  );
};

export const AgentVaultBranch = ({
  service,
  agent,
  serviceNot,
  agentNot,
  children,
}) => {
  const SELECTION_EVENT = "av-quickstart-selection-change";

  const KNOWN_SERVICE_IDS = new Set([
    "anthropic",
    "cloudflare",
    "cohere",
    "custom",
    "datadog",
    "deepseek",
    "discord",
    "fireworks",
    "gemini",
    "github",
    "github-npm",
    "gitlab",
    "google-workspace",
    "groq",
    "jira",
    "linear",
    "mistral",
    "notion",
    "npm",
    "openai",
    "openrouter",
    "pagerduty",
    "perplexity",
    "postmark",
    "resend",
    "sendgrid",
    "sentry",
    "shopify",
    "slack",
    "stripe",
    "supabase",
    "together",
    "twilio",
    "vercel",
    "xai",
  ]);
  const KNOWN_AGENT_IDS = new Set(["claude-code", "codex", "opencode"]);
  const [selection, setSelection] = useState({ service: null, agent: null });

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setSelection({
        service: (() => {
          const v = params.get("service");
          return v && KNOWN_SERVICE_IDS.has(v) ? v : null;
        })(),
        agent: (() => {
          const v = params.get("agent");
          return v && KNOWN_AGENT_IDS.has(v) ? v : null;
        })(),
      });
    };
    sync();
    window.addEventListener(SELECTION_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(SELECTION_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const parseList = (raw) =>
    raw
      ? String(raw)
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];

  const matchesService = useMemo(() => {
    const current = selection.service ?? "none";
    if (service !== undefined && service !== null) {
      const wanted = parseList(service);
      if (wanted.length === 0) return true;
      if (!wanted.includes(current)) return false;
    }
    const excluded = parseList(serviceNot);
    if (excluded.includes(current)) return false;
    return true;
  }, [selection.service, service, serviceNot]);

  const matchesAgent = useMemo(() => {
    const current = selection.agent ?? "none";
    if (agent !== undefined && agent !== null) {
      const wanted = parseList(agent);
      if (wanted.length === 0) return true;
      if (!wanted.includes(current)) return false;
    }
    const excluded = parseList(agentNot);
    if (excluded.includes(current)) return false;
    return true;
  }, [selection.agent, agent, agentNot]);

  if (!matchesService || !matchesAgent) return null;
  return <>{children}</>;
};
