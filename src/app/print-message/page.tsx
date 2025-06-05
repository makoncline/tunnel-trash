"use client";

import Image from "next/image";

export default function PrintMessagePage() {
  return (
    <div className="print-page">
      <div className="message-card">
        {/* Tunnel Trash Logo */}
        <div className="logo-section">
          <Image
            src="/assets/logo-text.png"
            alt="Tunnel Trash"
            width={200}
            height={80}
            className="logo-image"
            priority
          />
        </div>

        {/* Main Message */}
        <div className="message-content">
          <p className="mb-3 text-sm leading-relaxed">
            Thanks for supporting the original Tunnel Trash tee. This started as
            an overheard conversation at Copper and became something special
            thanks to YOU!
          </p>

          <div className="mb-4">
            <p className="mb-2 text-sm font-semibold">
              Show your Tunnel Trash pride:
            </p>
            <ul className="ml-4 space-y-1 text-sm">
              <li>• Tag @tunnel_trash on IG</li>
              <li>• Share your mountain pics in r/COsnow</li>
            </ul>
          </div>

          <div className="mt-6">
            <p className="mb-1 text-sm font-medium">
              See you in the I-70 parking lot!
            </p>
            <p className="text-sm font-semibold">— Makon</p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .print-page {
          width: 100vw;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8f9fa;
          margin: 0;
          padding: 20px;
        }

        .message-card {
          width: 4in;
          height: 6in;
          background: rgba(255, 255, 255, 0.95);
          position: relative;
          color: black;
          padding: 0.3in;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: center;
          font-family:
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            "Helvetica Neue",
            Arial,
            "Noto Sans",
            sans-serif;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .message-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: url("/assets/topo-map.svg?v=2");
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          transform: rotate(0deg);
          opacity: 1;
          z-index: 0;
          border-radius: 8px;
        }

        .logo-section,
        .message-content {
          position: relative;
          z-index: 1;
        }

        .logo-section {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 0.25in;
          padding: 8px 0;
        }

        .logo-image {
          max-width: 100%;
          height: auto;
          filter: contrast(1.2);
        }

        .message-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        @media print {
          .print-page {
            width: 4in;
            height: 6in;
            margin: 0;
            background: white !important;
            background-image: none !important;
            padding: 0;
            position: relative;
          }

          .message-card::before {
            display: none;
          }

          .message-card {
            border: none;
            box-shadow: none;
            border-radius: 0;
            width: 100%;
            height: 100%;
            padding: 0.25in;
            background: white !important;
            z-index: 1;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }

        @page {
          size: 4in 6in;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
