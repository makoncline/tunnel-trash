import { NextResponse } from "next/server";
import {
  fetchSuccessfulPayments,
  groupPaymentsIntoParcels,
} from "../../lib/stripe";
import {
  getAllTransactionStatuses,
  getAllParcelStatuses,
} from "../../lib/status";
import type { FulfillmentApiResponse } from "../../types";

export async function GET(): Promise<NextResponse<FulfillmentApiResponse>> {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({
      success: false,
      error: "Not available in production",
    });
  }

  try {
    const payments = await fetchSuccessfulPayments();
    const parcels = groupPaymentsIntoParcels(payments);
    const transactionStatuses = await getAllTransactionStatuses();
    const parcelStatuses = await getAllParcelStatuses();

    // Update parcel statuses and tracking info from stored data
    const updatedParcels = parcels.map((parcel) => {
      const storedParcel = parcelStatuses[parcel.id];

      if (storedParcel) {
        return {
          ...parcel,
          status: storedParcel.status,
          trackingNumber: storedParcel.trackingNumber,
          shippedAt: storedParcel.shippedAt
            ? new Date(storedParcel.shippedAt)
            : undefined,
        };
      }

      return parcel; // Keep original pending status
    });

    // Update payment statuses (derived from parcel statuses)
    const updatedPayments = payments.map((payment) => ({
      ...payment,
      status: transactionStatuses[payment.id] ?? "pending",
    }));

    return NextResponse.json({
      success: true,
      data: {
        payments: updatedPayments,
        parcels: updatedParcels,
        summary: {
          totalPayments: payments.length,
          totalParcels: parcels.length,
          totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
        },
      },
    });
  } catch (error) {
    console.error("Error in fulfillment API:", error);
    return NextResponse.json({
      success: false,
      error: "Failed to fetch fulfillment data",
    });
  }
}
