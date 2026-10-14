import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const TITLE = "Emquad";
const DESCRIPTION = "Create typographic posters with five custom layouts, live previews and SVG or PNG export.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // The image itself is app/opengraph-image.png, picked up by file convention:
  // Next fills in url, width, height and type from the file. Poster pages
  // override it with their own generated image, since their route is deeper.
  // No opengraph-image.alt.txt here: the file was tried and produced no
  // og:image:alt tag, so it was removed rather than left as dead weight. The
  // poster pages set their own alt through the `alt` export in their
  // opengraph-image.tsx, which does work.
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
