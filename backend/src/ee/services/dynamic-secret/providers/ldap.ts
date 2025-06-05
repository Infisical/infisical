import handlebars from "handlebars";
import ldapjs from "ldapjs";
import ldif from "ldif";
import { customAlphabet } from "nanoid";
import RE2 from "re2";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { LdapCredentialType, LdapSchema, TDynamicProviderFns } from "./models";
import { compileUsernameTemplate } from "./templateUtils";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 64)();
};

const encodePassword = (password?: string) => {
  const quotedPassword = `"${password}"`;
  const utf16lePassword = Buffer.from(quotedPassword, "utf16le");
  const base64Password = utf16lePassword.toString("base64");
  return base64Password;
};

const generateUsername = (usernameTemplate?: string | null, identity?: { name: string }) => {
  const randomUsername = alphaNumericNanoId(32); // Username must start with an ascii letter, so we prepend the username with "inf-"
  if (!usernameTemplate) return randomUsername;
  return compileUsernameTemplate({
    usernameTemplate,
    randomUsername,
    identity
  });
};

const generateLDIF = ({
  username,
  password,
  ldifTemplate
}: {
  username: string;
  password?: string;
  ldifTemplate: string;
}): string => {
  const data = {
    Username: username,
    Password: password,
    EncodedPassword: encodePassword(password)
  };

  const renderTemplate = handlebars.compile(ldifTemplate);
  const renderedLdif = renderTemplate(data);

  return renderedLdif;
};

export const LdapProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await LdapSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $getClient = async (providerInputs: z.infer<typeof LdapSchema>): Promise<ldapjs.Client> => {
    return new Promise((resolve, reject) => {
      const client = ldapjs.createClient({
        url: providerInputs.url,
        tlsOptions: {
          ca: providerInputs.ca ? providerInputs.ca : null,
          rejectUnauthorized: !!providerInputs.ca
        },
        reconnect: true,
        bindDN: providerInputs.binddn,
        bindCredentials: providerInputs.bindpass
      });

      client.on("error", (err: Error) => {
        client.unbind();
        reject(new BadRequestError({ message: err.message }));
      });

      client.bind(providerInputs.binddn, providerInputs.bindpass, (err) => {
        if (err) {
          client.unbind();
          reject(new BadRequestError({ message: err.message }));
        } else {
          resolve(client);
        }
      });
    });
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);
    return client.connected;
  };

  const executeLdif = async (client: ldapjs.Client, ldif_file: string) => {
    type TEntry = {
      dn: string;
      type: string;

      changes: {
        operation?: string;
        attribute: {
          attribute: string;
        };
        value: {
          value: string;
        };
        values: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped, can be any for ldapjs.Change.modification.values
          value: any;
        }[];
      }[];
    };

    let parsedEntries: TEntry[];

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      parsedEntries = ldif.parse(ldif_file).entries as TEntry[];
    } catch (err) {
      throw new BadRequestError({
        message: "Invalid LDIF format, refer to the documentation at Dynamic secrets > LDAP > LDIF Entries."
      });
    }

    const dnArray: string[] = [];

    for await (const entry of parsedEntries) {
      const { dn } = entry;
      let responseDn: string;

      if (entry.type === "add") {
        const attributes: Record<string, string | string[]> = {};

        entry.changes.forEach((change) => {
          const attrName = change.attribute.attribute;
          const attrValue = change.value.value;

          attributes[attrName] = Array.isArray(attrValue) ? attrValue : [attrValue];
        });

        responseDn = await new Promise((resolve, reject) => {
          client.add(dn, attributes, (err) => {
            if (err) {
              reject(new BadRequestError({ message: err.message }));
            } else {
              resolve(dn);
            }
          });
        });
      } else if (entry.type === "modify") {
        const changes: ldapjs.Change[] = [];

        entry.changes.forEach((change) => {
          changes.push(
            new ldapjs.Change({
              operation: change.operation || "replace",
              modification: {
                type: change.attribute.attribute,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                values: change.values.map((value) => value.value)
              }
            })
          );
        });

        responseDn = await new Promise((resolve, reject) => {
          client.modify(dn, changes, (err) => {
            if (err) {
              reject(new BadRequestError({ message: err.message }));
            } else {
              resolve(dn);
            }
          });
        });
      } else if (entry.type === "delete") {
        responseDn = await new Promise((resolve, reject) => {
          client.del(dn, (err) => {
            if (err) {
              reject(new BadRequestError({ message: err.message }));
            } else {
              resolve(dn);
            }
          });
        });
      } else {
        client.unbind();
        throw new BadRequestError({ message: `Unsupported operation type ${entry.type}` });
      }

      dnArray.push(responseDn);
    }
    client.unbind();
    return dnArray;
  };

  const create = async (data: { inputs: unknown; usernameTemplate?: string | null; identity?: { name: string } }) => {
    const { inputs, usernameTemplate, identity } = data;
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    if (providerInputs.credentialType === LdapCredentialType.Static) {
      const dnRegex = new RE2("^dn:\\s*(.+)", "m");
      const dnMatch = dnRegex.exec(providerInputs.rotationLdif);

      if (dnMatch) {
        const username = dnMatch[1];
        const password = generatePassword();

        const generatedLdif = generateLDIF({ username, password, ldifTemplate: providerInputs.rotationLdif });

        try {
          const dnArray = await executeLdif(client, generatedLdif);

          return { entityId: username, data: { DN_ARRAY: dnArray, USERNAME: username, PASSWORD: password } };
        } catch (err) {
          throw new BadRequestError({ message: (err as Error).message });
        }
      } else {
        throw new BadRequestError({
          message: "Invalid rotation LDIF, missing DN."
        });
      }
    } else {
      const username = generateUsername(usernameTemplate, identity);
      const password = generatePassword();
      const generatedLdif = generateLDIF({ username, password, ldifTemplate: providerInputs.creationLdif });

      try {
        const dnArray = await executeLdif(client, generatedLdif);

        return { entityId: username, data: { DN_ARRAY: dnArray, USERNAME: username, PASSWORD: password } };
      } catch (err) {
        if (providerInputs.rollbackLdif) {
          const rollbackLdif = generateLDIF({ username, password, ldifTemplate: providerInputs.rollbackLdif });
          await executeLdif(client, rollbackLdif);
        }
        throw new BadRequestError({ message: (err as Error).message });
      }
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    if (providerInputs.credentialType === LdapCredentialType.Static) {
      const dnRegex = new RE2("^dn:\\s*(.+)", "m");
      const dnMatch = dnRegex.exec(providerInputs.rotationLdif);

      if (dnMatch) {
        const username = dnMatch[1];
        const password = generatePassword();

        const generatedLdif = generateLDIF({ username, password, ldifTemplate: providerInputs.rotationLdif });

        try {
          const dnArray = await executeLdif(client, generatedLdif);

          return { entityId: username, data: { DN_ARRAY: dnArray, USERNAME: username, PASSWORD: password } };
        } catch (err) {
          throw new BadRequestError({ message: (err as Error).message });
        }
      } else {
        throw new BadRequestError({
          message: "Invalid rotation LDIF, missing DN."
        });
      }
    }

    const revocationLdif = generateLDIF({ username: entityId, ldifTemplate: providerInputs.revocationLdif });

    await executeLdif(client, revocationLdif);

    return { entityId };
  };

  const renew = async (inputs: unknown, entityId: string) => {
    // No renewal necessary
    return { entityId };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
