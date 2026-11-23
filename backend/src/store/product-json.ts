export function parseLinkedAccounts(value: string | string[]) {
  return Array.isArray(value) ? [...value] : JSON.parse(value) as string[]
}
