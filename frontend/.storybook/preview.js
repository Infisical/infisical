import { themes } from "@storybook/theming";
import "react-day-picker/dist/style.css";
import "../src/styles/globals.css";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  backgrounds: {
    default: "dark",
    values: [
      {
        name: "dark",
        value: "rgb(14, 16, 20)"
      },
      {
        name: "paper",
        value: "rgb(30, 31, 34)"
      }
    ]
  },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/
    }
  },
  darkMode: {
    dark: { ...themes.dark, appContentBg: "rgb(14,16,20)", appBg: "rgb(14,16,20)" }
  }
};
