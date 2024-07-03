export type TConsumerSecret = {
  id: string;
  userId: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
} & TCreateConsumerSecretRequest;

export type TCreateConsumerSecretRequest = {
  type: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  title: string;
  content?: string;
};

export type TViewConsumerSecretResponse = TCreateConsumerSecretRequest;

export type TDeleteConsumerSecretRequest = {
  consumerSecretId: string;
};

export type TEditConsumerSecretRequest = {
  consumerSecretId: string;
} & Partial<TCreateConsumerSecretRequest>;
