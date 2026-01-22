"use client";

import { useState } from "react";

type SizeKey = "S" | "M" | "L" | "XL" | "XXL";

interface SizeSelectorProps {
  inventory: Record<SizeKey, number>;
}

export default function SizeSelector({ inventory }: SizeSelectorProps) {
  const sizes: SizeKey[] = ["S", "M", "L", "XL", "XXL"];
  const [selectedSize, setSelectedSize] = useState<SizeKey | null>(null);

  return (
    <div className="mb-6">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        Select size
      </div>
      <div className="grid grid-cols-5 gap-2">
        {sizes.map((size) => {
          const remaining = inventory[size];
          const isSoldOut = remaining <= 0;
          const isSelected = selectedSize === size;

          return (
            <button
              key={size}
              type="button"
              onClick={() => setSelectedSize(size)}
              disabled={isSoldOut}
              className={[
                "relative flex h-12 items-center justify-center rounded border text-sm font-semibold transition",
                isSoldOut
                  ? "cursor-not-allowed border-gray-200 text-gray-300"
                  : "border-gray-300 text-gray-900 hover:border-gray-900",
                isSelected ? "border-gray-900 ring-1 ring-gray-900" : "",
              ].join(" ")}
              aria-pressed={isSelected}
            >
              <span className={isSoldOut ? "text-gray-300" : ""}>{size}</span>
              {isSoldOut ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="h-px w-10/12 -rotate-12 bg-gray-300" />
                </span>
              ) : (
                <span className="absolute -right-1.5 -top-1.5 rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                  {remaining}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Limited inventory. Ships in 3 business days.
      </p>
    </div>
  );
}
