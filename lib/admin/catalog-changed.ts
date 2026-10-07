import "server-only"

import { refresh, updateTag } from "next/cache"

import { CATALOG_TAG } from "@/lib/catalog"

/** Call after every admin catalogue write: public site updates, admin view refreshes. */
export function catalogChanged() {
  updateTag(CATALOG_TAG)
  refresh()
}
