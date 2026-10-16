import { useCallback } from "react";

import { useLocalStorageState } from "@app/hooks";

// Bump after a rewrite worth putting back in front of people who already dismissed the old one.
const INTRO_VERSION = "agent-vault-v1";

const STORAGE_KEY = "seenProductIntros";
const PRODUCT_KEY = "agent-vault";

type TSeenProductIntros = Record<string, string | undefined>;

// Stable identity: useLocalStorageState re-runs its seeding effect whenever this changes.
const NOTHING_SEEN: TSeenProductIntros = {};

// Dismissal is the only state there is: reopening is forgetting it, which is how the sidebar and
// the layout drive one dialog between them without sharing anything else.
export const useAgentVaultIntro = () => {
  const [seen, setSeen] = useLocalStorageState<TSeenProductIntros>(STORAGE_KEY, NOTHING_SEEN);

  const setOpen = useCallback(
    (isOpen: boolean) => {
      setSeen((current) => ({
        ...current,
        [PRODUCT_KEY]: isOpen ? undefined : INTRO_VERSION
      }));
    },
    [setSeen]
  );

  return { isOpen: seen?.[PRODUCT_KEY] !== INTRO_VERSION, setOpen };
};
