import { useColorScheme } from "react-native";

const light = {
  surface: "#fbfbf9",
  inset: "#fbfbf9",
  paper: "#f4f3ee",
  tint: "#f1f0ea",
  rowDone: "#f6f5f1",
  select: "#eeede6",
  lineSoft: "#e6e5e0",
  line: "#d8d8d4",
  control: "#b0b0a9",
  faint: "#8e9291",
  muted: "#565654",
  text2: "#2f3234",
  ink: "#010101",
  onInk: "#ffffff",
  accent: "#e3f047",
  accent2: "#d3df29",
  onAccent: "#010101",
  accentWash: "#f7fbc9",
  accentLine: "#dede88",
  accentFg: "#010101",
  mark: "#010101",
  ok: "#2b5945",
  okBg: "#e2eae5",
  okLine: "#c7d6cd",
  warn: "#7a5300",
  warnBg: "#f2e6c8",
  warnLine: "#e3d2a4",
  bad: "#c0231b",
  badBg: "#f7deda",
  badWash: "#faeeec",
  badLine: "#edc3bd",
  info: "#1f4e79",
  infoBg: "#dfe7ef",
  infoLine: "#c3d1df",
  hover: "rgba(1, 1, 1, 0.06)",
  press: "rgba(1, 1, 1, 0.10)",
  scrim: "rgba(1, 1, 1, 0.38)"
};

const dark: typeof light = {
  surface: "#111111",
  inset: "#0b0b0b",
  paper: "#161616",
  tint: "#1c1c1c",
  rowDone: "#101010",
  select: "#262626",
  lineSoft: "#1e2022",
  line: "#2f3234",
  control: "#37393c",
  faint: "#8e9291",
  muted: "#b0b0a9",
  text2: "#d8d8d4",
  ink: "#f1f0ea",
  onInk: "#010101",
  accent: "#e3f047",
  accent2: "#d1de23",
  onAccent: "#010101",
  accentWash: "#1a1c0d",
  accentLine: "#3a401c",
  accentFg: "#e3f047",
  mark: "#e3f047",
  ok: "#8fc7a4",
  okBg: "#14231b",
  okLine: "#25402f",
  warn: "#e8c26a",
  warnBg: "#2b2210",
  warnLine: "#463819",
  bad: "#ff5a4f",
  badBg: "#331311",
  badWash: "#1d0e0d",
  badLine: "#5a221e",
  info: "#8fb4de",
  infoBg: "#121e2b",
  infoLine: "#243a52",
  hover: "rgba(241, 240, 234, 0.12)",
  press: "rgba(241, 240, 234, 0.18)",
  scrim: "rgba(0, 0, 0, 0.62)"
};

export type Palette = typeof light;

export const font = {
  sans: "Archivo_400Regular",
  sansMedium: "Archivo_500Medium",
  sansSemiBold: "Archivo_600SemiBold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium"
};

export const type = {
  titleLg: { fontFamily: font.sansMedium, fontSize: 28, lineHeight: 32, letterSpacing: -0.7 },
  title: { fontFamily: font.sansMedium, fontSize: 18, lineHeight: 26, letterSpacing: -0.36 },
  titleSm: { fontFamily: font.sansSemiBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.sans, fontSize: 15, lineHeight: 21 },
  bodySm: { fontFamily: font.sans, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 18 },
  eyebrow: { fontFamily: font.monoMedium, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: "uppercase" as const },
  mono: { fontFamily: font.mono, fontSize: 14, lineHeight: 20 },
  monoSm: { fontFamily: font.mono, fontSize: 12, lineHeight: 16 }
};

export const space = { 2: 2, 3: 3, 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40 };

export const size = { controlSm: 32, control: 40, controlLg: 48, badge: 20, row: 56 };

export const motion = { fast: 80, moderate: 160, slow: 240 };

export const usePalette = () => (useColorScheme() === "dark" ? dark : light);
