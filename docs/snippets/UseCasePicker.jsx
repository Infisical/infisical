import React, { useEffect, useMemo, useRef, useState } from "react";

// A multi-select "{prefix} ___ with {product}" picker, plus a <UseCase> wrapper that shows its
// children only for the picked use cases. Pass `prefix` for wording that has to name the product
// before the dropdown, such as "I want my AWS connection to work for", and leave `product` out. The page passes the options in, so any guide whose
// steps vary by integration can reuse it. See snippets/app-connections/aws/use-cases.jsx for the
// data shape and integrations/app-connections/aws.mdx for a page that uses it.
//
// Mintlify evaluates each exported component in isolation, so module-scope constants are out of
// scope at render time. Both components below declare their own copies of the shared values.

export const UseCasePicker = ({
  product,
  prefix = "I want to set up",
  groups = [],
  param = "use",
  noun = "an integration",
  id = "use-case-picker"
}) => {
  const SELECTION_EVENT = "use-case-picker-change";

  const options = groups.flatMap((group) => group.options);
  const knownIds = new Set(options.map((option) => option.id));

  const [selected, setSelected] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get(param);
      const requested = raw
        ? raw
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : [];
      const known = requested.filter((id) => knownIds.has(id));
      setSelected(known);

      // A stale link can carry ids that no longer exist. <UseCase> blocks don't know the option
      // list, so they would treat those ids as a selection and hide everything. Rewrite the URL to
      // the known ids and announce it, so every block sees the same selection the picker does.
      if (known.length !== requested.length) {
        if (known.length === 0) params.delete(param);
        else params.set(param, known.join(","));
        const query = params.toString().replace(/%2C/g, ",");
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
        );
        window.dispatchEvent(new Event(SELECTION_EVENT));
      }
    };
    sync();
    window.addEventListener(SELECTION_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(SELECTION_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, [param]);

  // Mintlify builds "On this page" at build time, so it still lists headings that a <UseCase> has
  // hidden. Hide each entry whose heading isn't on the page. If Mintlify changes the markup, the
  // entries simply stay visible.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.querySelectorAll('#table-of-contents-content a[href^="#"]').forEach((link) => {
        const id = decodeURIComponent(link.getAttribute("href").slice(1));
        const item = link.closest("li") || link;
        item.style.display = document.getElementById(id) ? "" : "none";
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setIsOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        if (buttonRef.current) buttonRef.current.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const write = (ids) => {
    const params = new URLSearchParams(window.location.search);
    if (ids.length === 0) params.delete(param);
    else params.set(param, ids.join(","));
    // Keep the commas readable in a shared link; URLSearchParams would encode them as %2C.
    const query = params.toString().replace(/%2C/g, ",");
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
    window.dispatchEvent(new Event(SELECTION_EVENT));
  };

  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    write(options.map((option) => option.id).filter((value) => next.includes(value)));
  };

  const chipLabel = (() => {
    if (selected.length === 0) return noun;
    const first = options.find((option) => option.id === selected[0]);
    if (selected.length === 1) return first.label;
    return `${first.label} + ${selected.length - 1} more`;
  })();

  return (
    <div ref={rootRef} id={id} className="ifx-avqs">
      <p className="ifx-avqs__sentence">
        {prefix}{" "}
        <span className="ifx-avqs__slot">
          <button
            ref={buttonRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            className={selected.length ? "ifx-avqs__chip ifx-avqs__chip--filled" : "ifx-avqs__chip"}
            onClick={() => setIsOpen(!isOpen)}
          >
            <span>{chipLabel}</span>
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
          </button>
          {isOpen && (
            <div className="ifx-avqs__menu ifx-ucp__menu" role="dialog" aria-label="Choose integrations">
              {groups.map((group) => (
                <fieldset key={group.label} className="ifx-ucp__group">
                  <legend className="ifx-ucp__legend">{group.label}</legend>
                  {group.options.map((option) => (
                    <label key={option.id} className="ifx-ucp__option">
                      <input
                        type="checkbox"
                        className="ifx-ucp__checkbox"
                        checked={selected.includes(option.id)}
                        onChange={() => toggle(option.id)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              {selected.length > 0 && (
                <button type="button" className="ifx-avqs__clear" onClick={() => write([])}>
                  Clear selection
                </button>
              )}
            </div>
          )}
        </span>
        {product ? ` with ${product}` : ""}
      </p>
      <p className="ifx-avqs__hint">
        {selected.length ? (
          <>
            The steps below match your choice.{" "}
            <button type="button" className="ifx-avqs__reset" onClick={() => write([])}>
              Reset
            </button>
          </>
        ) : (
          "Pick one or more to view the steps they need."
        )}
      </p>
    </div>
  );
};

// Renders its children when any of the comma-separated ids in `use` is picked. When nothing is
// picked it renders them too, so the page reads as the full guide by default, unless
// `hideWhenEmpty` is set: use that for content that only makes sense next to a filtered result.
// `param` must match the picker's.
export const UseCase = ({ use, param = "use", hideWhenEmpty = false, children }) => {
  const SELECTION_EVENT = "use-case-picker-change";

  const [selected, setSelected] = useState([]);

  useEffect(() => {
    const sync = () => {
      const raw = new URLSearchParams(window.location.search).get(param);
      setSelected(
        raw
          ? raw
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : []
      );
    };
    sync();
    window.addEventListener(SELECTION_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(SELECTION_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, [param]);

  const isVisible = useMemo(() => {
    if (selected.length === 0) return !hideWhenEmpty;
    const wanted = String(use || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return wanted.some((id) => selected.includes(id));
  }, [selected, use, hideWhenEmpty]);

  if (!isVisible) return null;
  return <>{children}</>;
};
