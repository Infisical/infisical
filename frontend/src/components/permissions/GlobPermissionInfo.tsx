import { useId, useState } from "react";
import picomatch from "picomatch";

import { Field, FieldDescription, FieldLabel, Input } from "../v3";

export const GlobPatternTooltip = () => (
  <div className="space-y-1.5 text-left text-xs">
    <p className="font-medium text-mineshaft-200">This field supports glob patterns:</p>
    <div className="text-mineshaft-300">
      <code className="text-yellow-500/80">*</code> matches a single path segment
      <br />
      <span className="text-mineshaft-400">
        user/* matches user/admin but not user/admin/service
      </span>
    </div>
    <div className="text-mineshaft-300">
      <code className="text-yellow-500/80">**</code> matches zero or more segments at any depth
      <br />
      <span className="text-mineshaft-400">
        user/** matches user/admin, user/admin/service, etc.
      </span>
    </div>
  </div>
);

export const BashGlobPatternTooltip = () => (
  <div className="space-y-1.5 text-left text-xs">
    <p className="font-medium text-mineshaft-200">This field supports glob patterns:</p>
    <p className="text-mineshaft-300">
      <code className="text-yellow-500/80">*</code> matches any characters
    </p>
    <p>
      <span className="text-mineshaft-400">
        user/* matches user/admin, user/admin/service, etc.
      </span>
    </p>
  </div>
);

export const GlobPermissionInfo = () => {
  const id = useId();
  const [pattern, setPattern] = useState("");
  const [text, setText] = useState("");

  const hasInput = Boolean(pattern && text);
  // Must stay in sync with the backend's $glob evaluation (backend/src/lib/casl/index.ts)
  const isMatch = hasInput && picomatch.isMatch(text, pattern, { strictSlashes: false });

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-2">
        <p>A glob pattern uses special wildcard characters to match resources or paths:</p>
        <ul className="list-disc space-y-0.5 pl-4 text-accent">
          <li>
            <code>*</code> — matches any characters except <code>/</code> (e.g., <code>dev-*</code>{" "}
            matches <code>dev-api</code>)
          </li>
          <li>
            <code>**</code> — matches across multiple levels, including <code>/</code> (e.g.,{" "}
            <code>/services/**</code>)
          </li>
          <li>
            <code>?</code> — matches exactly one character (e.g., <code>db-?</code>)
          </li>
          <li>
            <code>{"{a,b}"}</code> — matches either alternative
          </li>
        </ul>
        <p className="text-accent">
          A trailing <code>{"/*"}</code> matches a folder&apos;s direct children only, not the
          folder itself: <code>/app/*</code> does not match secrets directly in <code>/app</code>.
          Use <code>/app/**</code> to match a folder and everything under it.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-pattern`}>Glob Pattern</FieldLabel>
        <Input
          id={`${id}-pattern`}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="/app/**"
        />
        <FieldDescription>
          Examples: dev-*, /services/**, config-?, {"{dev,staging}"}-*
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-test`}>Test String</FieldLabel>
        <Input
          id={`${id}-test`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="/app/config"
        />
        {hasInput ? (
          <p className={isMatch ? "text-success" : "text-danger"}>
            {isMatch ? "Matches the pattern" : "Does not match the pattern"}
          </p>
        ) : (
          <FieldDescription>Type a value to test the pattern against</FieldDescription>
        )}
      </Field>
    </div>
  );
};
