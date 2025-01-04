import { useState } from "react";
import picomatch from "picomatch";

import { FormControl } from "../v2/FormControl";
import { Input } from "../v2/Input";

export const GlobPermissionInfo = () => {
  const [pattern, setPattern] = useState("");
  const [text, setText] = useState("");

  return (
    <div>
      <div className="mt-2">A glob pattern uses wildcards to match resources or paths.</div>
      <div>
        <FormControl label="Glob pattern" helperText="Examples: /{a,b}, DB_**">
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
