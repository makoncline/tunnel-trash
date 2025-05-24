import { NextResponse } from "next/server";
import { fetchSuccessfulPayments } from "../../lib/stripe";
import { env } from "@/env";

export async function GET() {
  // Only allow in development environment
  if (env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  console.log("API route called, starting Stripe fetch...");

  try {
    console.log("Calling fetchSuccessfulPayments...");
    const payments = await fetchSuccessfulPayments();
    console.log(`API route got ${payments.length} payments`);

    return NextResponse.json({
      success: true,
      data: payments,
      count: payments.length,
    });
  } catch (error) {
    console.error("Error in API route:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch payment data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
