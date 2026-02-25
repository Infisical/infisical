import { CustomerTicket, OrderInfo, InventoryItem } from './types.js';

export const MOCK_ORDERS: Record<string, OrderInfo> = {
  'ORD-8891': {
    orderId: 'ORD-8891',
    customerEmail: 'alice.johnson@email.com',
    customerName: 'Alice Johnson',
    items: [
      { name: 'MacBook Pro 16"', quantity: 1, price: 2499 },
    ],
    totalAmount: 2499,
    status: 'delivered',
    shippedItem: 'Sony WH-1000XM5 Headphones',
    expectedItem: 'MacBook Pro 16"',
    trackingNumber: 'TRK-OLD-12345',
    orderDate: new Date('2024-02-20'),
  },
  'ORD-1234': {
    orderId: 'ORD-1234',
    customerEmail: 'bob.smith@email.com',
    customerName: 'Bob Smith',
    items: [
      { name: 'iPhone 15 Pro', quantity: 1, price: 1199 },
      { name: 'AirPods Pro', quantity: 1, price: 249 },
    ],
    totalAmount: 1448,
    status: 'shipped',
    trackingNumber: 'TRK-5678',
    orderDate: new Date('2024-02-18'),
  },
};

export const MOCK_CUSTOMERS: Record<string, { 
  email: string; 
  name: string; 
  loyaltyStatus: 'standard' | 'silver' | 'gold' | 'platinum';
  accountCreated: Date;
}> = {
  'alice.johnson@email.com': {
    email: 'alice.johnson@email.com',
    name: 'Alice Johnson',
    loyaltyStatus: 'standard',
    accountCreated: new Date('2024-01-15'),
  },
  'bob.smith@email.com': {
    email: 'bob.smith@email.com',
    name: 'Bob Smith',
    loyaltyStatus: 'gold',
    accountCreated: new Date('2022-06-10'),
  },
  'vip.customer@email.com': {
    email: 'vip.customer@email.com',
    name: 'Victoria Important',
    loyaltyStatus: 'platinum',
    accountCreated: new Date('2020-03-01'),
  },
};

export const MOCK_INVENTORY: Record<string, InventoryItem> = {
  'macbook-pro-16': {
    sku: 'macbook-pro-16',
    name: 'MacBook Pro 16"',
    quantity: 15,
    warehouse: 'WAREHOUSE-A',
  },
  'iphone-15-pro': {
    sku: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    quantity: 42,
    warehouse: 'WAREHOUSE-A',
  },
  'airpods-pro': {
    sku: 'airpods-pro',
    name: 'AirPods Pro',
    quantity: 128,
    warehouse: 'WAREHOUSE-B',
  },
  'sony-wh1000xm5': {
    sku: 'sony-wh1000xm5',
    name: 'Sony WH-1000XM5 Headphones',
    quantity: 23,
    warehouse: 'WAREHOUSE-A',
  },
};

export const DEMO_TICKET: CustomerTicket = {
  ticketId: 'TKT-1042',
  orderId: 'ORD-8891',
  customerEmail: 'alice.johnson@email.com',
  customerName: 'Alice Johnson',
  issueDescription: 'I ordered a MacBook Pro 16" but received Sony headphones instead. Order #ORD-8891. I need the correct item shipped and would like a refund for the inconvenience.',
  loyaltyStatus: 'standard',
  createdAt: new Date(),
  daysSinceCreated: 0,
};

export const DEMO_TICKET_BILLING: CustomerTicket = {
  ticketId: 'TKT-1043',
  orderId: 'ORD-1234',
  customerEmail: 'bob.smith@email.com',
  customerName: 'Bob Smith',
  issueDescription: 'I was charged twice for my order. Please investigate and refund the duplicate charge.',
  loyaltyStatus: 'gold',
  createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
  daysSinceCreated: 8,
};

export function generateTrackingNumber(): string {
  return `TRK-${Date.now().toString(36).toUpperCase()}`;
}

export function generateShipmentId(): string {
  return `SHP-${Date.now().toString(36).toUpperCase()}`;
}
