import type { Preview } from "@storybook/react-vite";

import { DocumentDecorator, RouterDecorator } from "./decorators";

import "../src/index.css";

const preview: Preview = {
  decorators: [DocumentDecorator, RouterDecorator],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    },
    docs: {
      backgroundColor: "var(--background)"
    },
    a11y: {
      test: "todo"
    },
    backgrounds: {
      default: "dark",
      options: {
        dark: { name: "Dark", value: "var(--background)" }
      }
    }
  },
  initialGlobals: {
    backgrounds: {
      value: "dark"
    }
  }
};

export default preview;
