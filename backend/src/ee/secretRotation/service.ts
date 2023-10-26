import { ISecretRotationEncData, TCreateSecretRotation, TGetProviderTemplates } from "./types";
import { rotationTemplates } from "./templates";
import { SecretRotation } from "./models";
import { client, getRootEncryptionKey } from "../../config";
import { BadRequestError } from "../../utils/errors";
import Ajv from "ajv";
import { removeSecretRotationQueue, startSecretRotationQueue } from "./queue";

const ajv = new Ajv();

export const getProviderTemplate = async ({ workspaceId }: TGetProviderTemplates) => {
  return {
    custom: [],
    providers: rotationTemplates
  };
};

export const createSecretRotation = async ({
  workspaceId,
  secretPath,
  environment,
  provider,
  interval,
  inputs,
  outputs
}: TCreateSecretRotation) => {
  const rotationTemplate = rotationTemplates.find(({ name }) => name === provider);
  if (!rotationTemplate) throw BadRequestError({ message: "Provider not found" });

  const formattedInputs: Record<string, unknown> = {};
  Object.entries(inputs).forEach(([key, value]) => {
    const type = rotationTemplate.template.inputs.properties[key].type;
    if (type === "string") {
      formattedInputs[key] = value;
      return;
    }
    if (type === "integer") {
      formattedInputs[key] = parseInt(value as string, 10);
      return;
    }
    formattedInputs[key] = JSON.parse(value as string);
  });
  // ensure input one follows the correct schema
  const valid = ajv.validate(rotationTemplate.template.inputs, formattedInputs);
  if (!valid) {
    throw BadRequestError({ message: ajv.errors?.[0].message });
  }

  const encData: Partial<ISecretRotationEncData> = {
    inputs: formattedInputs,
    creds: []
  };

  const rootEncryptionKey = await getRootEncryptionKey();
  const { ciphertext, iv, tag } = client.encryptSymmetric(
    JSON.stringify(encData),
    rootEncryptionKey
  );

  const secretRotation = new SecretRotation({
    workspace: workspaceId,
    provider,
    environment,
    secretPath,
    interval,
    outputs: Object.entries(outputs).map(([key, secret]) => ({ key, secret })),
    encryptedData: ciphertext,
    encryptedDataIV: iv,
    encryptedDataTag: tag
  });

  await secretRotation.save();
  await startSecretRotationQueue(secretRotation._id.toString(), interval);

  return secretRotation;
};

export const deleteSecretRotation = async ({ id }: { id: string }) => {
  const doc = await SecretRotation.findByIdAndRemove(id);
  if (!doc) throw BadRequestError({ message: "Rotation not found" });

  await removeSecretRotationQueue(doc._id.toString(), doc.interval);
  return doc;
};

export const restartSecretRotation = async ({ id }: { id: string }) => {
  const secretRotation = await SecretRotation.findById(id);
  if (!secretRotation) throw BadRequestError({ message: "Rotation not found" });

  await removeSecretRotationQueue(secretRotation._id.toString(), secretRotation.interval);
  await startSecretRotationQueue(secretRotation._id.toString(), secretRotation.interval);

  return secretRotation;
};

export const getSecretRotationById = async ({ id }: { id: string }) => {
  const doc = await SecretRotation.findById(id);
  if (!doc) throw BadRequestError({ message: "Rotation not found" });
  return doc;
};

export const getSecretRotationOfWorkspace = async (workspaceId: string) => {
  const secretRotations = await SecretRotation.find({
    workspace: workspaceId
  }).populate("outputs.secret");

  return secretRotations;
};
