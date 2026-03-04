import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";

import { Button } from "../Button";
import {
  FEATURE_MODALS,
  type FeatureModalId,
  hasSeenFeatureModal,
  markFeatureModalSeen
} from "@app/config/featureModals";

import { FeatureShowcaseModal } from "./FeatureShowcaseModal";

const SHOW_FEATURE_PARAM = "show_feature";
const FORCE_PARAM = "force";

const getShowFeatureFromSearch = (
  search: string
): { modalId: FeatureModalId; force: boolean } | null => {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const modalId = params.get(SHOW_FEATURE_PARAM) as FeatureModalId | null;
  const force = params.get(FORCE_PARAM) === "1" || params.get(FORCE_PARAM) === "true";
  return modalId && modalId in FEATURE_MODALS
    ? { modalId: modalId as FeatureModalId, force }
    : null;
};

const clearShowFeatureFromUrl = (): void => {
  const params = new URLSearchParams(window.location.search);
  params.delete(SHOW_FEATURE_PARAM);
  params.delete(FORCE_PARAM);
  const newSearch = params.toString();
  const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
  window.history.replaceState({}, "", newUrl);
};

export const FeatureShowcaseModalTrigger = (): JSX.Element | null => {
  const location = useLocation();
  const [activeModal, setActiveModal] = useState<{
    modalId: FeatureModalId;
    force: boolean;
  } | null>(null);

  const searchStr =
    typeof location.search === "string"
      ? location.search
      : typeof location.search === "object" && location.search !== null
        ? new URLSearchParams(location.search as Record<string, string>).toString()
        : window.location.search;

  useEffect(() => {
    const result = getShowFeatureFromSearch(searchStr || window.location.search);
    if (!result) {
      setActiveModal(null);
      return;
    }

    if (!result.force && hasSeenFeatureModal(FEATURE_MODALS[result.modalId].id)) return;

    setActiveModal(result);
  }, [searchStr]);

  const handleClose = () => {
    if (!activeModal) return;

    if (!activeModal.force) {
      markFeatureModalSeen(FEATURE_MODALS[activeModal.modalId].id);
    }
    setActiveModal(null);
    clearShowFeatureFromUrl();
  };

  if (!activeModal) return null;

  const config = FEATURE_MODALS[activeModal.modalId];

  return (
    <FeatureShowcaseModal
      isOpen
      onClose={handleClose}
      imageSrc={config.imageSrc}
      imageAlt={config.imageAlt}
      title={config.title}
      description={config.description}
      maxWidth="4xl"
      footerContent={
        config.docsUrl ? (
          <a
            href={config.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button colorSchema="primary" variant="solid">
              Read more
            </Button>
          </a>
        ) : undefined
      }
    />
  );
};
