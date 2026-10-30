import React, { useEffect, useState } from "react";

// <CombinedIamPolicy> merges the IAM policies of every option picked in the <UseCasePicker> into
// one document, so the reader pastes a single policy. The policies come from the `policy` field of
// the picker's options (see snippets/app-connections/aws/use-cases.jsx). It renders through
// Mintlify's <CodeBlock>, which keeps the highlighting and copy button of a normal code block.
//
// Mintlify evaluates each exported component in isolation, so module-scope helpers are out of
// scope at render time.

export const CombinedIamPolicy = ({ groups = [], param = "use" }) => {
  const SELECTION_EVENT = "use-case-picker-change";

  const options = groups.flatMap((group) => group.options);
  const [selected, setSelected] = useState([]);
  const [optionalIds, setOptionalIds] = useState([]);

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

  const picked = options.filter((option) => selected.includes(option.id));

  if (picked.length === 0) {
    return (
      <p className="ifx-iamp__empty">
        Pick the integrations you'll use in the <a href="#use-case-picker">selector at the top of the page</a>,
        and a single policy that covers all of them appears here.
      </p>
    );
  }

  const withPolicy = picked.filter((option) => option.policy);
  const withOptional = withPolicy.filter((option) => option.policy.optional);

  if (withPolicy.length === 0) {
    return (
      <p className="ifx-iamp__empty">
        The integrations you picked get their permissions somewhere else. The notes after these steps
        say where.
      </p>
    );
  }

  // IAM rejects a policy whose statements share a Sid, so a repeat gets the option's id appended.
  const usedSids = new Set();
  const statements = withPolicy.flatMap((option) => {
    const extra = optionalIds.includes(option.id) && option.policy.optional ? option.policy.optional.statements : [];
    return [...option.policy.statements, ...extra].map((statement) => {
      if (!statement.Sid) return statement;
      let sid = statement.Sid;
      if (usedSids.has(sid)) sid = `${sid}${option.id.replace(/[^A-Za-z0-9]/g, "")}`;
      usedSids.add(sid);
      return sid === statement.Sid ? statement : { ...statement, Sid: sid };
    });
  });

  const toggleOptional = (id) =>
    setOptionalIds(optionalIds.includes(id) ? optionalIds.filter((value) => value !== id) : [...optionalIds, id]);

  return (
    <div className="ifx-iamp">
      {withOptional.length > 0 && (
        <div className="ifx-iamp__options">
          {withOptional.map((option) => (
            <label key={option.id} className="ifx-iamp__option">
              <input
                type="checkbox"
                className="ifx-ucp__checkbox"
                checked={optionalIds.includes(option.id)}
                onChange={() => toggleOptional(option.id)}
              />
              <span>
                {option.label} {option.policy.optional.label}
              </span>
            </label>
          ))}
        </div>
      )}
      {/* Mintlify's runtime reads `expandable` as the string it gets from MDX code fence meta
          (`expandable.toLowerCase() === "true"`), so a boolean here throws and blanks the component. */}
      {/* eslint-disable-next-line no-undef */}
      <CodeBlock language="json" expandable="true">
        {JSON.stringify({ Version: "2012-10-17", Statement: statements }, null, 2)}
      </CodeBlock>
    </div>
  );
};
