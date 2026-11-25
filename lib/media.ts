/**
 * Photos and videos people attach to a support request. Shared by the browser (to stop a
 * wrong file before it uploads) and the server (to check what arrived).
 */

export const MAX_TICKET_FILES = 20

export const MEDIA_TYPES = {
  image: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
} as const

export const MEDIA_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
} as const

export function mediaKind(type: string): "image" | "video" | null {
  if ((MEDIA_TYPES.image as readonly string[]).includes(type)) return "image"
  if ((MEDIA_TYPES.video as readonly string[]).includes(type)) return "video"
  return null
}
