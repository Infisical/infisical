// AVS - Your Orders Page

const API_BASE = '';

// Product images (placeholder URLs - using emoji placeholders for demo)
const PRODUCT_IMAGES = {
  'MacBook Pro 16"': 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp16-spacegray-select-202301?wid=200&hei=200&fmt=jpeg&qlt=90',
  'iPhone 15 Pro': 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-1inch-naturaltitanium?wid=200&hei=200&fmt=jpeg&qlt=90',
  'AirPods Pro': 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83?wid=200&hei=200&fmt=jpeg&qlt=90',
  'Apple Watch Ultra 2': 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-ultra-2?wid=200&hei=200&fmt=jpeg&qlt=90',
  'Sony WH-1000XM5 Headphones': 'https://m.media-amazon.com/images/I/61vJtKbAssL._AC_SL1500_.jpg',
  'default': 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f0f0f0" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23999" font-size="40">📦</text></svg>'
};

// Mock orders data
const ORDERS = [
  {
    orderId: 'ORD-8891',
    orderDate: '2024-02-20',
    total: 2499.00,
    status: 'delivered',
    deliveredDate: '2024-02-23',
    items: [
      { name: 'MacBook Pro 16"', price: 2499, quantity: 1 }
    ],
    shippedItem: 'Sony WH-1000XM5 Headphones',
    expectedItem: 'MacBook Pro 16"',
    hasIssue: true,
    issueType: 'wrong-item'
  },
  {
    orderId: 'ORD-1234',
    orderDate: '2024-02-18',
    total: 1448.00,
    status: 'shipped',
    trackingNumber: 'TRK-5678',
    items: [
      { name: 'iPhone 15 Pro', price: 1199, quantity: 1 },
      { name: 'AirPods Pro', price: 249, quantity: 1 }
    ],
    hasBillingIssue: true
  },
  {
    orderId: 'ORD-5555',
    orderDate: '2024-02-15',
    total: 897.00,
    status: 'delivered',
    deliveredDate: '2024-02-18',
    items: [
      { name: 'Apple Watch Ultra 2', price: 799, quantity: 1 },
      { name: 'Apple Watch Band', price: 49, quantity: 2 }
    ]
  }
];

// DOM Elements
const ordersList = document.getElementById('ordersList');
const supportModal = document.getElementById('supportModal');
const closeModal = document.getElementById('closeModal');
const supportForm = document.getElementById('supportForm');
const submitBtn = document.getElementById('submitBtn');
const responseSection = document.getElementById('responseSection');
const doneBtn = document.getElementById('doneBtn');

// Current order being supported
let currentOrder = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  renderOrders();
  setupEventListeners();
});

function setupEventListeners() {
  // Close modal
  closeModal.addEventListener('click', closeSupportModal);
  document.querySelector('.modal-backdrop').addEventListener('click', closeSupportModal);
  
  // Form submission
  supportForm.addEventListener('submit', handleSubmit);
  
  // Issue type selection
  document.querySelectorAll('input[name="issueType"]').forEach(input => {
    input.addEventListener('change', updateSubmitButton);
  });
  
  document.getElementById('issueDetails').addEventListener('input', updateSubmitButton);
  
  // Done button
  doneBtn.addEventListener('click', closeSupportModal);
  
  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSupportModal();
  });
}

function renderOrders() {
  ordersList.innerHTML = ORDERS.map(order => `
    <div class="order-card">
      <div class="order-header">
        <div class="order-meta">
          <div class="order-meta-item">
            <span class="order-meta-label">Order Placed</span>
            <span class="order-meta-value">${formatDate(order.orderDate)}</span>
          </div>
          <div class="order-meta-item">
            <span class="order-meta-label">Total</span>
            <span class="order-meta-value">$${order.total.toFixed(2)}</span>
          </div>
          <div class="order-meta-item">
            <span class="order-meta-label">Ship To</span>
            <span class="order-meta-value">Customer</span>
          </div>
        </div>
        <div class="order-meta-item" style="text-align: right;">
          <span class="order-meta-label">Order #</span>
          <span class="order-meta-value">
            <a href="#" class="order-id-link">${order.orderId}</a>
          </span>
        </div>
      </div>
      
      <div class="order-body">
        <div class="order-status ${order.status}">
          ${order.status === 'delivered' 
            ? `Delivered ${formatDate(order.deliveredDate)}` 
            : `Shipped - Tracking: ${order.trackingNumber}`}
        </div>
        
        <div class="order-items">
          <div class="order-item">
            <img src="${getProductImage(order.items[0].name)}" alt="${order.items[0].name}" class="item-image">
            <div class="item-details">
              <a href="#" class="item-name">${order.items[0].name}</a>
              ${order.items.length > 1 ? `<p class="item-quantity">+${order.items.length - 1} more item(s)</p>` : ''}
              <p class="item-price">$${order.items[0].price.toFixed(2)}</p>
            </div>
          </div>
          
          <div class="order-actions">
            <button class="order-btn primary">Buy it again</button>
            <button class="order-btn">Track package</button>
            <button class="order-btn support" onclick="openSupportModal('${order.orderId}')">
              Get product support
            </button>
          </div>
        </div>
        
        ${order.hasIssue ? `
          <div class="wrong-item-alert">
            ⚠️ <strong>Issue reported:</strong> Wrong item received (${order.shippedItem} instead of ${order.expectedItem})
          </div>
        ` : ''}
        
        ${order.hasBillingIssue ? `
          <div class="wrong-item-alert">
            ⚠️ <strong>Billing alert:</strong> Duplicate charge detected on this order
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function openSupportModal(orderId) {
  currentOrder = ORDERS.find(o => o.orderId === orderId);
  if (!currentOrder) return;
  
  // Populate modal with order info
  document.getElementById('modalProductImage').src = getProductImage(currentOrder.items[0].name);
  document.getElementById('modalProductName').textContent = currentOrder.items[0].name;
  document.getElementById('modalOrderId').textContent = `Order ${currentOrder.orderId} • ${formatDate(currentOrder.orderDate)}`;
  document.getElementById('formOrderId').value = orderId;
  
  // Reset form
  supportForm.reset();
  supportForm.classList.remove('hidden');
  responseSection.classList.add('hidden');
  submitBtn.disabled = true;
  
  // Pre-select issue type if there's a known issue
  if (currentOrder.hasIssue && currentOrder.issueType) {
    const radio = document.querySelector(`input[name="issueType"][value="${currentOrder.issueType}"]`);
    if (radio) {
      radio.checked = true;
      document.getElementById('issueDetails').value = `I ordered ${currentOrder.expectedItem} but received ${currentOrder.shippedItem} instead.`;
      updateSubmitButton();
    }
  }
  
  if (currentOrder.hasBillingIssue) {
    const radio = document.querySelector(`input[name="issueType"][value="billing"]`);
    if (radio) {
      radio.checked = true;
      document.getElementById('issueDetails').value = 'I was charged twice for this order. Please investigate and refund the duplicate charge.';
      updateSubmitButton();
    }
  }
  
  // Show modal
  supportModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSupportModal() {
  supportModal.classList.add('hidden');
  document.body.style.overflow = '';
  currentOrder = null;
}

function updateSubmitButton() {
  const issueType = document.querySelector('input[name="issueType"]:checked');
  const details = document.getElementById('issueDetails').value.trim();
  submitBtn.disabled = !issueType || !details;
}

async function handleSubmit(e) {
  e.preventDefault();
  
  const issueType = document.querySelector('input[name="issueType"]:checked')?.value;
  const details = document.getElementById('issueDetails').value.trim();
  const orderId = document.getElementById('formOrderId').value;
  
  if (!issueType || !details || !orderId) return;
  
  // Show loading state
  submitBtn.querySelector('.btn-text').classList.add('hidden');
  submitBtn.querySelector('.btn-loading').classList.remove('hidden');
  submitBtn.disabled = true;
  
  try {
    const response = await fetch(`${API_BASE}/api/support`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        issueType,
        issueDescription: details
      })
    });
    
    const data = await response.json();
    
    // Hide form, show response
    supportForm.classList.add('hidden');
    responseSection.classList.remove('hidden');
    
    document.getElementById('responseMessage').innerHTML = data.response || 
      'Your request has been submitted. We\'ll send you an email with updates on your case.';
    
  } catch (error) {
    console.error('Submit error:', error);
    supportForm.classList.add('hidden');
    responseSection.classList.remove('hidden');
    document.getElementById('responseMessage').textContent = 
      'Your request has been submitted. We\'ll send you an email confirmation shortly.';
  }
  
  // Reset button state
  submitBtn.querySelector('.btn-text').classList.remove('hidden');
  submitBtn.querySelector('.btn-loading').classList.add('hidden');
}

function getProductImage(productName) {
  return PRODUCT_IMAGES[productName] || PRODUCT_IMAGES['default'];
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
