export const AgentVaultGuides = ({ children }) => {
  const AXES = {
    agent: { order: ["Claude Code", "Codex", "OpenCode", "OpenClaw", "Hermes", "Cursor"] },
    compute: { order: ["Docker", "VM", "Kubernetes", "Modal", "Daytona", "E2B"] }
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

  const DARK_LOGOS = {
    Codex: "/images/agent-vault-agents/OpenAIWhite.png",
    OpenCode: "/images/agent-vault-agents/opencode.on-dark.svg",
    Hermes: "/images/agent-vault-agents/hermes.on-dark.png"
  };

  const SERVICE_LOGOS = {
    Slack: { light: "/images/agent-vault-templates/Slack.svg" },
    Ashby: { light: "/images/agent-vault-templates/Ashby.png" },
    Linear: { light: "/images/agent-vault-templates/Linear.svg" },
    Notion: { light: "/images/agent-vault-templates/Notion.svg" },
    Telegram: { light: "/images/agent-vault-templates/Telegram.svg" },
    Sentry: { light: "/images/agent-vault-templates/Sentry.on-light.svg", dark: "/images/agent-vault-templates/Sentry.svg" },
    GitHub: { light: "/images/agent-vault-templates/GitHub.on-light.png", dark: "/images/agent-vault-templates/GitHub.png" }
  };

  const LABELS = { VM: "Virtual machine" };

  const [guides, setGuides] = useState(null);
  const [docsBase, setDocsBase] = useState("");
  const [query, setQuery] = useState("");
  const [agent, setAgent] = useState(null);
  const [compute, setCompute] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const rootRef = useRef(null);
  const tableRef = useRef(null);
  const filtersRef = useRef(null);

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
        href: base && rawHref.startsWith(`${base}/`) ? rawHref.slice(base.length) : rawHref,
        example: (cells[1]?.textContent ?? "").trim().toLowerCase() === "example",
        agents: splitNames(cells[2]),
        compute: splitNames(cells[3]),
        services: splitNames(cells[4]),
        useCases: splitNames(cells[5]),
        description: (cells[6]?.textContent ?? "").trim(),
        featured: (cells[7]?.textContent ?? "").trim() !== ""
      });
    });
    if (parsed.length) setGuides(parsed);
  }, []);

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

  const chipIcon = (name) => (logo(name) ? <span className="ifx-avqs__chip-icon">{logo(name)}</span> : null);

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

  const byOrder = (order) => (a, b) => {
    const rank = (name) => (order.indexOf(name) === -1 ? order.length : order.indexOf(name));
    return rank(a) - rank(b);
  };
  const ordered = (column, order) => [...new Set(all.flatMap((guide) => guide[column]))].sort(byOrder(order));
  const agentOptions = ordered("agents", AXES.agent.order);
  const computeOptions = ordered("compute", AXES.compute.order);

  const shown = all
    .filter(
      (guide) =>
        (!agent || guide.agents.includes(agent)) &&
        (!compute || guide.compute.includes(compute)) &&
        matchesQuery(guide)
    )
    .sort((a, b) => a.title.localeCompare(b.title));

  const filtered = Boolean(query.trim() || agent || compute);
  const recommended = filtered ? [] : shown.filter((guide) => guide.featured);
  const sections = [
    ...(recommended.length ? [{ name: "Recommended", guides: recommended }] : []),
    { name: filtered ? null : "All guides", guides: shown }
  ].filter((section) => section.guides.length > 0);
  const count = shown.length;
  const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const card = (guide) => {
    const names = [...(guide.agents.length === 1 ? guide.agents : []), ...guide.compute];
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
            <label className="sr-only" htmlFor="guides-search">
              Search guides
            </label>
            <input
              id="guides-search"
              type="search"
              className="ifx-catalog__input"
              placeholder="Search guides..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div ref={filtersRef} className="ifx-catalog__filters" role="group" aria-label="Filter guides">
            {filterMenu(
              "agent",
              "Agent",
              agentOptions.map((name) => ({ id: name, label: label(name), chip: chipIcon(name) })),
              agent,
              setAgent
            )}
            {filterMenu(
              "compute",
              "Compute",
              computeOptions.map((name) => ({ id: name, label: label(name), chip: chipIcon(name) })),
              compute,
              setCompute
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
            <section key={section.name ?? "results"}>
              {section.name && <h3 id={slug(section.name)}>{section.name}</h3>}
              <Columns cols={2}>{section.guides.map(card)}</Columns>
            </section>
          ))
        ) : (
          <div className="ifx-catalog__empty">No guides match your search and filter.</div>
        ))}
    </div>
  );
};
