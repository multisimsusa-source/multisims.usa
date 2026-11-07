import "server-only"

/** Images people upload (ticket screenshots, device photos): types, size and a real-image check. */

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
}
export const IMAGE_MAX = 5 * 1024 * 1024

/** Checks the file's first bytes, not just the type the browser claims. */
export async function looksLikeImage(file: File) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45
  return png || jpg || gif || webp
}

/** The file's extension when it is an image we take, or the reason it is not. */
export async function checkImage(file: File): Promise<{ ext: string } | { error: string }> {
  const ext = IMAGE_TYPES[file.type]
  if (!ext) return { error: "Use a PNG, JPG, GIF or WebP image" }
  if (file.size > IMAGE_MAX) return { error: "The image is over 5 MB" }
  if (!(await looksLikeImage(file))) return { error: "That file is not a readable image" }
  return { ext }
}
