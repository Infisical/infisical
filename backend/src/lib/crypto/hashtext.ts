// used for postgres lock
// this is something postgres does under the hood
// convert any string to a unique number
export const hashtext = (text: string) => {
  // Convert text to UTF8 bytes array for consistent behavior with PostgreSQL
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  // Implementation of hash_any
  let result = 0;

  for (let i = 0; i < bytes.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    result = ((result << 5) + result) ^ bytes[i];
    // Keep within 32-bit integer range
    // eslint-disable-next-line no-bitwise
    result >>>= 0;
  }

  // Convert to signed 32-bit integer like PostgreSQL
  // eslint-disable-next-line no-bitwise
  return result | 0;
};

export const pgAdvisoryLockHashText = (text: string) => {
  const hash = hashtext(text);
  // Ensure positive value within PostgreSQL integer range
  return Math.abs(hash) % 2 ** 31;
};
