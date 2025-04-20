import Image from "next/image";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { env } from "@/env.js";

// Create a client component for the Buy button
import BuyButton from "@/components/BuyButton";

export const metadata = {
  title: "Eisenhower Tee - Tunnel Trash",
  description:
    "Proudly rep your 'Tunnel Trash' status with our Eisenhower Tee. For every powder chaser who braves the infamous tunnel from Denver to the slopes. 100% cotton, screen printed, and designed for the true Colorado weekend warrior.",
};

export default function HomePage() {
  // Define default values for environment variables
  const eisenhowerPrice = process.env.NEXT_PUBLIC_EISENHOWER_PRICE ?? "32";
  const shippingPrice = process.env.NEXT_PUBLIC_SHIPPING_PRICE ?? "6";
  const stripePaymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? "";

  // Product JSON-LD structured data for SEO
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Eisenhower Tee - Tunnel Trash",
    description:
      "Screen printed on a Comfort Colors 100% Cotton Pocket T-shirt. A shirt celebrating Denver skiers who brave the Eisenhower Tunnel to hit the slopes.",
    image: [
      "https://tunneltrash.com/assets/back_large.png",
      "https://tunneltrash.com/assets/front_large.png",
    ],
    brand: {
      "@type": "Brand",
      name: "Tunnel Trash",
    },
    offers: {
      "@type": "Offer",
      price: eisenhowerPrice,
      priceCurrency: "USD",
      availability: "https://schema.org/PreOrder",
      url: "https://tunneltrash.com",
    },
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Add JSON-LD to the page */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      {/* Header */}
      <header className="flex justify-center py-8">
        <Image
          src="/assets/logo-text.png"
          alt="Tunnel Trash Logo"
          width={300}
          height={100}
          priority
        />
      </header>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Product Images */}
        <Carousel className="mb-8 w-full">
          <CarouselContent>
            <CarouselItem>
              <div className="flex justify-center">
                <Image
                  src="/assets/back_large.png"
                  alt="T-shirt Back"
                  width={500}
                  height={500}
                  className="rounded-md"
                />
              </div>
            </CarouselItem>
            <CarouselItem>
              <div className="flex justify-center">
                <Image
                  src="/assets/front_large.png"
                  alt="T-shirt Front"
                  width={500}
                  height={500}
                  className="rounded-md"
                />
              </div>
            </CarouselItem>
          </CarouselContent>
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
        </Carousel>

        {/* Product Details */}
        <div className="mb-8 flex justify-center">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-3xl font-bold">Eisenhower Tee</h1>
            <p className="mb-6 text-2xl font-semibold">${eisenhowerPrice}</p>
            <p className="mb-6 text-sm text-gray-600">
              + ${shippingPrice} shipping
            </p>

            <BuyButton paymentLink={stripePaymentLink} />

            <Accordion type="single" collapsible className="w-full text-left">
              <AccordionItem value="story">
                <AccordionTrigger>The Story</AccordionTrigger>
                <AccordionContent>
                  <p className="mb-2">
                    If you&apos;ve ever made the drive from Denver to the
                    slopes, you know it&apos;s not all fresh powder and smooth
                    sailing—there&apos;s that infamous challenge known as the
                    Eisenhower Tunnel. Mountain locals lovingly (or maybe
                    not-so-lovingly) call us &quot;Tunnel Trash.&quot;
                  </p>
                  <p>
                    When I first heard it, I laughed and immediately embraced
                    it. Why hide from it? This tee is for every proud weekend
                    warrior, dedicated powder chaser, and brave traffic-battling
                    skier who wears their Tunnel Trash badge loud and proud.
                    Join the club and rep your status!
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="product-details">
                <AccordionTrigger>Product Details</AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-2">
                    <li>
                      • Screen printed on a Comfort Colors 100% Cotton Pocket
                      T-shirt, 6.1 oz
                    </li>
                    <li>• Made from 100% pre-shrunk cotton</li>
                    <li>
                      • Garment dyeing process creates a unique patina and
                      vintage feel on every shirt
                    </li>
                    <li>
                      •{" "}
                      <a
                        href="https://www.customink.com/items/sizing/175800_lineup/standard.htm"
                        className="text-blue-600 underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Size Guide
                      </a>
                    </li>
                  </ul>
                  <div className="mt-4 border-t pt-4">
                    <h4 className="mb-2 font-medium">Care Instructions</h4>
                    <p>
                      Machine wash cold when necessary; hang dry recommended.
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="shipping-returns">
                <AccordionTrigger>Shipping & Returns</AccordionTrigger>
                <AccordionContent>
                  <h4 className="mb-2 font-medium">Pre-Order System</h4>
                  <p className="mb-3">
                    This product is available through a pre-order system.
                    Here&apos;s how it works:
                  </p>
                  <ol className="mb-4 list-decimal space-y-1 pl-5">
                    <li>Orders are collected throughout each month.</li>
                    <li>
                      At month&apos;s end, a bulk order is placed for all shirts
                      ordered during that time.
                    </li>
                    <li>
                      Once the shirts arrive, they&apos;ll be shipped directly
                      to you.
                    </li>
                  </ol>
                  <p className="mb-3">
                    Please allow 3-6 weeks for delivery depending on your order
                    date and production timeline.
                  </p>

                  <div className="mt-4 border-t pt-4">
                    <h4 className="mb-2 font-medium">Shipping Details</h4>
                    <p className="mb-2">
                      Shipping cost is calculated at checkout per order within
                      the United States.
                    </p>
                    <p className="mb-3">
                      You&apos;ll receive a shipping confirmation and tracking
                      information once your order ships.
                    </p>
                  </div>

                  <div className="mt-4 border-t pt-4">
                    <h4 className="mb-2 font-medium">Cancellations</h4>
                    <p>
                      If you need to cancel your order before shipment, please
                      contact{" "}
                      <a
                        href="mailto:Makon@hey.com"
                        className="text-blue-600 underline"
                      >
                        Makon@hey.com
                      </a>
                      .
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
    </main>
  );
}
