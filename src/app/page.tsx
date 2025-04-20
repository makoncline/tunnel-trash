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

// Create a client component for the Buy button
import BuyButton from "@/components/BuyButton";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
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
        <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <h1 className="mb-4 text-3xl font-bold">Eisenhower Tee</h1>
            <p className="mb-6 text-2xl font-semibold">
              ${process.env.PRICE ?? "50"}
            </p>
            <p className="mb-6 text-sm text-gray-600">+ $6 shipping</p>

            <BuyButton
              paymentLink={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? ""}
            />

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="product-details">
                <AccordionTrigger>Product Details</AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-2">
                    <li>
                      • Screen printed on a Comfort Colors 100% Cotton Pocket
                      T-shirt, 6.1 oz
                    </li>
                    <li>• 100% pre-shrunk cotton</li>
                    <li>
                      • Garment dye process creates a unique patina and vintage
                      feel on each shirt
                    </li>
                    <li>
                      •{" "}
                      <a
                        href="https://www.customink.com/items/sizing/175800_lineup/standard.htm"
                        className="text-blue-600 underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Size guide
                      </a>
                    </li>
                  </ul>
                  <div className="mt-4 border-t pt-4">
                    <h4 className="mb-2 font-medium">Care Instructions</h4>
                    <p>Machine wash on cold if necessary and hang dry.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="shipping-returns">
                <AccordionTrigger>Shipping & Returns</AccordionTrigger>
                <AccordionContent>
                  <h4 className="mb-2 font-medium">Pre-Order System</h4>
                  <p className="mb-3">
                    This is a pre-order item. Here&apos;s how it works:
                  </p>
                  <ol className="mb-4 list-decimal space-y-1 pl-5">
                    <li>Orders are collected throughout the month</li>
                    <li>
                      At the end of each month, I place a bulk order for all
                      shirts ordered during that period
                    </li>
                    <li>
                      Once I receive the shirts, I&apos;ll ship them out to you
                    </li>
                  </ol>
                  <p className="mb-3">
                    Due to this process, please allow 3-6 weeks for delivery
                    from your order date. The timing depends on when in the
                    month you place your order and production time.
                  </p>

                  <div className="mt-4 border-t pt-4">
                    <h4 className="mb-2 font-medium">Shipping Details</h4>
                    <p className="mb-2">
                      Shipping is $6 per order within the United States.
                    </p>
                    <p className="mb-3">
                      You&apos;ll receive a shipping confirmation with tracking
                      information once your order ships.
                    </p>
                  </div>

                  <div className="mt-4 border-t pt-4">
                    <h4 className="mb-2 font-medium">Cancellations</h4>
                    <p>
                      If you need to cancel your order before it ships, please
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
