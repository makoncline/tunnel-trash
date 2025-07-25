import Stripe from "stripe";
import { env } from "@/env";

let stripe: Stripe | null = null;

export function getStripeClient() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  stripe ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-04-30.basil",
  });
  return stripe;
}

// Helper to extract custom fields from Checkout Session
function getCustomFieldFromSession(
  customFields: Stripe.Checkout.Session.CustomField[] | null | undefined,
  targetKey: string,
): string {
  if (!customFields) {
    return "";
  }
  const field = customFields.find((cf) => cf.key === targetKey);

  if (field?.text?.value) {
    return field.text.value;
  }
  if (field?.numeric?.value) {
    return field.numeric.value;
  }
  if (field?.dropdown?.value) {
    return field.dropdown.value;
  }
  return "";
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface StripePaymentData {
  id: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: ShippingAddress;
  sizes: string[];
  createdAt: Date;
  status: string;
}

export interface ParcelData {
  id: string; // Combined transaction IDs: "txn1/txn2/txn3"
  transactionIds: string[];
  customerNames: string[];
  customerEmails: string[];
  shippingAddress: ShippingAddress;
  sizes: string[];
  totalAmount: number;
  currency: string;
  status: "pending" | "shipped" | "delivered";
  trackingNumber?: string;
  shippedAt?: Date;
}

export async function fetchSuccessfulPayments(): Promise<StripePaymentData[]> {
  const stripe = getStripeClient();

  try {
    // Fetch payment intents with more expanded data
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100,
      expand: [
        "data.customer",
        "data.charges.data.billing_details",
        "data.latest_charge",
      ],
    });

    console.log(`Found ${paymentIntents.data.length} payment intents`);
    const payments: StripePaymentData[] = [];

    for (const pi of paymentIntents.data) {
      // Only process successful payments
      if (pi.status !== "succeeded") continue;

      // Get customer info from multiple sources
      let customerName = "Unknown";
      let customerEmail = "unknown@email.com";

      // Check payment intent customer
      if (
        pi.customer &&
        typeof pi.customer === "object" &&
        !("deleted" in pi.customer)
      ) {
        customerName = pi.customer.name ?? customerName;
        customerEmail = pi.customer.email ?? customerEmail;
      }

      // Check receipt email
      if (pi.receipt_email) {
        customerEmail = pi.receipt_email;
      }

      // Check latest charge billing details
      if (pi.latest_charge && typeof pi.latest_charge === "object") {
        const charge = pi.latest_charge;
        if (charge.billing_details?.email) {
          customerEmail = charge.billing_details.email;
        }
        if (charge.billing_details?.name) {
          customerName = charge.billing_details.name;
        }
      }

      // Get shipping info
      const shipping = pi.shipping;
      const shippingName = shipping?.name ?? customerName;

      let shippingAddress = null;
      if (shipping?.address) {
        shippingAddress = {
          line1: shipping.address.line1 ?? "",
          line2: shipping.address.line2 ?? undefined,
          city: shipping.address.city ?? "",
          state: shipping.address.state ?? "",
          postal_code: shipping.address.postal_code ?? "",
          country: shipping.address.country ?? "",
        };
      }

      // Extract t-shirt sizes from multiple sources
      const sizes: string[] = [];

      // Check payment intent metadata first
      if (pi.metadata) {
        if (pi.metadata.custom_field_1) sizes.push(pi.metadata.custom_field_1);
        if (pi.metadata.custom_field_2) sizes.push(pi.metadata.custom_field_2);
        if (pi.metadata.shirt_size_1) sizes.push(pi.metadata.shirt_size_1);
        if (pi.metadata.shirt_size_2) sizes.push(pi.metadata.shirt_size_2);
        if (pi.metadata.size_1) sizes.push(pi.metadata.size_1);
        if (pi.metadata.size_2) sizes.push(pi.metadata.size_2);
      }

      // If no sizes found in metadata, check checkout session
      if (sizes.length === 0) {
        try {
          const checkoutSessions = await stripe.checkout.sessions.list({
            payment_intent: pi.id,
            limit: 1,
          });

          if (checkoutSessions.data.length > 0) {
            const session = checkoutSessions.data[0];
            if (session) {
              // Check session metadata
              if (session.metadata) {
                if (session.metadata.custom_field_1)
                  sizes.push(session.metadata.custom_field_1);
                if (session.metadata.custom_field_2)
                  sizes.push(session.metadata.custom_field_2);
                if (session.metadata.shirt_size_1)
                  sizes.push(session.metadata.shirt_size_1);
                if (session.metadata.shirt_size_2)
                  sizes.push(session.metadata.shirt_size_2);
              }

              // Check custom fields with various possible keys
              if (session.custom_fields) {
                // Look for all size-related fields
                for (const field of session.custom_fields) {
                  const fieldValue = getCustomFieldFromSession(
                    session.custom_fields,
                    field.key,
                  );

                  // Match various size field patterns
                  if (
                    fieldValue &&
                    (field.key === "size" ||
                      field.key === "sizeshirt2" ||
                      field.key === "custom_field_1" ||
                      field.key === "custom_field_2" ||
                      field.key === "shirt_size_1" ||
                      field.key === "shirt_size_2" ||
                      field.key === "size_1" ||
                      field.key === "size_2" ||
                      field.key.includes("size"))
                  ) {
                    sizes.push(fieldValue);
                  }
                }
              }

              // Also get customer email from session if we don't have it
              if (
                customerEmail === "unknown@email.com" &&
                session.customer_details?.email
              ) {
                customerEmail = session.customer_details.email;
              }
            }
          }
        } catch (error) {
          console.warn(
            `Could not retrieve checkout session for payment intent ${pi.id}:`,
            error,
          );
        }
      }

      // Include payment if we have shipping address (sizes are optional for now)
      if (shippingAddress) {
        payments.push({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          customerName: shippingName,
          customerEmail,
          shippingAddress,
          sizes,
          createdAt: new Date(pi.created * 1000),
          status: pi.status,
        });
      }
    }

    console.log(`Returning ${payments.length} payments`);
    return payments;
  } catch (error) {
    console.error("Error fetching Stripe payments:", error);
    throw new Error("Failed to fetch payments from Stripe");
  }
}

export function groupPaymentsIntoParcels(
  payments: StripePaymentData[],
): ParcelData[] {
  // Group payments by shipping address
  const addressGroups = new Map<string, StripePaymentData[]>();

  payments.forEach((payment) => {
    // Create a unique key for the shipping address
    const addressKey = [
      payment.shippingAddress.line1,
      payment.shippingAddress.line2 ?? "",
      payment.shippingAddress.city,
      payment.shippingAddress.state,
      payment.shippingAddress.postal_code,
      payment.shippingAddress.country,
    ]
      .join("|")
      .toLowerCase();

    if (!addressGroups.has(addressKey)) {
      addressGroups.set(addressKey, []);
    }
    addressGroups.get(addressKey)!.push(payment);
  });

  // Convert groups into parcels
  const parcels: ParcelData[] = [];

  addressGroups.forEach((groupedPayments) => {
    if (groupedPayments.length === 0) return;

    // Combine transaction IDs
    const transactionIds = groupedPayments.map((p) => p.id);
    const parcelId = transactionIds.map((id) => id.slice(-8)).join("/");

    // Collect unique customer info
    const customerNames = [
      ...new Set(groupedPayments.map((p) => p.customerName)),
    ];
    const customerEmails = [
      ...new Set(groupedPayments.map((p) => p.customerEmail)),
    ];

    // Combine all sizes
    const allSizes: string[] = [];
    groupedPayments.forEach((p) => {
      allSizes.push(...p.sizes);
    });

    // Calculate total amount
    const totalAmount = groupedPayments.reduce((sum, p) => sum + p.amount, 0);

    // Use the shipping address from the first payment (they should all be the same)
    const firstPayment = groupedPayments[0]!;
    const shippingAddress = firstPayment.shippingAddress;
    const currency = firstPayment.currency;

    parcels.push({
      id: parcelId,
      transactionIds,
      customerNames,
      customerEmails,
      shippingAddress,
      sizes: allSizes,
      totalAmount,
      currency,
      status: "pending", // Default status
      trackingNumber: undefined,
      shippedAt: undefined,
    });
  });

  // Sort parcels by total amount (highest first) for easier processing
  parcels.sort((a, b) => b.totalAmount - a.totalAmount);

  return parcels;
}
