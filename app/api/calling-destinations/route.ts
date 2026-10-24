import { getCallingDestinations } from "@/lib/catalog"

/** The calling list, loaded only when a buyer opens "See where you can call". */
export async function GET() {
  const destinations = await getCallingDestinations()
  return Response.json(destinations, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } })
}
