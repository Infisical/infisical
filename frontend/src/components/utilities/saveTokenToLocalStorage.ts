interface Props {
  protectedKey?: string;
  protectedKeyIV?: string;
  protectedKeyTag?: string;
  publicKey?: string;
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
  privateKey?: string;
}

export const saveTokenToLocalStorage = ({
  protectedKey,
  protectedKeyIV,
  protectedKeyTag,
  publicKey,
  encryptedPrivateKey,
  iv,
  tag,
  privateKey,
}: Props) => {
  try {
    localStorage.removeItem("protectedKey");
    localStorage.removeItem("protectedKeyIV");
    localStorage.removeItem("protectedKeyTag");
    localStorage.removeItem("publicKey");
    localStorage.removeItem("encryptedPrivateKey");
    localStorage.removeItem("iv");
    localStorage.removeItem("tag");
    localStorage.removeItem("PRIVATE_KEY");
    
    if (protectedKey) {
      localStorage.setItem("protectedKey", protectedKey);
    }

    if (protectedKeyIV) {
      localStorage.setItem("protectedKeyIV", protectedKeyIV);
    }

    if (protectedKeyTag) {
      localStorage.setItem("protectedKeyTag", protectedKeyTag);
    }

    if (publicKey) {
      localStorage.setItem("publicKey", publicKey);
    }

    if (privateKey) {
      localStorage.setItem("PRIVATE_KEY", privateKey);
    }

    localStorage.setItem("encryptedPrivateKey", encryptedPrivateKey);
    localStorage.setItem("iv", iv);
    localStorage.setItem("tag", tag);
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(
        `Unable to send the tokens in local storage:${  err.message}`
      );
    }
  }
};
