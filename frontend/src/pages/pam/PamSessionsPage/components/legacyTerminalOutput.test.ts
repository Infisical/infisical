import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderLegacyTerminalOutput } from "./legacyTerminalOutput";

const ESC = "\u001b";
const BEL = "\u0007";

// Default bash PS1: an OSC title whose payload holds '@', ':', ' ' and '/'.
const prompt = (cwd: string) =>
  `${ESC}]0;user@host: ${cwd}${BEL}${ESC}[01;32muser@host${ESC}[00m:${ESC}[01;34m${cwd}${ESC}[00m$ `;

describe("renderLegacyTerminalOutput", () => {
  it("applies bash's history-recall redraws instead of concatenating them", () => {
    // Bytes emitted by bash/readline for: type three commands, press Up three times, Enter.
    const raw = `${prompt("~")}echo three\b\b\b\b${ESC}[2Pwo\b\b\bone\r\n`;
    assert.equal(renderLegacyTerminalOutput(raw), "user@host:~$ echo one");
  });

  it("handles recall that erases to end of line", () => {
    const raw = `${prompt("~")}ls -la\r${prompt("~")}pwd${ESC}[K\r\n`;
    assert.equal(renderLegacyTerminalOutput(raw), "user@host:~$ pwd");
  });

  it("strips prompt decorations and titles", () => {
    assert.equal(renderLegacyTerminalOutput(`${prompt("~")}ls\r\n`), "user@host:~$ ls");
    assert.equal(renderLegacyTerminalOutput(`${ESC}]0;user@host: /var${ESC}\\done\n`), "done");
    assert.equal(renderLegacyTerminalOutput(`${ESC}(B${ESC}[m% ls\n`), "% ls");
  });

  it("recovers from an unterminated OSC string", () => {
    assert.equal(
      renderLegacyTerminalOutput(`${ESC}]0;no terminator${ESC}[0mrecovered\n`),
      "recovered"
    );
  });

  it("applies backspace, erase and insert edits", () => {
    assert.equal(renderLegacyTerminalOutput("lsx\b \bs\n"), "lss");
    assert.equal(renderLegacyTerminalOutput(`abcdef${ESC}[3D${ESC}[2P\n`), "abcf");
    assert.equal(renderLegacyTerminalOutput(`ab${ESC}[4Ccd\n`), "ab    cd");
    assert.equal(renderLegacyTerminalOutput(`ac${ESC}[D${ESC}[@b\n`), "abc");
    assert.equal(renderLegacyTerminalOutput(`stale${ESC}[2Jfresh\n`), "fresh");
  });

  it("keeps separate lines, tabs and multibyte text", () => {
    assert.equal(renderLegacyTerminalOutput("a\tb\n\r\n\r\nc\n"), "a       b\nc");
    assert.equal(renderLegacyTerminalOutput(`one${ESC}[2Btwo\n`), "one\ntwo");
    assert.equal(renderLegacyTerminalOutput("café ✓\n"), "café ✓");
    assert.equal(renderLegacyTerminalOutput(`${ESC}[?2004hcmd${ESC}[?2004l\r\n`), "cmd");
  });

  it("bounds pathological cursor moves", () => {
    const out = renderLegacyTerminalOutput(`x${ESC}[999999999999C${ESC}[999999999999@y\n`);
    assert.ok(out.length <= 8192 + 1);
    assert.ok(out.startsWith("x"));
  });
});
