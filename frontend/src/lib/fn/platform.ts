const isIos =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

export const initializePlatform = () => {
  if (isIos) {
    document.documentElement.dataset.platform = "ios";
  }
};
