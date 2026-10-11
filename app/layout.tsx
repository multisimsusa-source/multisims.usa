import type { Metadata, Viewport } from "next"
import NextTopLoader from "nextjs-toploader"
import { Bodoni_Moda, Funnel_Display, Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { JsonLd } from "@/components/json-ld"
import { absoluteUrl, site } from "@/lib/site"
import { cn } from "@/lib/utils"

/*
  Direction contract (impeccable, seed 5202824c, ran degraded; brief-pinned world).
  THESIS: a US-only SIM shop that feels as fast and plain as a good boarding pass;
    refuses the travel-eSIM template of destination grids, gradients and fake reviews.
  OWN-WORLD: the client's MSU logo sets the palette: deep plum for actions and
    selection, copper for small details, lavender-grey ground, 1px hairlines,
    Funnel Display headings over Geist, Geist Mono numerals, the SIM card's cut corner
    on day-package tiles and product marks.
  STORY: pick eSIM or SIM card, pick a carrier plan, pick days, see the price, buy.
  FIRST VIEWPORT: left-aligned headline and one primary action, a right-side plan
    picker preview built from real catalogue data; carrier strip directly below.
  FORM: minimalist editorial storefront (pinned by brief + /minimalist-ui).
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
    review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
*/

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontDisplay = Funnel_Display({ subsets: ["latin"], variable: "--font-display" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })
// Logo lockup only: closest web face to the client's MSU monogram until the vector file arrives.
const fontLogo = Bodoni_Moda({ subsets: ["latin"], variable: "--font-logo", axes: ["opsz"] })

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "US SIM Cards and eSIMs for Travellers | MultiSims USA",
    template: "%s | MultiSims USA",
  },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: "en_US",
    url: "/",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
}

export const viewport: Viewport = {
  // Browser chrome colours must be literal strings; they mirror --background in each theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" }, // design-allow: color-literal
    { media: "(prefers-color-scheme: dark)", color: "#160f17" }, // design-allow: color-literal
  ],
}

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: site.name,
  url: absoluteUrl("/"),
  logo: absoluteUrl("/icon"),
  description: site.description,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontSans.variable, fontDisplay.variable, fontMono.variable, fontLogo.variable)}
    >
      <body>
        {/* Route-change progress: thin plum hairline, no spinner or glow (minimalist-ui). */}
        <NextTopLoader color="var(--brand)" height={2} showSpinner={false} shadow={false} crawlSpeed={180} speed={220} zIndex={60} />
        <JsonLd data={organizationJsonLd} />
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}
