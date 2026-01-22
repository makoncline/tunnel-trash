"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

type ProductImage = {
  src: string;
  alt: string;
  fit?: "contain" | "cover";
};

interface ProductGalleryProps {
  images: ProductImage[];
  badgeText: string;
}

export default function ProductGallery({
  images,
  badgeText,
}: ProductGalleryProps) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleSelect = useCallback(
    (nextApi: CarouselApi) => {
      if (!nextApi) return;
      setSelectedIndex(nextApi.selectedScrollSnap());
    },
    [setSelectedIndex]
  );

  useEffect(() => {
    if (!api) return;
    handleSelect(api);
    api.on("select", handleSelect);
    api.on("reInit", handleSelect);

    return () => {
      api.off("select", handleSelect);
      api.off("reInit", handleSelect);
    };
  }, [api, handleSelect]);

  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm">
        {badgeText}
      </div>
      <Carousel className="w-full" setApi={setApi}>
        <CarouselContent>
          {images.map((image) => (
            <CarouselItem key={image.src}>
              <div className="relative mx-auto aspect-[4/5] w-full overflow-hidden rounded-md bg-white">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="(min-width: 1024px) 520px, (min-width: 768px) 50vw, 100vw"
                  className={
                    image.fit === "cover" ? "object-cover" : "object-contain"
                  }
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-2" />
        <CarouselNext className="right-2" />
      </Carousel>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {images.map((image, index) => {
          const isActive = index === selectedIndex;

          return (
            <button
              key={`${image.src}-thumb`}
              type="button"
              className={[
                "relative overflow-hidden rounded-md border transition",
                isActive ? "border-gray-900" : "border-gray-200",
              ].join(" ")}
              onClick={() => api?.scrollTo(index)}
              aria-current={isActive ? "true" : "false"}
            >
              <div className="relative aspect-square w-full">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
