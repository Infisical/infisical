export const initializePlatform = () => {
  const isIos =
    /iPad|iPhone|iPod/.test(navigator?.userAgent ?? "") ||
    (!!navigator?.userAgent?.includes("Macintosh") && (navigator?.maxTouchPoints ?? 0) > 1);

  if (isIos) {
    document.documentElement.dataset.platform = "ios";
  }
};
