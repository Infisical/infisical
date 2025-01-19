import { ConsumerSecretRaw, decodeConsumerSecret } from "./models";

export function ConsumerSecretItem({ consumerSecretRaw }: { consumerSecretRaw: ConsumerSecretRaw }) {
    const content = decodeConsumerSecret(consumerSecretRaw.plaintextSecret);

    if (content.kind === "SecureNote") {
        return <>Title: {content.title}. Content: {content.content}</>
    }

    throw new Error("Other secret kinds not implemented")
}