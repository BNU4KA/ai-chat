const recipientFields = new Set(['to', 'cc', 'bcc', 'attendees']);
export function approvalFields(
  name: string,
  args: Record<string, unknown>,
  preview: Record<string, unknown> = {},
) {
  const keys = name.includes('mail')
    ? ['to', 'cc', 'bcc', 'subject', 'body_text']
    : ['title', 'start', 'end', 'timezone', 'attendees', 'description'];
  return Object.fromEntries(
    keys.map((key) => {
      const value = Object.hasOwn(args, key) ? args[key] : preview[key];
      return [
        key,
        Array.isArray(value)
          ? value.map((v) => String(v.address ?? '')).join(', ')
          : String(value ?? ''),
      ];
    }),
  );
}
/** Preserve PATCH omissions and recipient names unless that field was actually edited. */
export function revisedArguments(
  original: Record<string, unknown>,
  initial: Record<string, string>,
  edited: Record<string, string>,
) {
  const args = { ...original };
  for (const [key, value] of Object.entries(edited)) {
    if (value === initial[key]) continue;
    if (!Object.hasOwn(original, key) && value === '') continue;
    args[key] = recipientFields.has(key)
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map((address) => ({ address }))
      : value;
  }
  return args;
}
