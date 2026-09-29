import { setWasmUrl } from "@lottiefiles/dotlottie-react";
import lottieWasmUrl from "@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm?url";
import type { Preview } from "@storybook/react-vite";

import { initializePlatform } from "../src/lib/fn/platform";
import { productAccents } from "./decorators/DocumentDecorator";
import { DocumentDecorator, RouterDecorator } from "./decorators";
import { ThemeDocsContainer } from "./ThemeDocsContainer";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "../src/index.css";

import "../src/translation";

initializePlatform();

// Mirrors main.tsx: serve the Lottie player WASM from the local module instead of a CDN.
setWasmUrl(lottieWasmUrl);

const preview: Preview = {
  decorators: [DocumentDecorator, RouterDecorator],
  globalTypes: {
    theme: {
      description: "Application theme",
      toolbar: {
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
          { value: "system", title: "System" }
        ]
      }
    },
    productAccent: {
      description: "Project accent color",
      toolbar: {
        icon: "paintbrush",
        dynamicTitle: true,
        items: productAccents
      }
    }
  },
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
      container: ThemeDocsContainer
    },
    a11y: {
      test: "todo"
    },
    backgrounds: {
      options: {
        page: { name: "Page", value: "var(--color-page)" },
        background: { name: "Background", value: "var(--color-background)" },
        card: { name: "Card", value: "var(--color-card)" }
      }
    }
  },
  initialGlobals: {
    theme: "dark",
    productAccent: "sm",
    backgrounds: {
      value: "page"
    }
  }
};

export default preview;
