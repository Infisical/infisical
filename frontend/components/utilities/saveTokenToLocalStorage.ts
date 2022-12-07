interface Props {
  publicKey: string;
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
  privateTag: string;
}

export const saveTokenToLocalStorage = ({
  publicKey,
  encryptedPrivateKey,
  iv,
  tag,
  privateTag,
}: Props) => {
  try {
    localStorage.setItem("publicKey", publicKey);
    localStorage.setItem("encryptedPrivateKey", encryptedPrivateKey);
    localStorage.setItem("iv", iv);
    localStorage.setItem("tag", tag);
    localStorage.setItem("PRIVATE_KEY", privateTag);
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(
        "Unable to send the tokens in local storage:" + err.message
      );
    }
  }
};
