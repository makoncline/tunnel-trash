# Fulfillment System PRD

## Overview

A simple, functional fulfillment management system for tracking t-shirt orders from Stripe. No polish needed - just basic functionality to group orders by address, track status, manage shipping, and track inventory.

## Core Requirements

### Functional Requirements

- Fetch successful Stripe payments with t-shirt size data
- Simple local status tracking (pending, shipped, delivered)
- Group transactions by shipping address into "parcels"
- Count t-shirt sizes for verification
- Mark parcels as shipped
- Basic filtering by status
- Track inventory dynamically by subtracting shipped orders from initial stock
- Show current inventory counts vs allocated/shipped
- Display customer emails on transactions and parcels
- Store tracking numbers (added after using Pirate Ship)

### Technical Requirements

- Next.js admin page (development only)
- Stripe API integration
- JSON file for status persistence
- JSON file for initial inventory counts
- Simple collapsible lists interface
- Data directory for all persistent files

## User Stories

1. **As an admin, I want to see all transactions with their status** so I can filter and track them
2. **As an admin, I want to see size counts** so I can verify inventory
3. **As an admin, I want to see parcels grouped by address** so I can ship efficiently
4. **As an admin, I want to mark parcels as shipped** so I can track progress
5. **As an admin, I want to see current inventory levels** so I know what I have left to ship
6. **As an admin, I want to see what's allocated vs shipped** so I can plan packing
7. **As an admin, I want to see customer emails** so I can contact customers if needed
8. **As an admin, I want to store tracking numbers** so I can reference them later

## Simple UI Layout

### Page Structure

```
Fulfillment Admin

[Inventory] (collapsible)
├── Current Stock: [Size counts remaining]
├── Allocated: [Size counts in pending orders]
└── Shipped: [Size counts already shipped]

[Transactions] (collapsible)
├── Filter: [All] [Pending] [Shipped] [Delivered]
├── Transaction List:
│   ├── [ID] [Customer] [Email] [Sizes] [Status] [Date]
│   └── ...
└── Verification Totals: [Size Counts] [Total Count]

[Parcels] (collapsible)
├── Parcel List:
│   ├── [Parcel ID: txn1/txn2] [Customer/Email] [Address] [Sizes] [Tracking] [Mark Shipped]
│   └── ...
└── Verification Totals: [Size Counts] [Total Parcels]
```

## Implementation Tasks

### Phase 1: Basic Setup

- [x] **Task 1.1: Environment & Dependencies**
  - [x] Add STRIPE_SECRET_KEY to env.js
  - [x] Install Stripe SDK (`npm install stripe`)
  - [x] Create admin route structure
  - [x] Add development-only guard
  - [x] Create data directory structure

### Phase 2: Data Layer

- [x] **Task 2.1: Stripe Integration**
  - [x] Create basic Stripe client
  - [x] Fetch payments with pagination
  - [x] Extract size data from custom fields
  - [x] Extract customer email addresses
- [x] **Task 2.2: Data Processing**
  - [x] Parse transactions from Stripe data
  - [ ] Group transactions by shipping address into parcels
  - [x] Create size counting logic
- [ ] **Task 2.3: Status Management**
  - [ ] Create JSON file read/write utilities
  - [ ] Implement status update functions
  - [ ] Add tracking number storage
- [ ] **Task 2.4: Inventory Management**
  - [ ] Create initial inventory file structure
  - [ ] Calculate current inventory (initial - shipped)
  - [ ] Calculate allocated inventory (pending orders)
  - [ ] Add inventory validation warnings

### Phase 3: API Routes

- [x] **Task 3.1: Data API**
  - [x] GET endpoint to fetch all processed data
  - [ ] POST endpoint to update transaction/parcel status
  - [ ] Include inventory calculations in data response
  - [ ] Handle tracking number updates

### Phase 4: Basic UI

- [x] **Task 4.1: Main Page**
  - [x] Create simple admin page layout
  - [ ] Add collapsible inventory section
  - [x] Add collapsible transactions section
  - [ ] Add status filter dropdown
  - [x] Show transaction list with customer emails
- [x] **Task 4.2: Parcels Section**
  - [ ] Add collapsible parcels section
  - [ ] Display parcel list with addresses and customer emails
  - [ ] Add "Mark Shipped" buttons
  - [x] Show verification totals (size summary table)
  - [ ] Add tracking number input fields
- [ ] **Task 4.3: Inventory Display**
  - [ ] Show current stock counts by size
  - [ ] Show allocated (pending) counts by size
  - [ ] Show shipped counts by size
  - [ ] Add warnings for low/negative inventory

## Data Requirements

### Transaction Data Needed

- Stripe payment ID
- Customer name and email
- Payment amount
- T-shirt sizes (from custom fields)
- Shipping address
- Payment date
- Local status (pending/shipped/delivered)

### Parcel Data Needed

- Combined transaction IDs (format: "txn1/txn2/txn3")
- Shipping address
- Customer names and emails (for multiple customers)
- All included transactions
- Size counts for the parcel
- Parcel status
- Ship date when marked as shipped
- Tracking number (added after shipping)

### Status Persistence

- Last updated timestamp
- Status for each transaction
- Update timestamps
- Tracking numbers by parcel/transaction

### Inventory Data

- Initial inventory counts by size
- Current inventory (calculated: initial - shipped)
- Allocated inventory (calculated: pending orders)
- Shipped inventory (calculated: completed orders)

## Data Directory Structure

```
data/
├── initial-inventory.json    # Your ordered shirt counts by size
├── fulfillment-status.json  # Order status and tracking info
└── .gitignore               # Don't commit sensitive data if needed
```

### Initial Inventory File Format

```
{
  "lastUpdated": "2024-01-01",
  "inventory": {
    "S": 25,
    "M": 50,
    "L": 40,
    "XL": 30,
    "XXL": 15
  }
}
```

### Status File Format (Updated)

```
{
  "lastUpdated": "2024-01-01",
  "transactionStatuses": {
    "pi_xxxxx": {
      "status": "shipped",
      "updatedAt": "2024-01-01",
      "trackingNumber": "1234567890"
    }
  },
  "parcelTracking": {
    "pi_xxxxx/pi_yyyyy": {
      "trackingNumber": "1234567890",
      "shippedAt": "2024-01-01"
    }
  }
}
```

## Success Criteria

- Can fetch and display all Stripe transactions with customer emails
- Can group transactions into parcels by address
- Can mark parcels as shipped and persist status
- Size counts match expectations
- Inventory tracking shows accurate remaining stock
- Can identify potential inventory shortfalls
- Can store and display tracking numbers
- Customer emails visible for communication
- Works in development environment only

## Future Enhancements

- Integration with Pirate Ship API (if available)
- Automated tracking number import
- Customer notification system
