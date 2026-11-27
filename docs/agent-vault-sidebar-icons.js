// The "By agent" sidebar icon holds OpenAI's black logo, which needs its white version in dark mode. A sidebar icon is
// one image, and Safari ignores the page's theme inside an image, so swap the file when the theme changes. Swapping
// only the file name keeps the /docs prefix production adds to image paths.
(() => {
  const LIGHT = "/stack-agents.svg";
  const DARK = "/stack-agents.on-dark.svg";

  const update = () => {
    const dark = document.documentElement.classList.contains("dark");
    document.querySelectorAll(`img[src*="${LIGHT}"], img[src*="${DARK}"]`).forEach((img) => {
      const src = img.getAttribute("src");
      const next = dark ? src.replace(LIGHT, DARK) : src.replace(DARK, LIGHT);
      if (next !== src) img.setAttribute("src", next);
    });
  };

  update();
  // The theme toggles a class on <html>, and navigating between pages re-renders the sidebar.
  new MutationObserver(update).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
})();
