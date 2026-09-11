import { IEventOutboxConsumer } from "./event-outbox-types";

export type TEventOutboxRegistry = ReturnType<typeof eventOutboxRegistryFactory>;

export const eventOutboxRegistryFactory = () => {
  const consumers = new Map<string, IEventOutboxConsumer>();

  const register = (consumer: IEventOutboxConsumer) => {
    if (consumers.has(consumer.name)) {
      throw new Error(`Event outbox consumer already registered under the name '${consumer.name}'`);
    }
    consumers.set(consumer.name, consumer);
  };

  const get = (name: string): IEventOutboxConsumer | undefined => consumers.get(name);

  const names = (): string[] => [...consumers.keys()];

  const subscribersOf = (eventType: string): IEventOutboxConsumer[] =>
    [...consumers.values()].filter((consumer) => consumer.subscribesTo(eventType));

  return { register, get, names, subscribersOf };
};
