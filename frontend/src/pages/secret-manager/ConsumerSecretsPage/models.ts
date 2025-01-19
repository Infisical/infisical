export interface ConsumerSecretRaw {
    organization: string,
    user: string,
    plaintextSecret: string,
}

export type ConsumerSecret = {
    kind: "WebLogin",
    userName: string,
    password: string
} | {
    kind: "CreditCard",
    cardNumber: string,
    expiryDate: string,
    cvv: string
} | {
    kind: "SecureNote",
    title: string,
    content: string,
}

export function encodeConsumerSecret(secret: ConsumerSecret): string {
    return JSON.stringify(secret);
}

export function decodeConsumerSecret(plaintextSecret: string): ConsumerSecret {
    // TODO: Add thorough type validation
    return JSON.parse(plaintextSecret) as ConsumerSecret
}