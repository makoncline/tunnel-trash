import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markParcelAsShipped } from "../../lib/status";

const UpdateStatusSchema = z.object({
  parcelId: z.string().min(1, "Parcel ID is required"),
  transactionIds: z
    .array(z.string())
    .min(1, "At least one transaction ID is required"),
  action: z.literal("mark_shipped"),
  trackingNumber: z.string().optional(),
});

export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        success: false,
        error: "Not available in production",
      },
      { status: 403 },
    );
  }

  try {
    const rawBody: unknown = await request.json();
    const result = UpdateStatusSchema.safeParse(rawBody);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const body = result.data;

    switch (body.action) {
      case "mark_shipped":
        await markParcelAsShipped(
          body.parcelId,
          body.transactionIds,
          body.trackingNumber,
        );
        return NextResponse.json({
          success: true,
          message: "Parcel marked as shipped",
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Invalid action",
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Error updating status:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update status",
      },
      { status: 500 },
    );
  }
}
