export const isInfisicalCloud = () =>
  window.location.origin.includes("https://app.infisical.com") ||
  window.location.origin.includes("https://us.infisical.com") ||
  window.location.origin.includes("https://eu.infisical.com") ||
  window.location.origin.includes("https://gamma.infisical.com") ||
  window.location.origin.includes("http://localhost:8080");
