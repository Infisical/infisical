// Non-printable keys CDP needs mapped to a code/windowsVirtualKeyCode pair.
// Printable characters (letters, digits, punctuation) are handled generically
// via KeyboardEvent.key + the "text" field instead of this table.
const SPECIAL_KEYS: Record<string, { code: string; windowsVirtualKeyCode: number }> = {
  Backspace: { code: "Backspace", windowsVirtualKeyCode: 8 },
  Tab: { code: "Tab", windowsVirtualKeyCode: 9 },
  Enter: { code: "Enter", windowsVirtualKeyCode: 13 },
  Escape: { code: "Escape", windowsVirtualKeyCode: 27 },
  " ": { code: "Space", windowsVirtualKeyCode: 32 },
  ArrowLeft: { code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ArrowUp: { code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowRight: { code: "ArrowRight", windowsVirtualKeyCode: 39 },
  ArrowDown: { code: "ArrowDown", windowsVirtualKeyCode: 40 },
  Delete: { code: "Delete", windowsVirtualKeyCode: 46 },
  Home: { code: "Home", windowsVirtualKeyCode: 36 },
  End: { code: "End", windowsVirtualKeyCode: 35 }
};

export type TCdpKeyFields = {
  key: string;
  code: string;
  windowsVirtualKeyCode?: number;
  text?: string;
};

// Maps a DOM KeyboardEvent.key to the fields CDP's Input.dispatchKeyEvent
// expects. Covers printable characters and the common navigation/editing
// keys; full modifier/IME correctness is out of scope for now.
export const mapKeyToCdp = (key: string): TCdpKeyFields => {
  const special = SPECIAL_KEYS[key];
  if (special) {
    return { key, code: special.code, windowsVirtualKeyCode: special.windowsVirtualKeyCode };
  }
  if (key.length === 1) {
    return { key, code: `Key${key.toUpperCase()}`, text: key };
  }
  return { key, code: key };
};
