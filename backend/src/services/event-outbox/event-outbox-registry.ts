import { IEventConsumer } from "./event-outbox-types";

export type TEventOutboxRegistry = ReturnType<typeof eventOutboxRegistryFactory>;

export const eventOutboxRegistryFactory = () => {
  const consumers = new Map<string, IEventConsumer>();

  const register = (consumer: IEventConsumer) => {
    if (consumers.has(consumer.name)) {
      throw new Error(`Event outbox consumer already registered under the name '${consumer.name}'`);
    }
    consumers.set(consumer.name, consumer);
  };

  const get = (name: string): IEventConsumer | undefined => consumers.get(name);

  const names = (): string[] => [...consumers.keys()];

  const subscribersOf = (eventType: string): IEventConsumer[] =>
    [...consumers.values()].filter((consumer) => consumer.subscribesTo(eventType));

  return { register, get, names, subscribersOf };
};
