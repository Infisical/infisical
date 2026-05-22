import type { Preview } from "@storybook/react-vite";

import { DocumentDecorator, RouterDecorator } from "./decorators";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "../src/index.css";

const preview: Preview = {
  decorators: [DocumentDecorator, RouterDecorator],
  parameters: {
    options: {
      storySort: {
        method: "alphabetical"
      }
    },
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
        dark: { name: "Dark", value: "var(--background)" },
        card: { name: "Card", value: "var(--color-card)" }
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
