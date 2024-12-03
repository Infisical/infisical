// Validates usernames or wildcard (*)
export const isValidUserPattern = (value: string): boolean => {
  // Matches valid Linux usernames or a wildcard (*)
  const userRegex = /^(?:\*|[a-z_][a-z0-9_-]{0,31})$/;
  return userRegex.test(value);
};

// Validates hostnames, wildcard domains, or IP addresses
export const isValidHostPattern = (value: string): boolean => {
  // Matches FQDNs, wildcard domains (*.example.com), IPv4, and IPv6 addresses
  const hostRegex =
    /^(?:\*|\*\.[a-z0-9-]+(?:\.[a-z0-9-]+)*|[a-z0-9-]+(?:\.[a-z0-9-]+)*|\d{1,3}(\.\d{1,3}){3}|([a-fA-F0-9:]+:+)+[a-fA-F0-9]+(?:%[a-zA-Z0-9]+)?)$/;
  return hostRegex.test(value);
};
