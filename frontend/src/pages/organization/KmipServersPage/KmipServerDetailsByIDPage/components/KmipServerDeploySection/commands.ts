export const KMIP_START_SERVICE_COMMAND = "sudo systemctl start infisical-kmip";

export const getKmipServerSiteUrl = () => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  return `${protocol}//${hostname}${portSuffix}`;
};
