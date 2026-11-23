import { api } from './api'

export interface TebarAccount {
  id: string
  platform: string
  username: string | null
  display_name: string | null
  connected_at: string
  status: 'active' | 'expired' | 'revoked'
}

const platformNames: Record<string, string> = {
  threads: 'Threads', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
  linkedin: 'LinkedIn', youtube: 'YouTube', x: 'X', telegram: 'Telegram',
  discord: 'Discord', pinterest: 'Pinterest',
}

export const platformName = (platform: string) => platformNames[platform] ?? platform
export const platformLogo = (platform: string) =>
  Object.hasOwn(platformNames, platform) ? `/platforms/${platform}.svg` : undefined
export const accountName = (account: TebarAccount) =>
  account.display_name || account.username || platformName(account.platform)

export async function listAccounts() {
  return (await api<{ accounts: TebarAccount[] }>('/accounts')).accounts
}
