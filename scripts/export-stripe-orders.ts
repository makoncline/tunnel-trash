import "dotenv/config";
import Stripe from "stripe";
import { stringify } from "csv-stringify";
import { writeFileSync } from "fs";

// Initialize Stripe
// The Stripe SDK will use its default API version if not specified.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Output CSV path
const OUTPUT_CSV = "stripe-orders.csv";

interface OrderRow {
  name: string;
  email: string;
  address: string;
  shirtSize1: string;
  shirtSize2: string;
  paymentId: string;
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
  // Assuming text custom field as per typical "Value" field structure
  // Stripe API for custom_fields: type is 'text', 'numeric', or 'dropdown'
  // For 'text', value is in field.text.value
  // For 'numeric', value is in field.numeric.value
  // For 'dropdown', value is in field.dropdown.value (which is an option ID)
  // We'll prioritize text, then numeric. Dropdown would need more logic to map option ID to label.
  if (field?.text?.value) {
    return field.text.value;
  }
  if (field?.numeric?.value) {
    return field.numeric.value;
  }
  // If it's a dropdown, field.dropdown.value would be the selected option ID.
  // For this script, we'll return it directly. A more advanced script might map this ID to a display name.
  if (field?.dropdown?.value) {
    return field.dropdown.value;
  }
  return "";
}

async function main() {
  // Fetch all successful payment_intents
  const payments = await stripe.paymentIntents.list({
    limit: 100, // adjust as needed
    expand: ["data.customer"], // Expand customer data
  });

  const rows: OrderRow[] = [];

  for (const payment of payments.data) {
    // Only process succeeded payments
    if (payment.status !== "succeeded") continue;

    // Get customer details
    let customerIdentifier = "";
    if (payment.customer) {
      if (typeof payment.customer === "string") {
        customerIdentifier = payment.customer;
      } else if ("email" in payment.customer && payment.customer.email) {
        customerIdentifier = payment.customer.email;
      } else if ("id" in payment.customer) {
        customerIdentifier = payment.customer.id;
      }
    }

    const customerEmail = payment.receipt_email ?? customerIdentifier ?? "";
    const shipping = payment.shipping;
    const name = shipping?.name ?? "";

    let addressString = "";
    if (shipping?.address) {
      const { line1, line2, city, state, postal_code, country } =
        shipping.address;
      addressString = [line1, line2, city, state, postal_code, country]
        .filter(Boolean)
        .join(", ");
    }

    let shirtSize1 = "";
    let shirtSize2 = "";

    // Attempt to retrieve Checkout Session to get custom fields
    if (payment.id) {
      try {
        const checkoutSessions = await stripe.checkout.sessions.list({
          payment_intent: payment.id,
          limit: 1,
          // expand: ['custom_fields'] // custom_fields are usually included by default
        });

        if (checkoutSessions.data.length > 0) {
          const session = checkoutSessions.data[0];
          if (session) {
            // IMPORTANT: 'custom_field_1' and 'custom_field_2' are assumed keys.
            // Update these string literals if your Stripe setup uses different keys for shirt sizes.
            shirtSize1 = getCustomFieldFromSession(
              session.custom_fields,
              "custom_field_1",
            );
            shirtSize2 = getCustomFieldFromSession(
              session.custom_fields,
              "custom_field_2",
            );
          }
        }
      } catch (error) {
        console.warn(
          `Could not retrieve checkout session for payment intent ${payment.id}:`,
          error,
        );
      }
    }

    rows.push({
      name,
      email: customerEmail,
      address: addressString,
      shirtSize1,
      shirtSize2,
      paymentId: payment.id,
    });
  }

  // Write to CSV
  const csvContent = await new Promise<string>((resolve, reject) => {
    stringify(
      rows,
      {
        header: true,
        columns: [
          { key: "name", header: "Name" },
          { key: "email", header: "Email" },
          { key: "address", header: "Address" },
          { key: "shirtSize1", header: "Shirt Size 1" },
          { key: "shirtSize2", header: "Shirt Size 2" },
          { key: "paymentId", header: "Payment ID" },
        ],
      },
      (err, output) => {
        if (err) reject(err);
        else resolve(output);
      },
    );
  });

  writeFileSync(OUTPUT_CSV, csvContent);

  console.log(`Exported ${rows.length} orders to ${OUTPUT_CSV}`);
}

main().catch((err) => {
  console.error("Error exporting Stripe orders:", err);
  process.exit(1);
});
