export const HomeHero = ({ title, description, children }) => (
  <div className="ifx-home__hero">
    {/* <p className="ifx-home__eyebrow">{eyebrow}</p> */}
    <h1 className="ifx-home__title">{title}</h1>
    <div className="ifx-home__lede">{description}</div>
    <div className="ifx-home__actions">{children}</div>
  </div>
);

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

export const HomeCard = ({ title, href, icon, product, wide, children }) => {
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

  return (
    <a
      href={href}
      className={`ifx-card${product ? ` ifx-card--${product}` : ""}${
        wide ? " ifx-card--wide" : ""
      }`}
    >
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
      <span className="ifx-card__title">
        {title}
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
      </span>
      <div className="ifx-card__body">{children}</div>
    </a>
  );
};
