import { customAlphabet } from "nanoid";

const SLUG_ALPHABETS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const alphaNumericNanoId = customAlphabet(SLUG_ALPHABETS, 10);
