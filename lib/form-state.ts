/** What a form's server action hands back to useActionState. */
export type FormState = {
  status: "idle" | "success" | "error"
  message?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
}
