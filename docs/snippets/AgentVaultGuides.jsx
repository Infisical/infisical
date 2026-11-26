// The Agent Vault guide index. The catalog is the Markdown table in snippets/agent-vault-guides.mdx, passed as
// children. Search engines, agents, and readers without JavaScript get that table. In the browser, this component
// reads the table and replaces it with cards.
//
// It has two pages, each with a sidebar entry. guides/by-agent (view="agent") leads with the agent setup guides,
// then the examples, and filters them by compute. guides/by-compute (view="compute") leads with the compute setup
// guides, then the examples, and filters them by agent.
//
// It reuses existing styles rather than adding its own: the search, filters, and count from the catalog browser
// (.ifx-catalog, snippets/CatalogBrowser.jsx), the filter logos from the quickstart configurator (.ifx-avqs), and
// Mintlify's Card and Columns.

export const AgentVaultGuides = ({ view = "agent", children }) => {
  const AXES = {
    agent: {
      column: "agents",
      noun: "agent",
      order: ["Claude Code", "Codex", "Cursor", "OpenCode", "OpenClaw", "Hermes"]
    },
    compute: {
      column: "compute",
      noun: "platform",
      order: ["Kubernetes", "Docker", "Modal", "Daytona", "E2B", "VM"]
    }
  };

  const LOGOS = {
    "Claude Code": "/images/agent-vault-agents/claude-code.svg",
    Codex: "/images/agent-vault-agents/OpenAI.png",
    Cursor: "/images/agent-vault-agents/cursor.svg",
    OpenCode: "/images/agent-vault-agents/opencode.svg",
    OpenClaw: "/images/agent-vault-agents/openclaw.svg",
    Hermes: "/images/agent-vault-agents/hermes.png",
    Kubernetes: "/images/stack/kubernetes.png",
    Docker: "/images/agent-vault-agents/docker.svg",
    Modal: "/images/agent-vault-agents/modal.svg",
    Daytona: "/images/agent-vault-agents/daytona.svg",
    E2B: "/images/agent-vault-agents/e2b.svg"
  };

  // Logos with a separate version for dark mode, the same pairs the quickstart configurator uses.
  const DARK_LOGOS = {
    Codex: "/images/agent-vault-agents/OpenAIWhite.png",
    OpenCode: "/images/agent-vault-agents/opencode.on-dark.svg",
    Hermes: "/images/agent-vault-agents/hermes.on-dark.png"
  };

  // Service logos, from the service templates. A service without one shows its name only.
  const SERVICE_LOGOS = {
    Slack: { light: "/images/agent-vault-templates/Slack.svg" },
    Telegram: { light: "/images/agent-vault-templates/Telegram.svg" },
    Sentry: { light: "/images/agent-vault-templates/Sentry.on-light.svg", dark: "/images/agent-vault-templates/Sentry.svg" },
    GitHub: { light: "/images/agent-vault-templates/GitHub.on-light.png", dark: "/images/agent-vault-templates/GitHub.png" }
  };

  const LABELS = { VM: "Virtual machine" };

  const [guides, setGuides] = useState(null);
  const [docsBase, setDocsBase] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);
  const [useCase, setUseCase] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const rootRef = useRef(null);
  const tableRef = useRef(null);
  const filtersRef = useRef(null);

  // A filter menu closes on a click outside the filters, or on Escape.
  useEffect(() => {
    if (!openMenu) return undefined;
    const onDown = (event) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target)) setOpenMenu(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const splitNames = (cell) =>
    (cell?.textContent ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

  useEffect(() => {
    const path = window.location.pathname;
    const base = path === "/docs" || path.startsWith("/docs/") ? "/docs" : "";
    setDocsBase(base);

    const parsed = [];
    tableRef.current?.querySelectorAll("tbody tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      const link = cells[0]?.querySelector("a");
      if (!link) return;
      const rawHref = link.getAttribute("href");
      parsed.push({
        title: link.textContent.trim(),
        // Keep the bare path. The links this component renders get the base path below.
        href: base && rawHref.startsWith(`${base}/`) ? rawHref.slice(base.length) : rawHref,
        example: (cells[1]?.textContent ?? "").trim().toLowerCase() === "example",
        agents: splitNames(cells[2]),
        compute: splitNames(cells[3]),
        services: splitNames(cells[4]),
        useCases: splitNames(cells[5]),
        description: (cells[6]?.textContent ?? "").trim()
      });
    });
    if (parsed.length) setGuides(parsed);
  }, []);

  // The links are root-relative, because Mintlify opens relative ones in a new tab. Mintlify usually adds the /docs
  // base path to those, but not always, so add it only when it's missing.
  useEffect(() => {
    if (!docsBase || !rootRef.current) return;
    rootRef.current.querySelectorAll("a[href^='/']").forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href.startsWith(`${docsBase}/`)) anchor.setAttribute("href", `${docsBase}${href}`);
    });
  });

  const label = (name) => LABELS[name] ?? name;

  const serviceIcon = (name) => {
    const logo = SERVICE_LOGOS[name];
    if (!logo) return null;
    return (
      <span className="ifx-avqs__chip-icon">
        {logo.dark ? (
          <>
            <img src={`${docsBase}${logo.light}`} alt="" className="ifx-avqs__img ifx-avqs__img--light-only" />
            <img src={`${docsBase}${logo.dark}`} alt="" className="ifx-avqs__img ifx-avqs__img--dark-only" />
          </>
        ) : (
          <img src={`${docsBase}${logo.light}`} alt="" className="ifx-avqs__img" />
        )}
      </span>
    );
  };

  // An agent's or platform's logo, with its dark-mode version when it has one, in the quickstart configurator's
  // image markup. A virtual machine has no brand, so it gets a server icon.
  const logo = (name) => {
    if (name === "VM") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
          <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
          <line x1="6" x2="6.01" y1="6" y2="6" />
          <line x1="6" x2="6.01" y1="18" y2="18" />
        </svg>
      );
    }
    if (!LOGOS[name]) return null;
    const light = `${docsBase}${LOGOS[name]}`;
    const dark = DARK_LOGOS[name] ? `${docsBase}${DARK_LOGOS[name]}` : null;
    return dark ? (
      <>
        <img src={light} alt="" className="ifx-avqs__img ifx-avqs__img--light-only" />
        <img src={dark} alt="" className="ifx-avqs__img ifx-avqs__img--dark-only" />
      </>
    ) : (
      <img src={light} alt="" className="ifx-avqs__img" />
    );
  };

  // The logo at text size, as the configurator's chips show it.
  const chipIcon = (name) => (logo(name) ? <span className="ifx-avqs__chip-icon">{logo(name)}</span> : null);

  // This page's own kind of guide, and the other axis, which its filter uses.
  const own = AXES[view] ? view : "agent";
  const other = own === "agent" ? "compute" : "agent";
  const ownColumn = AXES[own].column;
  const otherColumn = AXES[other].column;

  const all = guides ?? [];
  const needle = query.trim().toLowerCase();
  const matchesQuery = (guide) =>
    !needle ||
    [
      guide.title,
      guide.description,
      ...guide.agents,
      ...guide.compute.map(label),
      ...guide.services,
      ...guide.useCases
    ].some((text) => text.toLowerCase().includes(needle));

  // Setup guides for this page's axis come first, since they work with anything on the other axis. They belong to no
  // use case, so picking one hides them. Examples that involve this axis follow, narrowed by both filters.
  const setups = useCase
    ? []
    : all.filter(
        (guide) => !guide.example && guide[ownColumn].length > 0 && guide[otherColumn].length === 0 && matchesQuery(guide)
      );
  const examples = all.filter(
    (guide) =>
      guide.example &&
      guide[ownColumn].length > 0 &&
      (!picked || guide[otherColumn].includes(picked)) &&
      (!useCase || guide.useCases.includes(useCase)) &&
      matchesQuery(guide)
  );
  const shown = [...setups, ...examples];

  // One section per agent or platform on this page's axis, with a card for each of its guides. A guide tagged with
  // two of them appears in both sections.
  const sectionNames = [
    ...AXES[own].order,
    ...new Set(shown.flatMap((guide) => guide[ownColumn]).filter((name) => !AXES[own].order.includes(name)))
  ];
  const sections = sectionNames
    .map((name) => ({ name, guides: shown.filter((guide) => guide[ownColumn].includes(name)) }))
    .filter((section) => section.guides.length > 0);
  const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const filters = AXES[other].order.filter((name) => all.some((guide) => guide[otherColumn].includes(name)));

  // The use case filter only helps once there's a choice, so it appears when the catalog has two use cases or more.
  const useCases = [...new Set(all.flatMap((guide) => guide.useCases))];
  const showUseCases = useCases.length >= 2;

  // Mintlify's Card, so the guides look like the cards on every other page. The icon shows every agent and platform
  // the guide combines, so an example's card shows both its agent and where it runs.
  const card = (guide) => {
    const names = [...guide.agents, ...guide.compute];
    const icon = names.some((name) => LOGOS[name] || name === "VM") ? (
      <span className="ifx-avg__card-icons">{names.map((name) => <span key={name}>{chipIcon(name)}</span>)}</span>
    ) : (
      "bot"
    );
    return (
      <Card key={guide.title} title={guide.title} icon={icon} href={guide.href}>
        {guide.href.startsWith("https://github.com/") && (
          <span className="ifx-avg__card-github" title="Opens on GitHub">
            {serviceIcon("GitHub")}
          </span>
        )}
        {guide.description}.
        {guide.services.length > 0 && (
          <span className="ifx-avg__card-services" aria-label={`Services: ${guide.services.join(", ")}`}>
            {guide.services.map((name) => (
              <span key={name} title={name}>
                {serviceIcon(name) ?? name}
              </span>
            ))}
          </span>
        )}
      </Card>
    );
  };

  const count = shown.length;

  // A filter is a button that opens a menu of tiles, like the quickstart configurator's (.ifx-avqs). The button
  // shows the filter's name until something is picked, then the pick.
  const filterMenu = (id, name, options, value, setValue) => {
    const active = options.find((option) => option.id === value);
    const choose = (next) => {
      setValue(next);
      setOpenMenu(null);
    };
    return (
      <span key={id} className="ifx-avqs__slot">
        <button
          type="button"
          className="ifx-catalog__filter ifx-catalog__filter--logo"
          aria-pressed={Boolean(active)}
          aria-haspopup="dialog"
          aria-expanded={openMenu === id}
          onClick={() => setOpenMenu(openMenu === id ? null : id)}
        >
          {active ? (
            <>
              {active.chip}
              {active.label}
            </>
          ) : (
            name
          )}
          <svg className="ifx-avqs__chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {openMenu === id && (
          <div className="ifx-avqs__menu ifx-ucp__menu ifx-avg__menu" role="dialog" aria-label={`Filter by ${name.toLowerCase()}`}>
            <div role="listbox" aria-label={name}>
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={value === option.id}
                  className="ifx-ucp__option ifx-avg__option"
                  onClick={() => choose(value === option.id ? null : option.id)}
                >
                  {option.chip}
                  <span>{option.label}</span>
                  {value === option.id && (
                    <svg className="ifx-avg__check" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            {active && (
              <button type="button" className="ifx-avqs__clear" onClick={() => choose(null)}>
                Clear selection
              </button>
            )}
          </div>
        )}
      </span>
    );
  };

  return (
    <div ref={rootRef}>
      {guides && (
        <div className="ifx-catalog">
          <div className="ifx-catalog__search">
            <svg aria-hidden="true" className="ifx-catalog__search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
            <label className="sr-only" htmlFor={`guides-${own}-search`}>
              Search guides
            </label>
            <input
              id={`guides-${own}-search`}
              type="search"
              className="ifx-catalog__input"
              placeholder="Search guides..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div ref={filtersRef} className="ifx-catalog__filters" role="group" aria-label="Filter guides">
            {filterMenu(
              "other",
              other === "compute" ? "Runs on" : "Agent",
              filters.map((name) => ({ id: name, label: label(name), chip: chipIcon(name) })),
              picked,
              setPicked
            )}
            {showUseCases &&
              filterMenu(
                "useCase",
                "Use case",
                useCases.map((name) => ({ id: name, label: name, chip: null })),
                useCase,
                setUseCase
              )}
          </div>

          <p className="ifx-catalog__count" aria-live="polite">
            {count} {count === 1 ? "guide" : "guides"}
            {query.trim() && ` for "${query.trim()}"`}
          </p>
        </div>
      )}

      <div ref={tableRef} hidden={Boolean(guides)}>
        {children}
      </div>

      {guides &&
        (count > 0 ? (
          sections.map((section) => (
            <section key={section.name}>
              <h3 id={slug(section.name)}>{label(section.name)}</h3>
              <Columns cols={2}>{section.guides.map(card)}</Columns>
            </section>
          ))
        ) : (
          <div className="ifx-catalog__empty">No guides match your search and filter.</div>
        ))}
    </div>
  );
};
