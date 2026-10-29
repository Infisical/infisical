package webhook

// DeliveryReceived is published for every delivery the endpoint answered, whatever
// the status.
type DeliveryReceived struct{ Delivery }

func (DeliveryReceived) EventName() string { return "webhook.delivery-received" }
