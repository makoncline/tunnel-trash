import { NextResponse } from "next/server";
import {
  fetchSuccessfulPayments,
  groupPaymentsIntoParcels,
} from "../../lib/stripe";
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

    return NextResponse.json({
      success: true,
      data: {
        payments,
        parcels,
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
