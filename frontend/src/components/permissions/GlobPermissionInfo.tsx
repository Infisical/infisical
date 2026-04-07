import { useState } from "react";
import picomatch from "picomatch";

import { FormControl } from "../v2/FormControl";
import { Input } from "../v2/Input";

export const GlobPatternTooltip = () => (
  <div className="space-y-1.5 text-left text-xs">
    <p className="text-sm font-medium text-mineshaft-200">This field supports glob patterns:</p>
    <ul className="list-disc pl-3.5 text-mineshaft-300">
      <li>
        <code className="text-yellow-500/80">*</code> matches a single path segment
        <br />
        <span className="text-mineshaft-400">
          user/* matches user/admin but not user/admin/service
        </span>
      </li>
      <li>
        <code className="text-yellow-500/80">**</code> matches zero or more segments at any depth
        <br />
        <span className="text-mineshaft-400">
          user/** matches user/admin, user/admin/service, etc.
        </span>
      </li>
    </ul>
    <p className="text-mineshaft-400">
      We highly recommend using hardcoded values whenever possible.
    </p>
  </div>
);

export const BashGlobPatternTooltip = () => (
  <div className="space-y-1.5 text-left text-xs">
    <p className="text-sm font-medium text-mineshaft-200">This field supports glob patterns:</p>
    <ul className="list-disc pl-3.5 text-mineshaft-300">
      <li>
        <code className="text-yellow-500/80">*</code> matches any characters (including{" "}
        <code className="text-yellow-500/80">/</code>)
        <br />
        <span className="text-mineshaft-400">
          user/* matches user/admin, user/admin/service, etc.
        </span>
      </li>
    </ul>
    <p className="text-mineshaft-400">
      We highly recommend using hardcoded values whenever possible.
    </p>
  </div>
);

export const GlobPermissionInfo = () => {
  const [pattern, setPattern] = useState("");
  const [text, setText] = useState("");

  return (
    <div>
      <div className="mt-2 space-y-1">
        <p>A glob pattern uses special wildcard characters to match resources or paths:</p>
        <ul className="list-disc pl-4 text-xs text-mineshaft-300">
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
      </div>
      <div>
        <FormControl
          label="Glob pattern"
          helperText="Examples: dev-*, /services/**, config-?, {dev,staging}-*"
        >
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} />
        </FormControl>
      </div>
      <div>
        <FormControl
          label="Test string"
          helperText="Type a value to test glob match"
          isError={
            pattern && text ? !picomatch.isMatch(text, pattern, { strictSlashes: false }) : false
          }
          errorText="Invalid"
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} />
        </FormControl>
      </div>
    </div>
  );
};
