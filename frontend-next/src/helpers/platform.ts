export const isInfisicalCloud = () =>
  window.location.origin.includes("https://app.infisical.com") ||
  window.location.origin.includes("https://us.infisical.com") ||
  window.location.origin.includes("https://eu.infisical.com");
