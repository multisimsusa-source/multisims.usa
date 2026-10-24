import "server-only"

import { after } from "next/server"
import { refresh, revalidateTag, updateTag } from "next/cache"

import { CATALOG_TAG } from "@/lib/catalog"

/**
 * Call after every admin catalogue write: public site updates, admin view refreshes.
 *
 * A second, delayed invalidation closes a race: when two saves land within moments of
 * each other, a page refresh started by the first can read the database just before the
 * second commits and then be stored as fresh, keeping the old price on the website.
 * Expiring the tag again a few seconds later makes the next visit read fresh data.
 */
export function catalogChanged() {
  updateTag(CATALOG_TAG)
  refresh()
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    revalidateTag(CATALOG_TAG, { expire: 0 })
  })
}
