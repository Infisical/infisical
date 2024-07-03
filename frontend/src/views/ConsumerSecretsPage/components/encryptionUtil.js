import CryptoJS from "crypto-js";

const encryptionKey = `${process.env.ENCRYPTION_KEY  }=`;

export const encryptData = (data) => {
  return CryptoJS.AES.encrypt(data, encryptionKey).toString();
};

export const decryptData = (ciphertext) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, encryptionKey);
  return bytes.toString(CryptoJS.enc.Utf8);
};
