export function formatUrl(url: string): string {
  return url.replace(/\/+$/, '')
}


export const generateUniqueId = (): string => {
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9)
}