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

export const HomeStack = ({ items }) => {
  const path = typeof window === "undefined" ? "" : window.location.pathname;
  const base = path === "/docs" || path.startsWith("/docs/") ? "/docs" : "";

  return (
    <div className="ifx-stack">
      {items.map((item) => (
        <a key={item.href} className="ifx-stack__tile" href={item.href}>
          {item.logo ? (
            <img
              className={`ifx-stack__logo${
                item.adapt ? ` ifx-stack__logo--adapt-${item.adapt}` : ""
              }`}
              src={`${base}${item.logo}`}
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
};

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

export const HomeRow = ({ items }) => (
  <div className="ifx-row">
    {items.map((item) => (
      <a key={item.href} className="ifx-row__item" href={item.href}>
        {item.label}
        <svg
          className="ifx-row__arrow"
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
    secrets: (
      <>
        <path d="M10 12C10 14.2091 8.20914 16 6 16C3.79086 16 2 14.2091 2 12C2 9.79086 3.79086 8 6 8C8.20914 8 10 9.79086 10 12ZM10 12H22V15" />
        <path d="M18 12V15" />
      </>
    ),
    radar: (
      <>
        <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
        <path d="M4 6h.01" />
        <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
        <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
        <path d="M12 18h.01" />
        <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
        <path d="m13.41 10.59 5.66-5.66" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    certificate: (
      <>
        <path d="M8.5 11.5L11.5 14.5L16.5 9.5" />
        <path d="M5 18L3.13036 4.91253C3.05646 4.39524 3.39389 3.91247 3.90398 3.79912L11.5661 2.09641C11.8519 2.03291 12.1481 2.03291 12.4339 2.09641L20.096 3.79912C20.6061 3.91247 20.9435 4.39524 20.8696 4.91252L19 18C18.9293 18.495 18.5 21.5 12 21.5C5.5 21.5 5.07071 18.495 5 18Z" />
      </>
    ),
    "user-shield": (
      <>
        <path d="M2 20V19C2 15.134 5.13401 12 9 12V12" />
        <path d="M15.8038 12.3135C16.4456 11.6088 17.5544 11.6088 18.1962 12.3135C18.5206 12.6697 18.9868 12.8628 19.468 12.8403C20.4201 12.7958 21.2042 13.5799 21.1597 14.532C21.1372 15.0132 21.3303 15.4794 21.6865 15.8038C22.3912 16.4456 22.3912 17.5544 21.6865 18.1962C21.3303 18.5206 21.1372 18.9868 21.1597 19.468C21.2042 20.4201 20.4201 21.2042 19.468 21.1597C18.9868 21.1372 18.5206 21.3303 18.1962 21.6865C17.5544 22.3912 16.4456 22.3912 15.8038 21.6865C15.4794 21.3303 15.0132 21.1372 14.532 21.1597C13.5799 21.2042 12.7958 20.4201 12.8403 19.468C12.8628 18.9868 12.6697 18.5206 12.3135 18.1962C11.6088 17.5544 11.6088 16.4456 12.3135 15.8038C12.6697 15.4794 12.8628 15.0132 12.8403 14.532C12.7958 13.5799 13.5799 12.7958 14.532 12.8403C15.0132 12.8628 15.4794 12.6697 15.8038 12.3135Z" />
        <path d="M15.3636 17L16.4546 18.0909L18.6364 15.9091" />
        <path d="M9 12C11.2091 12 13 10.2091 13 8C13 5.79086 11.2091 4 9 4C6.79086 4 5 5.79086 5 8C5 10.2091 6.79086 12 9 12Z" />
      </>
    ),
    lock: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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
    ),
    audit: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
    code: (
      <>
        <path d="m16 18 6-6-6-6" />
        <path d="m8 6-6 6 6 6" />
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

export const HomeLinks = ({ items }) => {
  // Declared inside the component on purpose: Mintlify evaluates each exported
  // component in isolation, so module-scope bindings are not in scope here.
  const icons = {
    server: (
      <>
        <rect x="2" y="3" width="20" height="8" />
        <rect x="2" y="13" width="20" height="8" />
        <path d="M6 7h.01M6 17h.01" />
      </>
    ),
    code: (
      <>
        <path d="m16 18 6-6-6-6" />
        <path d="m8 6-6 6 6 6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    key: (
      <>
        <path d="M2.59 17.41A2 2 0 0 0 2 18.83V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.17a2 2 0 0 0 1.41-.59l.82-.81" />
        <circle cx="16.5" cy="7.5" r="5.5" />
      </>
    )
  };

  return (
    <div className="ifx-links">
      {items.map((item) => (
        <a key={item.href} className="ifx-links__item" href={item.href}>
          <svg
            className="ifx-links__icon"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {icons[item.icon]}
          </svg>
          <span className="ifx-links__label">
            {item.label}
            <svg
              className="ifx-links__chevron"
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
              <path d="m9 18 6-6-6-6" />
            </svg>
          </span>
        </a>
      ))}
    </div>
  );
};
