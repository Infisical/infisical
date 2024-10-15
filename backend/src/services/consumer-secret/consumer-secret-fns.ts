import { z } from "zod";
import { TConsumerSecrets, TConsumerSecretsInsert } from "../../db/schemas/consumer-secrets";
import {
  SanitizedSecretSchema,
  TCreateConsumerSecretDTO,
  SecretTypeUnion,
  ConsumerSecretTypes,
  ConsumerSecretWebLogin,
  ConsumerSecretCreditCard,
  ConsumerSecretPrivateNote
} from "./consumer-secret-types";

// Function to map DTO to insertable document
export const insertDocFromCreateDTO = ({
  name,
  data,
  actorOrgId,
  actorId
}: TCreateConsumerSecretDTO): TConsumerSecretsInsert => ({
  name,
  type: data.type,
  orgId: actorOrgId,
  userId: actorId,
  data: JSON.stringify(data)
});

// Function to map database result to sanitized consumer secret
export const dbResultToConsumerSecret = (
  dbResult: TConsumerSecrets
): z.infer<typeof SanitizedSecretSchema> => {
  const parsedDbData = JSON.parse(dbResult.data) as Partial<SecretTypeUnion>;

  const baseSecret = {
    id: dbResult.id,
    name: dbResult.name,
    type: dbResult.type as ConsumerSecretTypes,
    orgId: dbResult.orgId,
    userId: dbResult.userId
  };

  if (parsedDbData.type === ConsumerSecretTypes.WebLogin) {
    const webLoginData = parsedDbData as ConsumerSecretWebLogin;
    return {
      ...baseSecret,
      data: {
        type: ConsumerSecretTypes.WebLogin,
        url: webLoginData.url,
        username: webLoginData.username,
        password: webLoginData.password
      }
    };
  }

  if (parsedDbData.type === ConsumerSecretTypes.CreditCard) {
    const creditCardData = parsedDbData as ConsumerSecretCreditCard;
    return {
      ...baseSecret,
      data: {
        type: ConsumerSecretTypes.CreditCard,
        nameOnCard: creditCardData.nameOnCard,
        cardNumber: creditCardData.cardNumber,
        validThrough: creditCardData.validThrough,
        cvv: creditCardData.cvv
      }
    };
  }

  if (parsedDbData.type === ConsumerSecretTypes.PrivateNote) {
    const privateNoteData = parsedDbData as ConsumerSecretPrivateNote;
    return {
      ...baseSecret,
      data: {
        type: ConsumerSecretTypes.PrivateNote,
        title: privateNoteData.title,
        content: privateNoteData.content
      }
    };
  }

  throw new Error(`Unsupported secret type: ${dbResult.type}`);
};
  