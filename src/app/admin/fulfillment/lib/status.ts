import { promises as fs } from "fs";
import path from "path";

// Simplified parcel-centric status structure
export interface FulfillmentStatus {
  lastUpdated: string;
  parcels: Record<
    string,
    {
      status: "pending" | "shipped" | "delivered";
      transactionIds: string[];
      shippedAt?: string;
      trackingNumber?: string;
      updatedAt: string;
    }
  >;
}

const STATUS_FILE_PATH = path.join(
  process.cwd(),
  "data",
  "fulfillment-status.json",
);

// Ensure data directory exists
async function ensureDataDirectory() {
  const dataDir = path.join(process.cwd(), "data");
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Read status from JSON file
export async function readFulfillmentStatus(): Promise<FulfillmentStatus> {
  try {
    await ensureDataDirectory();
    const data = await fs.readFile(STATUS_FILE_PATH, "utf-8");
    return JSON.parse(data) as FulfillmentStatus;
  } catch (error) {
    // Return default structure if file doesn't exist
    return {
      lastUpdated: new Date().toISOString(),
      parcels: {},
    };
  }
}

// Write status to JSON file
export async function writeFulfillmentStatus(
  status: FulfillmentStatus,
): Promise<void> {
  try {
    await ensureDataDirectory();
    status.lastUpdated = new Date().toISOString();
    await fs.writeFile(STATUS_FILE_PATH, JSON.stringify(status, null, 2));
  } catch (error) {
    console.error("Error writing fulfillment status:", error);
    throw new Error("Failed to save fulfillment status");
  }
}

// Update parcel status to shipped
export async function markParcelAsShipped(
  parcelId: string,
  transactionIds: string[],
  trackingNumber?: string,
): Promise<void> {
  const status = await readFulfillmentStatus();

  // Update parcel status
  status.parcels[parcelId] = {
    status: "shipped",
    transactionIds,
    shippedAt: new Date().toISOString(),
    trackingNumber,
    updatedAt: new Date().toISOString(),
  };

  await writeFulfillmentStatus(status);
}

// Get status for a specific parcel
export async function getParcelStatus(
  parcelId: string,
): Promise<"pending" | "shipped" | "delivered"> {
  const status = await readFulfillmentStatus();
  return status.parcels[parcelId]?.status ?? "pending";
}

// Get all parcel statuses
export async function getAllParcelStatuses(): Promise<
  Record<
    string,
    {
      status: "pending" | "shipped" | "delivered";
      transactionIds: string[];
      shippedAt?: string;
      trackingNumber?: string;
      updatedAt: string;
    }
  >
> {
  const status = await readFulfillmentStatus();
  return status.parcels;
}

// Helper function to get transaction status based on parcel status
export async function getTransactionStatus(
  transactionId: string,
): Promise<"pending" | "shipped" | "delivered"> {
  const status = await readFulfillmentStatus();

  // Find which parcel contains this transaction
  for (const parcelData of Object.values(status.parcels)) {
    if (parcelData.transactionIds.includes(transactionId)) {
      return parcelData.status;
    }
  }

  return "pending";
}

// Get all transaction statuses (derived from parcel statuses)
export async function getAllTransactionStatuses(): Promise<
  Record<string, "pending" | "shipped" | "delivered">
> {
  const status = await readFulfillmentStatus();
  const transactionStatuses: Record<
    string,
    "pending" | "shipped" | "delivered"
  > = {};

  // Build transaction status map from parcel data
  Object.values(status.parcels).forEach((parcelData) => {
    parcelData.transactionIds.forEach((transactionId) => {
      transactionStatuses[transactionId] = parcelData.status;
    });
  });

  return transactionStatuses;
}
