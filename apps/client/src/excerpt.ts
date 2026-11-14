export function plainExcerpt(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*`>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
