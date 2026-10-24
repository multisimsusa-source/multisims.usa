"use server"

import { refresh, updateTag } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/lib/admin/result"
import { requireRole } from "@/lib/auth"
import { REVIEWS_TAG } from "@/lib/reviews"
import { createClient } from "@/lib/supabase/server"

export async function setReviewFeatured(id: string, featured: boolean): Promise<ActionResult> {
  await requireRole("admin")
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown review" }
  const supabase = await createClient()
  const { error } = await supabase
    .from("reviews")
    .update({ featured, featured_at: featured ? new Date().toISOString() : null, ...(featured ? { hidden: false } : {}) })
    .eq("id", id)
  if (error) return { ok: false, error: "Could not save. Try again." }
  updateTag(REVIEWS_TAG)
  refresh()
  return { ok: true, message: featured ? "Featured on the website" : "Taken off the website" }
}

export async function setReviewHidden(id: string, hidden: boolean): Promise<ActionResult> {
  await requireRole("admin")
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown review" }
  const supabase = await createClient()
  const { error } = await supabase
    .from("reviews")
    .update({ hidden, ...(hidden ? { featured: false, featured_at: null } : {}) })
    .eq("id", id)
  if (error) return { ok: false, error: "Could not save. Try again." }
  updateTag(REVIEWS_TAG)
  refresh()
  return { ok: true, message: hidden ? "Hidden" : "Shown in the list again" }
}
