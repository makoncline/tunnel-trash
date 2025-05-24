"use client";

import { useEffect, useState } from "react";
import { env } from "@/env";
import {
  fetchSuccessfulPayments,
  groupPaymentsIntoParcels,
  type StripePaymentData,
  type ParcelData,
  type ShippingAddress,
} from "./lib/stripe";
import type { FulfillmentApiResponse } from "./types";

export default function FulfillmentPage() {
  // Development-only guard
  if (process.env.NODE_ENV === "production") {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-6 text-3xl font-bold text-red-600">Access Denied</h1>
        <p>Fulfillment admin is only available in development mode.</p>
      </div>
    );
  }

  return <FulfillmentAdmin />;
}

function FulfillmentAdmin() {
  const [payments, setPayments] = useState<StripePaymentData[]>([]);
  const [parcels, setParcels] = useState<ParcelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTransactionsCollapsed, setIsTransactionsCollapsed] = useState(false);
  const [isParcelsCollapsed, setIsParcelsCollapsed] = useState(false);
  const [isUnshippedParcelsCollapsed, setIsUnshippedParcelsCollapsed] =
    useState(false);
  const [updatingParcel, setUpdatingParcel] = useState<string | null>(null);

  useEffect(() => {
    void fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const response = await fetch("/admin/fulfillment/api/data");
      const result: FulfillmentApiResponse = await response.json();

      if (result.success) {
        setPayments(
          result.data.payments.map((p) => ({
            ...p,
            createdAt: new Date(p.createdAt),
          })),
        );
        setParcels(result.data.parcels);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to connect to API");
      console.error("Error fetching payments:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkShipped = async (parcel: ParcelData) => {
    try {
      setUpdatingParcel(parcel.id);

      const response = await fetch("/admin/fulfillment/api/update-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parcelId: parcel.id,
          transactionIds: parcel.transactionIds,
          action: "mark_shipped",
          // TODO: Add tracking number input
        }),
      });

      const result: { success: boolean; error?: string; message?: string } =
        await response.json();

      if (result.success) {
        // Update local state instead of refetching
        setParcels((prevParcels) =>
          prevParcels.map((p) =>
            p.id === parcel.id
              ? {
                  ...p,
                  status: "shipped" as const,
                  shippedAt: new Date(),
                }
              : p,
          ),
        );

        // Update payments status for transactions in this parcel
        setPayments((prevPayments) =>
          prevPayments.map((payment) =>
            parcel.transactionIds.includes(payment.id)
              ? { ...payment, status: "shipped" }
              : payment,
          ),
        );
      } else {
        setError(result.error ?? "Failed to update status");
      }
    } catch (err) {
      setError("Failed to update parcel status");
      console.error("Error marking parcel as shipped:", err);
    } finally {
      setUpdatingParcel(null);
    }
  };

  const exportToPirateShipCSV = () => {
    // Filter to only pending parcels (ones that need shipping)
    const pendingParcels = parcels.filter(
      (parcel) => parcel.status === "pending",
    );

    if (pendingParcels.length === 0) {
      alert("No pending parcels to export");
      return;
    }

    // Create CSV headers using proper Pirate Ship field names
    const headers = [
      "Full Name",
      "Email",
      "Address 1",
      "Address 2",
      "City",
      "State",
      "Zipcode",
      "Country",
      "Override Weight (Ounces)", // Estimate weight for t-shirts
      "Parcel Id", // Use our parcel ID
      "Items", // Item details for easy reference
    ];

    // Convert parcels to CSV rows
    const rows = pendingParcels.map((parcel) => {
      // Sort sizes from small to large
      const sizeOrder = ["s", "m", "l", "xl", "xxl", "2xl"];
      const sortedSizes = parcel.sizes
        .map((size) => size.toLowerCase())
        .sort((a, b) => {
          const aIndex = sizeOrder.indexOf(a);
          const bIndex = sizeOrder.indexOf(b);

          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
          } else if (aIndex !== -1) {
            return -1;
          } else if (bIndex !== -1) {
            return 1;
          } else {
            return a.localeCompare(b);
          }
        });

      // Estimate weight: blank for singles (use default), 13.4oz for 2 shirts, ~7oz per shirt for others
      const estimatedWeight =
        parcel.sizes.length === 1
          ? ""
          : parcel.sizes.length === 2
            ? "13.4"
            : (parcel.sizes.length * 7).toString();

      const itemsReference = `${parcel.sizes.length}: [${sortedSizes.join(", ")}]`;

      return [
        parcel.customerNames[0] ?? "", // Full Name
        parcel.customerEmails[0] ?? "", // Email
        parcel.shippingAddress.line1, // Address 1
        parcel.shippingAddress.line2 ?? "", // Address 2
        parcel.shippingAddress.city, // City
        parcel.shippingAddress.state, // State
        parcel.shippingAddress.postal_code, // Zipcode
        parcel.shippingAddress.country, // Country
        estimatedWeight, // Override Weight (Ounces)
        parcel.id, // Order Id (our parcel ID)
        itemsReference, // Rubber Stamp 1 (item details)
      ];
    });

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map((row) => row.map((field) => `"${field}"`).join(","))
      .join("\n");

    // Create and download the file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `pirate-ship-labels-${new Date().toISOString().split("T")[0]}.csv`,
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatAddress = (address: ShippingAddress) => {
    return `${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.city}, ${address.state} ${address.postal_code}`;
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Fulfillment Admin</h1>

      {/* Transactions Section */}
      <div className="mb-6 rounded-lg border border-gray-300">
        <button
          onClick={() => setIsTransactionsCollapsed(!isTransactionsCollapsed)}
          className="flex w-full items-center justify-between border-b border-gray-300 bg-gray-50 p-4 text-left font-semibold hover:bg-gray-100"
        >
          <span>Transactions ({payments.length})</span>
          <span>{isTransactionsCollapsed ? "▼" : "▲"}</span>
        </button>

        {!isTransactionsCollapsed && (
          <div className="p-4">
            {loading && (
              <p className="py-4 text-center">Loading transactions...</p>
            )}

            {error && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 p-4">
                <p className="text-red-700">Error: {error}</p>
                <button
                  onClick={() => void fetchPayments()}
                  className="mt-2 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && payments.length === 0 && (
              <p className="py-4 text-center text-gray-500">
                No transactions found
              </p>
            )}

            {!loading && !error && payments.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 p-2 text-left">
                        ID
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Customer
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Email
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Sizes
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Amount
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Address
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 p-2 font-mono text-sm">
                          {payment.id.slice(-8)}
                        </td>
                        <td className="border border-gray-300 p-2">
                          {payment.customerName}
                        </td>
                        <td className="border border-gray-300 p-2 text-sm">
                          {payment.customerEmail}
                        </td>
                        <td className="border border-gray-300 p-2">
                          <span className="rounded bg-blue-100 px-2 py-1 text-sm text-blue-800">
                            {payment.sizes.join(", ")}
                          </span>
                        </td>
                        <td className="border border-gray-300 p-2">
                          {formatCurrency(payment.amount, payment.currency)}
                        </td>
                        <td className="border border-gray-300 p-2 text-sm">
                          {formatAddress(payment.shippingAddress)}
                        </td>
                        <td className="border border-gray-300 p-2 text-sm">
                          {payment.createdAt.toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Verification Totals */}
            {!loading && !error && payments.length > 0 && (
              <div className="mt-4 rounded bg-gray-50 p-4">
                <h3 className="mb-4 font-semibold">Size Summary:</h3>
                {(() => {
                  const sizeCounts: Record<string, number> = {};
                  payments.forEach((p) => {
                    p.sizes.forEach((size) => {
                      sizeCounts[size] = (sizeCounts[size] ?? 0) + 1;
                    });
                  });

                  // Sort sizes: S, M, L, XL, XXL/2XL, then alphabetically for any others
                  const sizeOrder = ["s", "m", "l", "xl", "xxl", "2xl"];
                  const sortedEntries = Object.entries(sizeCounts).sort(
                    ([a], [b]) => {
                      const aIndex = sizeOrder.indexOf(a.toLowerCase());
                      const bIndex = sizeOrder.indexOf(b.toLowerCase());

                      if (aIndex !== -1 && bIndex !== -1) {
                        return aIndex - bIndex;
                      } else if (aIndex !== -1) {
                        return -1;
                      } else if (bIndex !== -1) {
                        return 1;
                      } else {
                        return a.localeCompare(b);
                      }
                    },
                  );

                  const totalShirts = Object.values(sizeCounts).reduce(
                    (sum, count) => sum + count,
                    0,
                  );

                  return (
                    <div className="inline-block">
                      <table className="border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Size
                            </th>
                            <th className="border border-gray-300 px-4 py-2 text-left">
                              Qty
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedEntries.map(([size, count]) => (
                            <tr key={size}>
                              <td className="border border-gray-300 px-4 py-2 font-medium">
                                {size.toUpperCase()}
                              </td>
                              <td className="border border-gray-300 px-4 py-2">
                                {count}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-100 font-semibold">
                            <td className="border border-gray-300 px-4 py-2">
                              Total
                            </td>
                            <td className="border border-gray-300 px-4 py-2">
                              {totalShirts}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="mt-2 text-sm text-gray-600">
                        Total Transactions: {payments.length}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unshipped Parcels Section */}
      <div className="mb-6 rounded-lg border border-gray-300">
        <button
          onClick={() =>
            setIsUnshippedParcelsCollapsed(!isUnshippedParcelsCollapsed)
          }
          className="flex w-full items-center justify-between border-b border-gray-300 bg-gray-50 p-4 text-left font-semibold hover:bg-gray-100"
        >
          <span>
            Unshipped Parcels (
            {parcels.filter((p) => p.status === "pending").length})
          </span>
          <span>{isUnshippedParcelsCollapsed ? "▼" : "▲"}</span>
        </button>

        {!isUnshippedParcelsCollapsed && (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium text-gray-700">Ready to Ship</h3>
              <button
                onClick={exportToPirateShipCSV}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                Export CSV for Pirate Ship
              </button>
            </div>

            {loading && <p className="py-4 text-center">Loading parcels...</p>}

            {error && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 p-4">
                <p className="text-red-700">Error: {error}</p>
              </div>
            )}

            {!loading &&
              !error &&
              parcels.filter((p) => p.status === "pending").length === 0 && (
                <p className="py-4 text-center text-gray-500">
                  No unshipped parcels
                </p>
              )}

            {!loading &&
              !error &&
              parcels.filter((p) => p.status === "pending").length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 p-2 text-left">
                          Parcel ID
                        </th>
                        <th className="border border-gray-300 p-2 text-left">
                          Customer(s)
                        </th>
                        <th className="border border-gray-300 p-2 text-left">
                          Email(s)
                        </th>
                        <th className="border border-gray-300 p-2 text-left">
                          Sizes
                        </th>
                        <th className="border border-gray-300 p-2 text-left">
                          Total Amount
                        </th>
                        <th className="border border-gray-300 p-2 text-left">
                          Address
                        </th>
                        <th className="border border-gray-300 p-2 text-left">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parcels
                        .filter((p) => p.status === "pending")
                        .map((parcel) => (
                          <tr key={parcel.id} className="hover:bg-gray-50">
                            <td className="border border-gray-300 p-2 font-mono text-sm">
                              {parcel.id}
                            </td>
                            <td className="border border-gray-300 p-2">
                              {parcel.customerNames.join(", ")}
                            </td>
                            <td className="border border-gray-300 p-2 text-sm">
                              {parcel.customerEmails.join(", ")}
                            </td>
                            <td className="border border-gray-300 p-2">
                              <span className="rounded bg-blue-100 px-2 py-1 text-sm text-blue-800">
                                {parcel.sizes.join(", ")}
                              </span>
                            </td>
                            <td className="border border-gray-300 p-2">
                              {formatCurrency(
                                parcel.totalAmount,
                                parcel.currency,
                              )}
                            </td>
                            <td className="border border-gray-300 p-2 text-sm">
                              {formatAddress(parcel.shippingAddress)}
                            </td>
                            <td className="border border-gray-300 p-2">
                              <button
                                onClick={() => handleMarkShipped(parcel)}
                                disabled={updatingParcel === parcel.id}
                                className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                              >
                                {updatingParcel === parcel.id
                                  ? "Updating..."
                                  : "Mark Shipped"}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

            {/* Unshipped Parcel Summary */}
            {!loading &&
              !error &&
              parcels.filter((p) => p.status === "pending").length > 0 && (
                <div className="mt-4 rounded bg-gray-50 p-4">
                  <h3 className="mb-4 font-semibold">Unshipped Summary:</h3>
                  {(() => {
                    const unshippedParcels = parcels.filter(
                      (p) => p.status === "pending",
                    );
                    const parcelSizeCounts: Record<string, number> = {};
                    unshippedParcels.forEach((parcel) => {
                      parcel.sizes.forEach((size) => {
                        parcelSizeCounts[size] =
                          (parcelSizeCounts[size] ?? 0) + 1;
                      });
                    });

                    // Sort sizes: S, M, L, XL, XXL/2XL, then alphabetically for any others
                    const sizeOrder = ["s", "m", "l", "xl", "xxl", "2xl"];
                    const sortedEntries = Object.entries(parcelSizeCounts).sort(
                      ([a], [b]) => {
                        const aIndex = sizeOrder.indexOf(a.toLowerCase());
                        const bIndex = sizeOrder.indexOf(b.toLowerCase());

                        if (aIndex !== -1 && bIndex !== -1) {
                          return aIndex - bIndex;
                        } else if (aIndex !== -1) {
                          return -1;
                        } else if (bIndex !== -1) {
                          return 1;
                        } else {
                          return a.localeCompare(b);
                        }
                      },
                    );

                    const totalShirts = Object.values(parcelSizeCounts).reduce(
                      (sum, count) => sum + count,
                      0,
                    );

                    return (
                      <div className="inline-block">
                        <table className="border-collapse border border-gray-300">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="border border-gray-300 px-4 py-2 text-left">
                                Size
                              </th>
                              <th className="border border-gray-300 px-4 py-2 text-left">
                                Qty
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedEntries.map(([size, count]) => (
                              <tr key={size}>
                                <td className="border border-gray-300 px-4 py-2 font-medium">
                                  {size.toUpperCase()}
                                </td>
                                <td className="border border-gray-300 px-4 py-2">
                                  {count}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-gray-100 font-semibold">
                              <td className="border border-gray-300 px-4 py-2">
                                Total
                              </td>
                              <td className="border border-gray-300 px-4 py-2">
                                {totalShirts}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p className="mt-2 text-sm text-gray-600">
                          Unshipped Parcels: {unshippedParcels.length}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
          </div>
        )}
      </div>

      {/* All Parcels Section */}
      <div className="mb-6 rounded-lg border border-gray-300">
        <button
          onClick={() => setIsParcelsCollapsed(!isParcelsCollapsed)}
          className="flex w-full items-center justify-between border-b border-gray-300 bg-gray-50 p-4 text-left font-semibold hover:bg-gray-100"
        >
          <span>All Parcels ({parcels.length})</span>
          <span>{isParcelsCollapsed ? "▼" : "▲"}</span>
        </button>

        {!isParcelsCollapsed && (
          <div className="p-4">
            <h3 className="mb-4 font-medium text-gray-700">Complete History</h3>

            {loading && <p className="py-4 text-center">Loading parcels...</p>}

            {error && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 p-4">
                <p className="text-red-700">Error: {error}</p>
              </div>
            )}

            {!loading && !error && parcels.length === 0 && (
              <p className="py-4 text-center text-gray-500">No parcels found</p>
            )}

            {!loading && !error && parcels.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 p-2 text-left">
                        Parcel ID
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Customer(s)
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Email(s)
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Sizes
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Total Amount
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Address
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Status
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcels.map((parcel) => (
                      <tr key={parcel.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 p-2 font-mono text-sm">
                          {parcel.id}
                        </td>
                        <td className="border border-gray-300 p-2">
                          {parcel.customerNames.join(", ")}
                        </td>
                        <td className="border border-gray-300 p-2 text-sm">
                          {parcel.customerEmails.join(", ")}
                        </td>
                        <td className="border border-gray-300 p-2">
                          <span className="rounded bg-blue-100 px-2 py-1 text-sm text-blue-800">
                            {parcel.sizes.join(", ")}
                          </span>
                        </td>
                        <td className="border border-gray-300 p-2">
                          {formatCurrency(parcel.totalAmount, parcel.currency)}
                        </td>
                        <td className="border border-gray-300 p-2 text-sm">
                          {formatAddress(parcel.shippingAddress)}
                        </td>
                        <td className="border border-gray-300 p-2">
                          <span
                            className={`rounded px-2 py-1 text-sm ${
                              parcel.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : parcel.status === "shipped"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-green-100 text-green-800"
                            }`}
                          >
                            {parcel.status}
                          </span>
                        </td>
                        <td className="border border-gray-300 p-2">
                          {parcel.status === "pending" && (
                            <button
                              onClick={() => handleMarkShipped(parcel)}
                              disabled={updatingParcel === parcel.id}
                              className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                            >
                              {updatingParcel === parcel.id
                                ? "Updating..."
                                : "Mark Shipped"}
                            </button>
                          )}
                          {parcel.status === "shipped" &&
                            parcel.trackingNumber && (
                              <span className="text-sm text-gray-600">
                                Tracking: {parcel.trackingNumber}
                              </span>
                            )}
                          {parcel.status === "shipped" &&
                            !parcel.trackingNumber && (
                              <span className="text-sm text-green-600">
                                Shipped ✓
                              </span>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* All Parcels Summary */}
            {!loading && !error && parcels.length > 0 && (
              <div className="mt-4 rounded bg-gray-50 p-4">
                <h3 className="mb-4 font-semibold">Complete Summary:</h3>
                {(() => {
                  const parcelSizeCounts: Record<string, number> = {};
                  parcels.forEach((parcel) => {
                    parcel.sizes.forEach((size) => {
                      parcelSizeCounts[size] =
                        (parcelSizeCounts[size] ?? 0) + 1;
                    });
                  });

                  // Sort sizes: S, M, L, XL, XXL/2XL, then alphabetically for any others
                  const sizeOrder = ["s", "m", "l", "xl", "xxl", "2xl"];
                  const sortedEntries = Object.entries(parcelSizeCounts).sort(
                    ([a], [b]) => {
                      const aIndex = sizeOrder.indexOf(a.toLowerCase());
                      const bIndex = sizeOrder.indexOf(b.toLowerCase());

                      if (aIndex !== -1 && bIndex !== -1) {
                        return aIndex - bIndex;
                      } else if (aIndex !== -1) {
                        return -1;
                      } else if (bIndex !== -1) {
                        return 1;
                      } else {
                        return a.localeCompare(b);
                      }
                    },
                  );

                  const totalShirts = Object.values(parcelSizeCounts).reduce(
                    (sum, count) => sum + count,
                    0,
                  );

                  const shippedParcels = parcels.filter(
                    (p) => p.status === "shipped",
                  );
                  const pendingParcels = parcels.filter(
                    (p) => p.status === "pending",
                  );

                  return (
                    <div className="flex gap-6">
                      <div className="inline-block">
                        <table className="border-collapse border border-gray-300">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="border border-gray-300 px-4 py-2 text-left">
                                Size
                              </th>
                              <th className="border border-gray-300 px-4 py-2 text-left">
                                Total Qty
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedEntries.map(([size, count]) => (
                              <tr key={size}>
                                <td className="border border-gray-300 px-4 py-2 font-medium">
                                  {size.toUpperCase()}
                                </td>
                                <td className="border border-gray-300 px-4 py-2">
                                  {count}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-gray-100 font-semibold">
                              <td className="border border-gray-300 px-4 py-2">
                                Total
                              </td>
                              <td className="border border-gray-300 px-4 py-2">
                                {totalShirts}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>
                          <strong>Total Parcels:</strong> {parcels.length}
                        </p>
                        <p>
                          <strong>Shipped:</strong> {shippedParcels.length}
                        </p>
                        <p>
                          <strong>Pending:</strong> {pendingParcels.length}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
