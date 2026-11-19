import { TEventConsumer } from "../dependencies";

// Consumers are built after the services that emit to them, so they register at wiring time instead of
// arriving through a constructor. Sealed once the workers start: a consumer added later would have missed
// every event emitted before it.
export class ConsumerRegistry {
  private readonly consumers = new Map<string, TEventConsumer>();

  private sealed = false;

  register(consumer: TEventConsumer): void {
    if (this.sealed) {
      throw new Error(`Event consumer '${consumer.name}' was registered after the events module started`);
    }
    if (this.consumers.has(consumer.name)) {
      throw new Error(`Event consumer already registered under the name '${consumer.name}'`);
    }
    this.consumers.set(consumer.name, consumer);
  }

  seal(): void {
    this.sealed = true;
  }

  get(name: string): TEventConsumer | undefined {
    return this.consumers.get(name);
  }

  names(): string[] {
    return [...this.consumers.keys()];
  }

  subscribersOf(eventType: string): TEventConsumer[] {
    return [...this.consumers.values()].filter((consumer) => consumer.subscribesTo(eventType));
  }
}
