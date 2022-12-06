/**
 * This route lets us get the public key of infisical. Th euser doesn't have to be authenticated since this is just the public key.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const publicKeyInfisical = (req, res) => {
  return fetch("/api/v1/key/publicKey/infisical", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export default publicKeyInfisical;
