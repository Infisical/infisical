/**
 * Feature showcase modals config for marketing campaigns.
 *
 * Marketing can trigger a modal by linking users to:
 *   https://app.infisical.com?show_feature=pam
 *
 * Each modal shows once per user (dismissal stored in localStorage).
 * To add a new modal: add an entry here and use ?show_feature=<id> in links.
 */

export const FEATURE_MODALS = {
  pam: {
    id: "pam",
    imageSrc: "/images/gradientLogo.svg",
    imageAlt: "Infisical PAM",
    title: "Introducing Infisical PAM",
    description:
      "Manage access to your privileged accounts, cloud resources, and databases securely.",
    docsUrl: "https://infisical.com/docs/documentation/platform/pam/overview"
  }
  // Add new modals here. Marketing links: https://app.infisical.com?show_feature=<id>
} as const;

export type FeatureModalId = keyof typeof FEATURE_MODALS;

const STORAGE_KEY_PREFIX = "infisical-feature-modal-seen-";

export const getFeatureModalSeenKey = (id: string) => `${STORAGE_KEY_PREFIX}${id}`;

export const hasSeenFeatureModal = (id: string): boolean =>
  localStorage.getItem(getFeatureModalSeenKey(id)) === "true";

export const markFeatureModalSeen = (id: string): void => {
  localStorage.setItem(getFeatureModalSeenKey(id), "true");
};
