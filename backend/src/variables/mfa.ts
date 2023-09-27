// TODO: export some params to validation helper

// authenticator app
export const AUTH_APP_PARAMS = Object.freeze({
  totp_hash_algorithm: "sha256", // if this is changed to "sha1", must also be changed on front-end
  totp_length: 6,
  totp_period: 30000,
  secret_key_bytes: 20,
  base_32_chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", // RFC4648 without padding
});

// MFA recovery codes
export const MFA_RECOVERY_CODES_PARAMS = Object.freeze({
  number: 8, // ensure a balance of usability & security (NB. Mongoose schema enforces min: 4, max: 16)
  bytes: 6, // (6*8) bits / 5 bits/char = 9.6 chars =~ 10 chars in base32)
  min_entropy: 3.1, // see comments above
});