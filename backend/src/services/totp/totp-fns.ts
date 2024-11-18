import crypto from "node:crypto";

export const generateRecoveryCode = () => String(crypto.randomInt(10 ** 7, 10 ** 8 - 1));
