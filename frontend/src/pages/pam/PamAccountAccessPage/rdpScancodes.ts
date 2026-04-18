// Minimal KeyboardEvent.code -> PS/2 Set 1 scancode map.
//
// IronRDP's DeviceEvent.keyPressed/keyReleased takes a scancode. Extended
// keys (arrows, keypad nav, right-side modifiers) must have 0xE000 ORed in
// so the WASM sets KBDFLAGS_EXTENDED in the FastPath event.
//
// Not exhaustive — we cover the common keys a user types in a Windows shell
// (letters, digits, punctuation, nav, modifiers). Missing keys simply don't
// forward. Good enough for POC; revisit for full parity later.

const SCANCODES: Record<string, number> = {
  // Letters
  KeyA: 0x1e,
  KeyB: 0x30,
  KeyC: 0x2e,
  KeyD: 0x20,
  KeyE: 0x12,
  KeyF: 0x21,
  KeyG: 0x22,
  KeyH: 0x23,
  KeyI: 0x17,
  KeyJ: 0x24,
  KeyK: 0x25,
  KeyL: 0x26,
  KeyM: 0x32,
  KeyN: 0x31,
  KeyO: 0x18,
  KeyP: 0x19,
  KeyQ: 0x10,
  KeyR: 0x13,
  KeyS: 0x1f,
  KeyT: 0x14,
  KeyU: 0x16,
  KeyV: 0x2f,
  KeyW: 0x11,
  KeyX: 0x2d,
  KeyY: 0x15,
  KeyZ: 0x2c,
  // Digit row
  Digit1: 0x02,
  Digit2: 0x03,
  Digit3: 0x04,
  Digit4: 0x05,
  Digit5: 0x06,
  Digit6: 0x07,
  Digit7: 0x08,
  Digit8: 0x09,
  Digit9: 0x0a,
  Digit0: 0x0b,
  Minus: 0x0c,
  Equal: 0x0d,
  // Punctuation
  BracketLeft: 0x1a,
  BracketRight: 0x1b,
  Semicolon: 0x27,
  Quote: 0x28,
  Backquote: 0x29,
  Backslash: 0x2b,
  Comma: 0x33,
  Period: 0x34,
  Slash: 0x35,
  // Editing
  Backspace: 0x0e,
  Tab: 0x0f,
  Enter: 0x1c,
  Space: 0x39,
  Escape: 0x01,
  CapsLock: 0x3a,
  // Modifiers (left)
  ShiftLeft: 0x2a,
  ControlLeft: 0x1d,
  AltLeft: 0x38,
  // Modifiers (right) — extended
  ShiftRight: 0x36,
  ControlRight: 0xe01d,
  AltRight: 0xe038,
  MetaLeft: 0xe05b,
  MetaRight: 0xe05c,
  // Function row
  F1: 0x3b,
  F2: 0x3c,
  F3: 0x3d,
  F4: 0x3e,
  F5: 0x3f,
  F6: 0x40,
  F7: 0x41,
  F8: 0x42,
  F9: 0x43,
  F10: 0x44,
  F11: 0x57,
  F12: 0x58,
  // Navigation — all extended
  Insert: 0xe052,
  Delete: 0xe053,
  Home: 0xe047,
  End: 0xe04f,
  PageUp: 0xe049,
  PageDown: 0xe051,
  ArrowUp: 0xe048,
  ArrowDown: 0xe050,
  ArrowLeft: 0xe04b,
  ArrowRight: 0xe04d,
  // Numpad
  NumLock: 0x45,
  NumpadDivide: 0xe035,
  NumpadMultiply: 0x37,
  NumpadSubtract: 0x4a,
  NumpadAdd: 0x4e,
  NumpadEnter: 0xe01c,
  Numpad0: 0x52,
  Numpad1: 0x4f,
  Numpad2: 0x50,
  Numpad3: 0x51,
  Numpad4: 0x4b,
  Numpad5: 0x4c,
  Numpad6: 0x4d,
  Numpad7: 0x47,
  Numpad8: 0x48,
  Numpad9: 0x49,
  NumpadDecimal: 0x53
};

export const codeToScancode = (code: string): number | undefined => SCANCODES[code];
