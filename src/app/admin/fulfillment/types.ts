import type { StripePaymentData, ParcelData } from "./lib/stripe";

// Shared API response type
export type FulfillmentApiResponse =
  | {
      success: true;
      data: {
        payments: StripePaymentData[];
        parcels: ParcelData[];
        summary: {
          totalPayments: number;
          totalParcels: number;
          totalAmount: number;
        };
      };
    }
  | {
      success: false;
      error: string;
    };
