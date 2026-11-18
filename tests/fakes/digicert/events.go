package digicert

// OrderDetail names an order.
type OrderDetail struct {
	OrderID    int    `json:"orderId"`
	CommonName string `json:"commonName"`
}

// OrderPlaced is published when an order is placed.
type OrderPlaced OrderDetail

// OrderIssued is published when an order's certificate is issued.
type OrderIssued OrderDetail

func (OrderPlaced) EventName() string { return "digicert.order-placed" }
func (OrderIssued) EventName() string { return "digicert.order-issued" }
