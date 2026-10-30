const MAX_LINE_LENGTH = 8192;
const TAB_WIDTH = 8;

const ESC = "\u001b";
const BEL = "\u0007";
const CSI_8BIT = "\u009b";

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

const isStringIntroducer = (c: string) =>
  c === "]" || c === "P" || c === "X" || c === "^" || c === "_";

// Skips an OSC/DCS/SOS/PM/APC payload, returning the index after its terminator
const skipString = (chars: string[], start: number): number => {
  let i = start;
  while (i < chars.length) {
    if (chars[i] === BEL) return i + 1;
    if (chars[i] === ESC) {
      // ESC \ is the string terminator; any other ESC starts a new sequence
      return chars[i + 1] === "\\" ? i + 2 : i;
    }
    i += 1;
  }
  return i;
};

/**
 * Renders a raw terminal byte stream into the lines a terminal would have shown.
 * Line editing (backspace, carriage return, erase/delete/insert characters, cursor
 * moves within the line) is applied rather than stripped, so a shell redrawing its
 * input line, e.g. on history recall, yields the final line instead of every
 * intermediate one concatenated together.
 */
class LineRenderer {
  private lines: string[] = [];

  private line: string[] = [];

  private cursor = 0;

  feed(text: string): string[] {
    const chars = Array.from(text);
    let i = 0;
    while (i < chars.length) {
      const c = chars[i];
      if (c === ESC) {
        i = this.escape(chars, i + 1);
      } else if (c === CSI_8BIT) {
        i = this.csi(chars, i + 1);
      } else {
        this.print(c);
        i += 1;
      }
    }
    return this.lines;
  }

  flush(): string[] {
    this.commit();
    return this.lines;
  }

  private escape(chars: string[], start: number): number {
    if (start >= chars.length) return start;
    const c = chars[start];
    if (c === "[") return this.csi(chars, start + 1);
    if (isStringIntroducer(c)) return skipString(chars, start + 1);
    // ESC + intermediate (0x20-0x2F) takes one more final byte, e.g. charset designators
    if (c >= " " && c <= "/") return Math.min(start + 2, chars.length);
    return start + 1;
  }

  private csi(chars: string[], start: number): number {
    let i = start;
    let params = "";
    while (i < chars.length && chars[i] >= "0" && chars[i] <= "?") {
      params += chars[i];
      i += 1;
    }
    while (i < chars.length && chars[i] >= " " && chars[i] <= "/") {
      i += 1;
    }
    if (i >= chars.length) return i;
    const final = chars[i];
    if (final >= "@" && final <= "~" && !/[<=>?]/.test(params)) {
      this.dispatchCsi(final, params);
    }
    return i + 1;
  }

  private dispatchCsi(command: string, params: string) {
    const first = params.split(";")[0].split(":")[0];
    const param = (fallback: number) => {
      const n = first === "" ? fallback : Number(first);
      return clamp(Number.isFinite(n) ? n : fallback, 0, MAX_LINE_LENGTH);
    };

    switch (command) {
      case "K":
      case "J":
        switch (param(0)) {
          case 1:
            this.blank(0, this.cursor);
            break;
          case 2:
          case 3:
            this.line = [];
            this.cursor = 0;
            break;
          default:
            this.line.length = Math.min(this.cursor, this.line.length);
        }
        break;
      case "C":
        this.cursor = clamp(this.cursor + param(1), 0, MAX_LINE_LENGTH);
        break;
      case "D":
        this.cursor = clamp(this.cursor - param(1), 0, MAX_LINE_LENGTH);
        break;
      case "G":
      case "`":
        this.cursor = clamp(param(1) - 1, 0, MAX_LINE_LENGTH);
        break;
      case "P":
        this.deleteChars(param(1));
        break;
      case "@":
        this.insertBlanks(param(1));
        break;
      case "X":
        this.blank(this.cursor, this.cursor + param(1));
        break;
      case "A":
      case "B":
      case "E":
      case "F":
      case "H":
      case "f":
      case "d":
        // vertical and absolute moves; there are no rows to move between
        this.commit();
        break;
      default:
    }
  }

  private print(c: string) {
    switch (c) {
      case "\n":
      case "\u000b":
      case "\u000c":
        this.commit();
        return;
      case "\r":
        this.cursor = 0;
        return;
      case "\b":
        this.cursor = Math.max(this.cursor - 1, 0);
        return;
      case "\t": {
        const stop = (Math.floor(this.cursor / TAB_WIDTH) + 1) * TAB_WIDTH;
        while (this.cursor < stop) this.write(" ");
        return;
      }
      default:
    }
    if (c < " " || c === "\u007f") return;
    this.write(c);
  }

  private write(c: string) {
    if (this.cursor >= MAX_LINE_LENGTH) this.commit();
    this.padTo(this.cursor);
    if (this.cursor < this.line.length) {
      this.line[this.cursor] = c;
    } else {
      this.line.push(c);
    }
    this.cursor += 1;
  }

  private commit() {
    const text = this.line.join("").trimEnd();
    if (text) this.lines.push(text);
    this.line = [];
    this.cursor = 0;
  }

  private padTo(col: number) {
    while (this.line.length < col) this.line.push(" ");
  }

  private blank(start: number, end: number) {
    for (let i = start; i < Math.min(end, this.line.length); i += 1) {
      this.line[i] = " ";
    }
  }

  private deleteChars(n: number) {
    if (n <= 0 || this.cursor >= this.line.length) return;
    this.line.splice(this.cursor, n);
  }

  private insertBlanks(count: number) {
    this.padTo(this.cursor);
    const n = Math.min(count, MAX_LINE_LENGTH - this.line.length);
    if (n <= 0) return;
    this.line.splice(this.cursor, 0, ...new Array<string>(n).fill(" "));
  }
}

export const renderLegacyTerminalOutput = (raw: string): string => {
  const renderer = new LineRenderer();
  renderer.feed(raw);
  return renderer.flush().join("\n").trim();
};
