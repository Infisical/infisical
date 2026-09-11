import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getKeyValue } from "./parseEnvVar";

describe("getKeyValue", () => {
  const delimiters = ["=", ":"];

  it("splits a key and value on the first delimiter", () => {
    assert.deepEqual(getKeyValue("KEY=value", delimiters), { key: "KEY", value: "value" });
    assert.deepEqual(getKeyValue("TOKEN: abc", delimiters), { key: "TOKEN", value: "abc" });
  });

  it("keeps only the first delimiter as the split point", () => {
    assert.deepEqual(getKeyValue("A=B=C", delimiters), { key: "A", value: "B=C" });
  });

  it("returns an empty value when the delimiter is at the end", () => {
    // A trailing delimiter (e.g. an empty-valued env var) must still strip the
    // delimiter from the key rather than keeping it (previously "KEY=").
    assert.deepEqual(getKeyValue("KEY=", delimiters), { key: "KEY", value: "" });
    assert.deepEqual(getKeyValue("TOKEN:", delimiters), { key: "TOKEN", value: "" });
  });

  it("treats content with no delimiter as the key", () => {
    assert.deepEqual(getKeyValue("KEY", delimiters), { key: "KEY", value: "" });
  });

  it("returns empty key and value for empty content", () => {
    assert.deepEqual(getKeyValue("", delimiters), { key: "", value: "" });
  });
});
