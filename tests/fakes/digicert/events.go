package digicert

// OrderPlaced is published when an order is placed. RenewalOfOrderID is set when it
// renews an earlier order.
type OrderPlaced struct {
	OrderID          int    `json:"orderId"`
	CommonName       string `json:"commonName"`
	Product          string `json:"product"`
	RenewalOfOrderID int    `json:"renewalOfOrderId,omitempty"`
}

// OrderIssued is published when an order's first certificate is issued.
type OrderIssued struct {
	OrderID       int    `json:"orderId"`
	CommonName    string `json:"commonName"`
	CertificateID int    `json:"certificateId"`
}

// ReissueRequested is published when a reissue of an order is requested.
type ReissueRequested struct {
	OrderID               int `json:"orderId"`
	PreviousCertificateID int `json:"previousCertificateId"`
}

// OrderReissued is published when a reissue's certificate is issued.
type OrderReissued struct {
	OrderID               int `json:"orderId"`
	CertificateID         int `json:"certificateId"`
	PreviousCertificateID int `json:"previousCertificateId"`
}

// OrderCanceled is published when a pending order or a pending reissue is canceled.
// Status is the order's status afterwards: canceled, or issued for a reissue.
type OrderCanceled struct {
	OrderID int    `json:"orderId"`
	Status  string `json:"status"`
	Note    string `json:"note"`
}

// CertificateRevoked is published when a certificate is revoked.
type CertificateRevoked struct {
	CertificateID int    `json:"certificateId"`
	OrderID       int    `json:"orderId"`
	Comments      string `json:"comments"`
}

func (OrderPlaced) EventName() string        { return "digicert.order-placed" }
func (OrderIssued) EventName() string        { return "digicert.order-issued" }
func (ReissueRequested) EventName() string   { return "digicert.reissue-requested" }
func (OrderReissued) EventName() string      { return "digicert.order-reissued" }
func (OrderCanceled) EventName() string      { return "digicert.order-canceled" }
func (CertificateRevoked) EventName() string { return "digicert.certificate-revoked" }
