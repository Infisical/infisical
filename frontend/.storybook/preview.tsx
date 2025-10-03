import type { Preview } from "@storybook/react-vite";

import { RouterDecorator } from "./decorators";

import "../src/index.css";

const preview: Preview = {
  decorators: [
    (Story) => {
      const root = document.getElementsByTagName("html")[0];

      root.setAttribute("class", "overflow-visible");

      return <Story />;
    },
    RouterDecorator
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    },
    a11y: {
      test: "todo"
    },
    backgrounds: {
      options: {
        dark: { name: "Dark", value: "#000000" }
      }
    }
  },
  initialGlobals: {
    backgrounds: { value: "dark" }
  }
};

export default preview;
