import { getPostHog } from "@app/components/analytics/posthog";

type Capturer = {
  capture: (item: string, properties?: Record<string, unknown>) => void;
  identify: (id: string, email?: string) => void;
};

const createCapturer = (): Capturer => {
  const api = getPostHog();

  return {
    capture(item, properties) {
      try {
        api?.capture(item, properties);
      } catch (error) {
        console.error("PostHog", error);
      }
    },
    identify(id, email) {
      try {
        api?.identify(id, {
          email
        });
      } catch (error) {
        console.error("PostHog", error);
      }
    }
  };
};

export default class Telemetry {
  static instance: Capturer;

  private readonly capturer: Capturer;

  constructor() {
    if (!Telemetry.instance) {
      Telemetry.instance = createCapturer();
    }
    this.capturer = Telemetry.instance;
  }

  getInstance() {
    return this.capturer;
  }
}
