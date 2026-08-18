export const HomeHero = ({ title, description, aside, children }) => (
  <div className="ifx-home__hero">
    <div className="ifx-home__hero-main">
      {/* <p className="ifx-home__eyebrow">{eyebrow}</p> */}
      <h1 className="ifx-home__title">{title}</h1>
      <div className="ifx-home__lede">{description}</div>
      <div className="ifx-home__actions">{children}</div>
    </div>
    {aside ? <div className="ifx-home__hero-aside">{aside}</div> : null}
  </div>
);

export const HomeSteps = ({ steps }) => {
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(null);

  const copy = (command) => {
    navigator.clipboard.writeText(command);
    setCopied(command);
    setTimeout(() => setCopied(null), 1500);
  };

  const commandRow = (command) => (
    <div key={command} className="ifx-steps__cmd">
      <code className="ifx-steps__code">{command}</code>
      <button
        type="button"
        className="ifx-steps__copy"
        aria-label={`Copy: ${command}`}
        onClick={() => copy(command)}
      >
        {copied === command ? (
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
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
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
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        )}
      </button>
    </div>
  );

  return (
    <div className="ifx-steps">
      <ol className="ifx-steps__list">
        {steps.map((step, i) => (
          <li key={i} className="ifx-steps__item">
            <span className="ifx-steps__num">{i + 1}</span>
            {step.label ? (
              step.href ? (
                <a className="ifx-steps__label" href={step.href}>
                  {step.label}
                </a>
              ) : (
                <span className="ifx-steps__label">{step.label}</span>
              )
            ) : null}
            {step.tabs ? (
              <>
                <div className="ifx-steps__tabs">
                  {step.tabs.map((option, index) => (
                    <button
                      key={option.label}
                      type="button"
                      className={`ifx-steps__tab${
                        index === tab ? " ifx-steps__tab--active" : ""
                      }`}
                      onClick={() => setTab(index)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {commandRow(step.tabs[tab].command)}
              </>
            ) : step.commands ? (
              step.commands.map(commandRow)
            ) : null}
            {step.content ? (
              <div className="ifx-steps__content">{step.content}</div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
};

export const HomeStack = ({ items }) => (
  <div className="ifx-stack">
    {items.map((item) => (
      <a key={item.href} className="ifx-stack__tile" href={item.href}>
        {item.logo ? (
          <img
            className={`ifx-stack__logo${
              item.adapt ? ` ifx-stack__logo--adapt-${item.adapt}` : ""
            }`}
            src={item.logo}
            alt=""
            aria-hidden="true"
          />
        ) : (
          <svg
            className="ifx-stack__logo ifx-stack__glyph"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        )}
        <span className="ifx-stack__label">{item.label}</span>
      </a>
    ))}
  </div>
);

export const Mark = ({ children }) => <span className="ifx-mark">{children}</span>;

export const HomeButton = ({ href, variant = "secondary", children }) => (
  <a href={href} className={`ifx-btn ifx-btn--${variant}`}>
    {children}
  </a>
);

export const HomeSection = ({ title, children }) => (
  <section className="ifx-home__section">
    <h2 className="ifx-home__section-title">{title}</h2>
    {children}
  </section>
);

export const HomeGrid = ({ cols = 3, children }) => (
  <div className={`ifx-grid ifx-grid--${cols}`}>{children}</div>
);

export const HomeCard = ({
  title,
  href,
  icon,
  product,
  wide,
  links,
  panel,
  children
}) => {
  // Declared inside the component on purpose: Mintlify evaluates each exported
  // component in isolation, so module-scope bindings are not in scope here.
  const icons = {
    vault: (
      <>
        <rect x="3" y="3" width="18" height="18" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 8V6M12 18v-2M16 12h2M6 12h2" />
      </>
    ),
    radar: (
      <>
        <path d="M19.07 4.93A10 10 0 1 1 6.99 3.34" />
        <path d="M4 12a8 8 0 0 1 8-8" />
        <path d="M13.41 10.59 16.5 7.5" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    certificate: (
      <>
        <circle cx="12" cy="9" r="6" />
        <path d="M8.5 14.5 7 22l5-3 5 3-1.5-7.5" />
      </>
    ),
    "user-shield": (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <circle cx="12" cy="9.5" r="2.5" />
        <path d="M8.5 16a3.5 3.5 0 0 1 7 0" />
      </>
    ),
    key: (
      <>
        <path d="M2.59 17.41A2 2 0 0 0 2 18.83V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.17a2 2 0 0 0 1.41-.59l.82-.81" />
        <circle cx="16.5" cy="7.5" r="5.5" />
      </>
    ),
    terminal: (
      <>
        <path d="m4 17 6-6-6-6" />
        <path d="M12 19h8" />
      </>
    ),
    book: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
    server: (
      <>
        <rect x="2" y="3" width="20" height="8" />
        <rect x="2" y="13" width="20" height="8" />
        <path d="M6 7h.01M6 17h.01" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    )
  };

  const className = `ifx-card${product ? ` ifx-card--${product}` : ""}${
    wide ? " ifx-card--wide" : ""
  }`;

  const iconEl = (
    <svg
      className="ifx-card__icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[icon]}
    </svg>
  );

  const chevron = (
    <svg
      className="ifx-card__chevron"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );

  const body = children ? (
    <div className="ifx-card__body">{children}</div>
  ) : null;

  // The panel arrives already rendered, so the card does not need to know
  // whether it holds a tile grid or anything else.
  const linksEl =
    links && links.length ? (
      <div className="ifx-card__links">
        {links.map((link) => (
          <a key={link.href} className="ifx-card__link" href={link.href}>
            <span>{link.label}</span>
            <svg
              className="ifx-card__arrow"
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
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        ))}
      </div>
    ) : null;

  // With shortcuts the card cannot be one big anchor, since nesting links
  // inside a link is invalid, so the title becomes the link instead.
  if (linksEl || panel) {
    const main = (
      <>
        {iconEl}
        <a className="ifx-card__title" href={href}>
          {title}
          {chevron}
        </a>
        {body}
        {linksEl}
      </>
    );

    // The panel needs its own column, so the copy is wrapped to sit beside it.
    return (
      <div className={className}>
        {panel ? <div className="ifx-card__main">{main}</div> : main}
        {panel}
      </div>
    );
  }

  return (
    <a href={href} className={className}>
      {iconEl}
      <span className="ifx-card__title">
        {title}
        {chevron}
      </span>
      {body}
    </a>
  );
};
