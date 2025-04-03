import { platform as platformPlugin } from "@tauri-apps/plugin-os";

const platform = platformPlugin();

export interface Key {
  symbol: string;
  macos?: string;
}

// https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values

export const modifierKeycodeMap: Record<string, Key> = {
  Shift: {
    symbol: "shift",
  },
  Control: {
    symbol: "ctrl",
    macos: "control",
  },
  Alt: {
    symbol: "alt",
    macos: "option",
  },
  Meta: {
    symbol: "win",
    macos: "command",
  },
};

export const normalKeycodeMap: Record<string, Key> = {
  Escape: { symbol: "esc" },
  F1: { symbol: "F1" },
  F2: { symbol: "F2" },
  F3: { symbol: "F3" },
  F4: { symbol: "F4" },
  F5: { symbol: "F5" },
  F6: { symbol: "F6" },
  F7: { symbol: "F7" },
  F8: { symbol: "F8" },
  F9: { symbol: "F9" },
  F10: { symbol: "F10" },
  F11: { symbol: "F11" },
  F12: { symbol: "F12" },
  // Second row
  Backquote: { symbol: "`" },
  Digit1: { symbol: "1" },
  Digit2: { symbol: "2" },
  Digit3: { symbol: "3" },
  Digit4: { symbol: "4" },
  Digit5: { symbol: "5" },
  Digit6: { symbol: "6" },
  Digit7: { symbol: "7" },
  Digit8: { symbol: "8" },
  Digit9: { symbol: "9" },
  Digit0: { symbol: "0" },
  Minus: { symbol: "-" },
  Equal: { symbol: "=" },
  Backspace: { symbol: "backspace", macos: "delete" },
  // third row
  Tab: { symbol: "Tab" },
  KeyQ: { symbol: "q" },
  KeyW: { symbol: "w" },
  KeyE: { symbol: "e" },
  KeyR: { symbol: "r" },
  KeyT: { symbol: "t" },
  KeyY: { symbol: "y" },
  KeyU: { symbol: "u" },
  KeyI: { symbol: "i" },
  KeyO: { symbol: "o" },
  KeyP: { symbol: "p" },
  BracketLeft: { symbol: "[" },
  BracketRight: { symbol: "]" },
  Backslash: { symbol: "\\" },
  // forth row
  KeyA: { symbol: "a" },
  KeyS: { symbol: "s" },
  KeyD: { symbol: "d" },
  KeyF: { symbol: "f" },
  KeyG: { symbol: "g" },
  KeyH: { symbol: "h" },
  KeyJ: { symbol: "j" },
  KeyK: { symbol: "k" },
  KeyL: { symbol: "l" },
  Semicolon: { symbol: ";" },
  Quote: { symbol: "'" },
  Enter: { symbol: "enter", macos: "return" },
  CapsLock: { symbol: "capslock" },
  // fifth row
  KeyZ: { symbol: "z" },
  KeyX: { symbol: "x" },
  KeyC: { symbol: "c" },
  KeyV: { symbol: "v" },
  KeyB: { symbol: "b" },
  KeyN: { symbol: "n" },
  KeyM: { symbol: "m" },
  Comma: { symbol: "," },
  Period: { symbol: "." },
  Slash: { symbol: "/" },
  // six row
  Space: { symbol: "space" },
  // arrow keys
  ArrowUp: { symbol: "up" },
  ArrowDown: { symbol: "down" },
  ArrowLeft: { symbol: "left" },
  ArrowRight: { symbol: "right" },
};

export const keycodeToDisplay = (code: string) => {
  if (
    code.includes("Meta") ||
    code.includes("Control") ||
    code.includes("Alt") ||
    code.includes("Shift")
  ) {
    code = code.replace("Left", "").replace("Right", "");
  }
  if (platform === "macos") {
    return keys[code]?.macos ?? keys[code]?.symbol ?? code;
  }
  return keys[code]?.symbol ?? code;
};

export const codeToGlobalShortcutKey = (code: string) => {
  if (code.includes("Meta")) return "Command";

  return keycodeToDisplay(code);
};

export const shortcutToDisplay = (shortcuts: string[] | undefined) => {
  if (!shortcuts || shortcuts.length <= 0) return "Not set";
  return shortcuts.map(keycodeToDisplay).join(" + ");
};

export const getPreferredModifierKey = () => {
  return platform === "macos" ? "Meta" : "Control";
};

export const keys = { ...modifierKeycodeMap, ...normalKeycodeMap };
