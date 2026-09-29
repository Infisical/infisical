export const CLIPage = ({ title, description, children }) => {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const navbar = document.getElementById("navbar");
    const top = navbar ? navbar.getBoundingClientRect().height : 64;
    root.style.setProperty("--cli-top", `${Math.round(top)}px`);

    const sections = Array.from(root.querySelectorAll("[data-cli-command]"));

    // On a fresh load the page keeps growing after the first frame (subcommand lists fill in,
    // fonts and sticky headings settle), which pushes the target down. Keep realigning while the
    // page resizes, until the reader scrolls on their own or the layout has had time to settle.
    let stopAligning = () => {};
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const target = hash ? document.getElementById(hash) : null;
    
    let pinned = target ? target.closest("[data-cli-command]") : null;
    const unpinEvents = ["wheel", "touchstart", "keydown", "mousedown"];
    const unpin = () => {
      pinned = null;
      unpinEvents.forEach((type) => window.removeEventListener(type, unpin));
    };
    if (pinned) unpinEvents.forEach((type) => window.addEventListener(type, unpin, { passive: true }));
    if (target) {
      let aligning = true;
      const block = target.classList.contains("cli-row") ? "center" : "start";
      const align = () => {
        if (aligning) target.scrollIntoView({ block });
      };
      const alignFrame = requestAnimationFrame(align);
      const resizes = new ResizeObserver(align);
      resizes.observe(root);
      if (document.fonts) document.fonts.ready.then(align);
      const userEvents = ["wheel", "touchstart", "keydown", "mousedown"];
      const stop = () => {
        aligning = false;
        cancelAnimationFrame(alignFrame);
        resizes.disconnect();
        clearTimeout(timeout);
        userEvents.forEach((type) => window.removeEventListener(type, stop));
      };
      const timeout = setTimeout(stop, 2000);
      userEvents.forEach((type) => window.addEventListener(type, stop, { passive: true }));
      stopAligning = stop;
    }

    // The URL follows the reader so a copied link lands on the command in view. replaceState
    // keeps scrolling out of the back-button history, and passing the router's own state
    // through stops Next from treating the change as a navigation.
    let frame = 0;
    let settle = 0;
    let current;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = top + 24;
        let reached = null;
        for (const el of sections) {
          const box = el.getBoundingClientRect();
          // Past the point where the divider meets the heading, the divider does the border's job.
          const head = el.firstElementChild ? el.firstElementChild.offsetHeight : 0;
          el.classList.toggle("cli-cmd--stuck", box.top < top && box.bottom > top + head + 1);
          if (box.top - line <= 0) reached = el.id;
        }
        const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
        if (atBottom && sections.length) reached = sections[sections.length - 1].id;
        if (pinned) reached = pinned.id;
        if (reached === current) return;
        // A smooth scroll to a flag passes through earlier commands on the way. Writing those
        // into the URL would replace the link the reader just chose, and lighting each one up
        // in the sidebar would flicker, so wait for the jump to settle and look again.
        const lockedFor = Number(document.documentElement.dataset.cliJumpUntil || 0) - Date.now();
        if (lockedFor > 0) {
          clearTimeout(settle);
          settle = setTimeout(onScroll, lockedFor + 50);
          return;
        }
        current = reached;
        const path = reached ? document.getElementById(reached).dataset.command : null;
        window.dispatchEvent(new CustomEvent("cli-reference:active", { detail: { id: reached, path } }));
        const hashNow = decodeURIComponent(window.location.hash.slice(1));
        if (!reached) {
          // Mintlify scrolls to whatever hash is in the URL, so the hero must not carry one.
          if (hashNow) window.history.replaceState(window.history.state, "", window.location.pathname);
          return;
        }
        if (hashNow !== reached && !hashNow.startsWith(`${reached}--`)) {
          window.history.replaceState(window.history.state, "", `#${reached}`);
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      stopAligning();
      unpin();
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener("scroll", onScroll);
      window.dispatchEvent(new CustomEvent("cli-reference:active", { detail: { id: null } }));
    };
  }, []);

  return (
    <div className="cli-ref" ref={rootRef}>
      <header className="cli-ref__hero">
        <h1 className="cli-ref__title">{title}</h1>
        {description ? <div className="cli-ref__description">{description}</div> : null}
      </header>
      {children}
    </div>
  );
};

export const CLICommand = ({
  id,
  command,
  heading,
  usage,
  description,
  args = [],
  flags = [],
  inheritedFlags = [],
  env = [],
  examples = [],
  children
}) => {
  const [copied, setCopied] = useState(null);
  const [subcommands, setSubcommands] = useState([]);
  const sectionRef = useRef(null);
  const headingRef = useRef(null);

  // The sidebar lists only root commands, so each command lists its direct subcommands. They are
  // read from the rendered page, so a new block shows up in its parent's list with no extra edit.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const page = section.closest(".cli-ref") || document;
    const depth = command.split(" ").length + 1;
    const found = Array.from(page.querySelectorAll("[data-cli-command]"))
      .filter((el) => {
        const path = el.dataset.command || "";
        return path.startsWith(`${command} `) && path.split(" ").length === depth;
      })
      .map((el) => ({ id: el.id, command: el.dataset.command }));
    setSubcommands(found);
  }, [command]);

  // Anchored rows and the sticky examples sit below the sticky heading, whose height depends
  // on how the signature wraps.
  useEffect(() => {
    const section = sectionRef.current;
    const heading = headingRef.current;
    if (!section || !heading) return undefined;
    const measure = () => section.style.setProperty("--cli-head", `${Math.round(heading.offsetHeight)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  // Descriptions arrive as prop strings, which MDX does not parse, so backticks, **bold**
  // UI labels, and [text](href) links are rendered here. The CLI's help text marks commands as
  // [infisical ...], which renders as code.
  const inline = (text) => {
    if (!text) return null;
    const parts = [];
    const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\[(infisical [^\]]+)\]|\*\*([^*]+)\*\*/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > last) parts.push(text.slice(last, match.index));
      if (match[1]) parts.push(<code key={match.index}>{match[1]}</code>);
      else if (match[4]) parts.push(<code key={match.index}>{match[4]}</code>);
      else if (match[5]) parts.push(<strong key={match.index}>{match[5]}</strong>);
      else parts.push(<a key={match.index} href={match[3]}>{match[2]}</a>);
      last = pattern.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const slug = (name) => name.replace(/^-+/, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const anchor = (kind, name) => `${id}--${kind}-${slug(name)}`;

  const jump = (event, target) => {
    const el = document.getElementById(target);
    if (!el) return;
    event.preventDefault();
    document.documentElement.dataset.cliJumpUntil = String(Date.now() + 1200);
    const isRow = el.classList.contains("cli-row");
    el.scrollIntoView({ behavior: "smooth", block: isRow ? "center" : "start" });
    window.history.replaceState(window.history.state, "", `#${target}`);
    if (!isRow) return;
    el.classList.remove("cli-row--flash");
    void el.offsetWidth;
    el.classList.add("cli-row--flash");
  };

  const copy = (index, code) => {
    navigator.clipboard.writeText(code);
    setCopied(index);
    setTimeout(() => setCopied(null), 1500);
  };

  const highlight = (code) =>
    code.split("\n").map((line, lineIndex) => {
      if (/^\s*#/.test(line)) {
        return (
          <span key={lineIndex} className="cli-code__line cli-code__comment">
            {line}
            {"\n"}
          </span>
        );
      }
      const tokens = line.split(/(\s+|"[^"]*"|'[^']*')/).filter((t) => t !== "");
      return (
        <span key={lineIndex} className="cli-code__line">
          {tokens.map((token, tokenIndex) => {
            let cls = null;
            if (token === "infisical") cls = "cli-code__bin";
            else if (/^--?[a-zA-Z]/.test(token)) cls = "cli-code__flag";
            else if (/^["']/.test(token)) cls = "cli-code__string";
            else if (tokenIndex === 0 && /^(export|eval)$/.test(token)) cls = "cli-code__muted";
            return cls ? (
              <span key={tokenIndex} className={cls}>
                {token}
              </span>
            ) : (
              token
            );
          })}
          {"\n"}
        </span>
      );
    });

  const renderRows = (kind, heading, rows, tableId = `${id}--${kind}s`) =>
    rows.length ? (
      <div className="cli-cmd__table" id={tableId}>
        <h3 className="cli-cmd__table-title">{heading}</h3>
        {rows.map((row) => (
          <div key={row.name} id={anchor(kind, row.name)} className="cli-row">
            <div className="cli-row__head">
              <a
                className="cli-row__name"
                href={`#${anchor(kind, row.name)}`}
                onClick={(event) => jump(event, anchor(kind, row.name))}
              >
                {row.short ? `${row.short}, ` : ""}
                {row.name}
                {row.value && row.value !== `<${row.type}>` ? (
                  <span className="cli-row__value"> {row.value}</span>
                ) : null}
              </a>
              {row.type ? <span className="cli-row__meta">{row.type}</span> : null}
              {row.required ? <span className="cli-row__meta cli-row__meta--required">required</span> : null}
              {kind === "arg" && !row.required ? <span className="cli-row__meta">optional</span> : null}
              {row.repeatable ? <span className="cli-row__meta">repeatable</span> : null}
              {row.deprecated ? <span className="cli-row__meta cli-row__meta--deprecated">deprecated</span> : null}
            </div>
            <div className="cli-row__doc">{inline(row.description)}</div>
            {row.default !== undefined ? (
              <div className="cli-row__default">
                Default: <code>{String(row.default)}</code>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    ) : null;

  // Past two flags the heading stops being scannable, so it links to the table instead.
  const listed = flags.filter((flag) => !flag.deprecated);
  const collapseFlags = listed.length >= 3;
  const flagCount = flags.length + inheritedFlags.length;
  const flagsTable = flags.length ? `${id}--flags` : `${id}--inherited-flags`;

  const usageTokens = usage ? usage.match(/\[[^\]]*\](?:\.\.\.)?|<[^>]*>(?:\.\.\.)?|\S+/g) || [] : [];
  const isFlagsPlaceholder = (token) => /^\[.*\bflags\b.*\]$/.test(token);
  const usageNamesFlags = usageTokens.some(isFlagsPlaceholder);
  const paragraphs = description
    ? description.split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    : [];

  const signature = (
    <>
      <span className="cli-usage__bin">infisical</span>{" "}
      <a className="cli-usage__cmd" href={`#${id}`} onClick={(event) => jump(event, id)}>
        {command}
      </a>
      {usage ? null : args.map((arg) => (
        <span key={arg.name}>
          {" "}
          <a
            className="cli-usage__arg"
            href={`#${anchor("arg", arg.name)}`}
            onClick={(event) => jump(event, anchor("arg", arg.name))}
          >
            {arg.name}
          </a>
        </span>
      ))}
      {usageTokens.map((token, index) => {
        const arg = args.find((candidate) => candidate.usage === token);
        let content = <span className="cli-usage__arg">{token}</span>;
        if (isFlagsPlaceholder(token) && flagCount) {
          content = (
            <a className="cli-usage__flag" href={`#${flagsTable}`} onClick={(event) => jump(event, flagsTable)}>
              {token}
            </a>
          );
        } else if (arg) {
          content = (
            <a
              className="cli-usage__arg"
              href={`#${anchor("arg", arg.name)}`}
              onClick={(event) => jump(event, anchor("arg", arg.name))}
            >
              {token}
            </a>
          );
        }
        return (
          <span key={`usage-${index}`}>
            {" "}
            {content}
          </span>
        );
      })}
      {usageNamesFlags ? null : collapseFlags ? (
        <span>
          {" "}
          <a
            className="cli-usage__flag"
            href={`#${id}--flags`}
            onClick={(event) => jump(event, `${id}--flags`)}
          >
            [flags]
          </a>
        </span>
      ) : (
        listed.map((flag) => (
          <span key={flag.name}>
            {" "}
            <a
              className="cli-usage__flag"
              href={`#${anchor("flag", flag.name)}`}
              onClick={(event) => jump(event, anchor("flag", flag.name))}
            >
              {flag.required ? "" : "["}
              {flag.name}
              {flag.value ? `=${flag.value}` : ""}
              {flag.required ? "" : "]"}
            </a>
          </span>
        ))
      )}
    </>
  );

  return (
    <section
      ref={sectionRef}
      id={id}
      className="cli-cmd"
      data-cli-command=""
      data-command={command}
    >
      <h2 className={heading ? "cli-cmd__title cli-cmd__title--text" : "cli-cmd__title"} ref={headingRef}>
        {heading ? (
          <a className="cli-usage__cmd" href={`#${id}`} onClick={(event) => jump(event, id)}>
            {heading}
          </a>
        ) : (
          signature
        )}
      </h2>
      <div className="cli-cmd__body">
        <div className="cli-cmd__description">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{inline(paragraph)}</p>
          ))}
          {children}
        </div>
        {subcommands.length ? (
          <div className="cli-subs" id={`${id}--subcommands`}>
            <h3 className="cli-cmd__table-title">Subcommands</h3>
            <ul className="cli-subs__list">
              {subcommands.map((sub) => (
                <li key={sub.id}>
                  <a href={`#${sub.id}`} onClick={(event) => jump(event, sub.id)}>
                    infisical {sub.command}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {renderRows("arg", "Arguments", args)}
        {renderRows("flag", "Flags", flags)}
        {renderRows("flag", "Inherited flags", inheritedFlags, `${id}--inherited-flags`)}
        {renderRows("env", "Environment variables", env)}
      </div>
      {examples.length ? (
        <aside className="cli-cmd__examples" aria-label={`Examples for infisical ${command}`}>
          <div className="cli-cmd__examples-inner">
            {examples.map((example, index) => (
              <figure key={index} className="cli-example">
                <figcaption className="cli-example__title">
                  <span>{example.title}</span>
                  <button
                    type="button"
                    className="cli-example__copy"
                    aria-label={`Copy: ${example.title}`}
                    onClick={() => copy(index, example.code)}
                  >
                    {copied === index ? "Copied" : "Copy"}
                  </button>
                </figcaption>
                <pre className="cli-code">
                  <code>{highlight(example.code)}</code>
                </pre>
                {example.output ? (
                  <pre className="cli-code cli-code--output">
                    <code>{example.output}</code>
                  </pre>
                ) : null}
              </figure>
            ))}
          </div>
        </aside>
      ) : null}
    </section>
  );
};
