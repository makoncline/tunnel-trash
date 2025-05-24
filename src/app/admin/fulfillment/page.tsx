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

      {/* Parcels Section */}
      <div className="mb-6 rounded-lg border border-gray-300">
        <button
          onClick={() => setIsParcelsCollapsed(!isParcelsCollapsed)}
          className="flex w-full items-center justify-between border-b border-gray-300 bg-gray-50 p-4 text-left font-semibold hover:bg-gray-100"
        >
          <span>Parcels ({parcels.length})</span>
          <span>{isParcelsCollapsed ? "▼" : "▲"}</span>
        </button>

        {!isParcelsCollapsed && (
          <div className="p-4">
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
                            <button className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
                              Mark Shipped
                            </button>
                          )}
                          {parcel.status === "shipped" &&
                            parcel.trackingNumber && (
                              <span className="text-sm text-gray-600">
                                Tracking: {parcel.trackingNumber}
                              </span>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Parcel Summary */}
            {!loading && !error && parcels.length > 0 && (
              <div className="mt-4 rounded bg-gray-50 p-4">
                <h3 className="mb-4 font-semibold">Parcel Summary:</h3>
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
                        Total Parcels: {parcels.length}
                      </p>
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
