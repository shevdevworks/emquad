import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const TITLE = "Emquad";
const DESCRIPTION = "Typographic poster generator.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // The image itself is app/opengraph-image.png, picked up by file convention:
  // Next fills in url, width, height and type from the file. Poster pages
  // override it with their own generated image, since their route is deeper.
  // No opengraph-image.alt.txt here: that convention is implemented in the
  // webpack metadata loader, and this project builds with Turbopack, so the
  // file produced no og:image:alt tag in either dev or a production build.
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
