import Image from "next/image";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import inventory from "@/lib/inventory.json";
import SizeSelector from "@/components/SizeSelector";
import ProductGallery from "@/components/ProductGallery";

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
  const inventoryBySize = inventory as Record<
    "S" | "M" | "L" | "XL" | "XXL",
    number
  >;
  const productImages: Array<{
    src: string;
    alt: string;
    fit?: "contain" | "cover";
  }> = [
    {
      src: "/assets/back_large.png",
      alt: "Eisenhower Tee - Back graphic",
      fit: "cover",
    },
    {
      src: "/assets/front_large.png",
      alt: "Eisenhower Tee - Front view",
      fit: "cover",
    },
    {
      src: "/assets/female_0.png",
      alt: "Eisenhower Tee - Female model",
      fit: "contain",
    },
    {
      src: "/assets/close_0.png",
      alt: "Eisenhower Tee - Close up",
      fit: "contain",
    },
    {
      src: "/assets/b_0.png",
      alt: "Eisenhower Tee - Back view",
      fit: "contain",
    },
    {
      src: "/assets/w_0.png",
      alt: "Eisenhower Tee - Worn view",
      fit: "contain",
    },
  ];

  // Product JSON-LD structured data for SEO
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Eisenhower Tee - Tunnel Trash",
    description:
      "Screen printed on a Comfort Colors 100% Cotton Pocket T-shirt. A shirt celebrating Denver skiers who brave the Eisenhower Tunnel to hit the slopes.",
    image: productImages.map(
      (image) => `https://tunneltrash.com${image.src}`
    ),
    brand: {
      "@type": "Brand",
      name: "Tunnel Trash",
    },
    offers: {
      "@type": "Offer",
      price: eisenhowerPrice,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
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

      <div className="container mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-10 md:grid-cols-2 md:items-start">
          {/* Product Images */}
          <div>
            <ProductGallery
              images={productImages}
              badgeText="Limited inventory"
            />
            <p className="mt-3 text-xs text-gray-500">
              Renders shown. Final print size and placement may vary slightly.
            </p>
          </div>

          {/* Product Details */}
          <div className="text-left">
            <h1 className="mb-2 text-3xl font-semibold">Eisenhower Tee</h1>
            <div className="mb-4 flex items-baseline gap-2">
              <p className="text-2xl font-semibold">${eisenhowerPrice}</p>
              <p className="text-sm text-gray-500">
                + ${shippingPrice} shipping
              </p>
            </div>

            <SizeSelector inventory={inventoryBySize} />

            <div className="mb-4 w-full">
              <BuyButton paymentLink={stripePaymentLink} />
            </div>

            <p className="text-xs text-gray-500">
              Need multiple quantities? Email{" "}
              <a
                href="mailto:makon@hey.com"
                className="text-gray-900 underline"
              >
                makon@hey.com
              </a>
              .
            </p>

            <Accordion
              type="single"
              collapsible
              defaultValue="story"
              className="mt-8 w-full text-left"
            >
              <AccordionItem value="story">
                <AccordionTrigger>The Story</AccordionTrigger>
                <AccordionContent>
                  <p className="mb-2">
                  If you’ve driven from Denver up to the ski resorts, you’ve met the Eisenhower Tunnel — usually at a dead stop. Some locals call the weekend traffic warriors “Tunnel Trash.”
                  </p>
                  <p>
                  The first time I heard it, I laughed and owned it. This shirt is for the Front Range skier who shows up anyway: early alarm, I-70 crawl, and all. If that’s you, you’re in good company.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="product-details">
                <AccordionTrigger>Product Details</AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-2">
                    <li>
                      • Screen printed on a Comfort Colors 100% cotton pocket
                      tee, 6.1 oz
                    </li>
                    <li>
                      • Pre-shrunk cotton with a soft, broken-in feel
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
                      Machine wash cold; hang dry recommended.
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="shipping-returns">
                <AccordionTrigger>Shipping & Returns</AccordionTrigger>
                <AccordionContent>
                  <h4 className="mb-2 font-medium">In Stock</h4>
                  <p className="mb-3">
                    Shirts are on hand and ship within 3 business days.
                  </p>

                  <div className="mt-4 border-t pt-4">
                    <h4 className="mb-2 font-medium">Shipping Details</h4>
                    <p className="mb-2">
                      Shipping is $6 within the United States.
                    </p>
                    <p className="mb-3">
                      You&apos;ll receive a shipping confirmation and tracking
                      information once your order ships.
                    </p>
                  </div>

                  <div className="mt-4 border-t pt-4">
                    <h4 className="mb-2 font-medium">Returns</h4>
                    <p>
                      We can&apos;t offer returns, but if there&apos;s an issue
                      please email{" "}
                      <a
                        href="mailto:makon@hey.com"
                        className="text-blue-600 underline"
                      >
                        makon@hey.com
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
