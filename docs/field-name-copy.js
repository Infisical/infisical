(() => {
  const fieldSelector = '[data-component-part="field-name"]';
  const resetTimers = new WeakMap();

  document.addEventListener(
    "click",
    async (event) => {
      if (!(event.target instanceof Element)) return;

      const field = event.target.closest(fieldSelector);
      if (!(field instanceof HTMLElement)) return;

      const fieldName = field.textContent?.trim();
      if (!fieldName) return;

      // The separate chain icon keeps the permalink action.
      event.preventDefault();
      event.stopPropagation();

      try {
        await navigator.clipboard.writeText(fieldName);
        field.dataset.copyState = "copied";

        const existingTimer = resetTimers.get(field);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }

        resetTimers.set(
          field,
          window.setTimeout(() => {
            delete field.dataset.copyState;
            resetTimers.delete(field);
          }, 1500)
        );
      } catch (error) {
        console.error("Unable to copy field name.", error);
      }
    },
    true
  );
})();
