import { crypto } from "@app/lib/crypto/cryptography";

export const generateRecoveryCode = () => String(crypto.randomInt(10 ** 7, 10 ** 8 - 1));
