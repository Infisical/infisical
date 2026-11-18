const HOSTNAME_MAX_LENGTH = 253;
const HOSTNAME_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export const isValidHostname = (value: string) =>
  value.length <= HOSTNAME_MAX_LENGTH && HOSTNAME_REGEX.test(value);
