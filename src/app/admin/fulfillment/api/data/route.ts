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
    
    // Get transaction statuses BEFORE grouping so we can apply them to payments
    const transactionStatuses = await getAllTransactionStatuses();
    const parcelStatuses = await getAllParcelStatuses();

    // Apply statuses to payments before grouping
    const paymentsWithStatus = payments.map((payment) => ({
      ...payment,
      status: transactionStatuses[payment.id] ?? "pending",
    }));

    // Group payments (now with correct statuses) into parcels
    const parcels = groupPaymentsIntoParcels(paymentsWithStatus);

    // Build a reverse map: transactionId -> stored parcel data
    // This helps us find tracking info even when parcel.id changed due to new grouping logic
    const transactionToParcelMap = new Map<
      string,
      {
        status: "pending" | "shipped" | "delivered";
        trackingNumber?: string;
        shippedAt?: string;
      }
    >();

    Object.values(parcelStatuses).forEach((storedParcel) => {
      storedParcel.transactionIds.forEach((transactionId) => {
        transactionToParcelMap.set(transactionId, {
          status: storedParcel.status,
          trackingNumber: storedParcel.trackingNumber,
          shippedAt: storedParcel.shippedAt,
        });
      });
    });

    // Update parcel statuses and tracking info from stored data
    const updatedParcels = parcels.map((parcel) => {
      // First try direct parcel.id lookup (for existing parcels)
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

      // Fallback: if parcel.id doesn't match, check if all transactions in this parcel
      // were previously shipped together (for single-transaction parcels, this works too)
      if (parcel.transactionIds.length > 0) {
        const firstTransactionData = transactionToParcelMap.get(
          parcel.transactionIds[0]!,
        );

        if (firstTransactionData) {
          // Check if all transactions have the same status (they should if grouped correctly)
          const allSameStatus = parcel.transactionIds.every(
            (tid) =>
              transactionToParcelMap.get(tid)?.status ===
              firstTransactionData.status,
          );

          if (allSameStatus) {
            return {
              ...parcel,
              status: firstTransactionData.status,
              trackingNumber: firstTransactionData.trackingNumber,
              shippedAt: firstTransactionData.shippedAt
                ? new Date(firstTransactionData.shippedAt)
                : undefined,
            };
          }
        }
      }

      return parcel; // Keep original status (pending for new parcels)
    });

    // Payment statuses are already set above
    const updatedPayments = paymentsWithStatus;

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
