"use client";

import { Button } from "@/components/ui/button";

interface BuyButtonProps {
  paymentLink: string;
}

export default function BuyButton({ paymentLink }: BuyButtonProps) {
  const handleClick = () => {
    if (paymentLink) {
      window.open(paymentLink, "_blank");
    }
  };

  return (
    <Button size="lg" className="mb-6 w-full" onClick={handleClick}>
      Buy Now
    </Button>
  );
}
