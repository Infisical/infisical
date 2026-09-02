import type { Preview } from "@storybook/react-vite";
import { setWasmUrl } from "@lottiefiles/dotlottie-react";
import lottieWasmUrl from "@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm?url";

import { initializePlatform } from "../src/lib/fn/platform";

import { DocumentDecorator, RouterDecorator } from "./decorators";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "../src/index.css";

initializePlatform();

// Mirrors main.tsx: serve the Lottie player WASM from the local module instead of a CDN.
setWasmUrl(lottieWasmUrl);

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
