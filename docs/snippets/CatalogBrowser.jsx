// Searchable, filterable card list shared by the integration catalog pages. Each page imports
// this component and its data from /snippets/catalogs/, because a snippet cannot import another
// snippet. Styling lives in style.css under .ifx-catalog.
export const CatalogBrowser = ({
  id = "catalog",
  items = [],
  categories = [],
  filterKey = "category",
  noun = "item",
  nounPlural = `${noun}s`,
  badges = (item) => [{ label: item[filterKey] }],
  urlParam,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState("All");
  const listRef = useRef(null);

  useEffect(() => {
    if (!urlParam) return;
    const requested = new URLSearchParams(window.location.search).get(urlParam);
    if (requested && categories.includes(requested)) setSelected(requested);
  }, []);

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    [items],
  );

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sorted.filter((item) => {
      if (selected !== "All" && item[filterKey] !== selected) return false;
      if (!term) return true;
      return [item.name, item.description, item[filterKey], ...badges(item).map((b) => b.label)]
        .some((value) => value && value.toLowerCase().includes(term));
    });
  }, [sorted, searchTerm, selected]);

  // Mintlify usually prefixes root-relative hrefs with the /docs base path, but production has
  // served snippets without it, which breaks every card link. Add it only when it is missing.
  useEffect(() => {
    const path = window.location.pathname;
    const base = path === "/docs" || path.startsWith("/docs/") ? "/docs" : "";
    if (!base || !listRef.current) return;
    listRef.current.querySelectorAll("a[href^='/']").forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href.startsWith(`${base}/`)) anchor.setAttribute("href", `${base}${href}`);
    });
  }, [filtered]);

  const count = filtered.length;

  return (
    <div className="ifx-catalog">
      <div className="ifx-catalog__search">
        <svg aria-hidden="true" className="ifx-catalog__search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
        <label className="sr-only" htmlFor={`${id}-search`}>
          Search {nounPlural}
        </label>
        <input
          id={`${id}-search`}
          type="search"
          className="ifx-catalog__input"
          placeholder={`Search ${nounPlural}...`}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <div className="ifx-catalog__filters" role="group" aria-label={`Filter ${nounPlural}`}>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className="ifx-catalog__filter"
            aria-pressed={selected === category}
            onClick={() => setSelected(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <p className="ifx-catalog__count" aria-live="polite">
        {count} {count === 1 ? noun : nounPlural} found
        {selected !== "All" && ` in ${selected}`}
        {searchTerm.trim() && ` for "${searchTerm.trim()}"`}
      </p>

      {count > 0 ? (
        <div ref={listRef} className="ifx-catalog__grid">
          {filtered.map((item) => (
            <a key={item.path} href={item.path} className="ifx-catalog__card">
              <h3 className="ifx-catalog__title">{item.name}</h3>
              <div className="ifx-catalog__badges">
                {badges(item).map((badge) => (
                  <span key={badge.label} className={`ifx-tag ifx-tag--${badge.tone || "neutral"}`}>
                    {badge.label}
                  </span>
                ))}
              </div>
              <p className="ifx-catalog__desc">{item.description}</p>
            </a>
          ))}
        </div>
      ) : (
        <div className="ifx-catalog__empty">
          No {nounPlural} match your search and filters.
        </div>
      )}
    </div>
  );
};
