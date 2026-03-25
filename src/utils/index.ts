/**
 * 工具函数
 */

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function generateChallenge(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${Math.random().toString(36).substring(2, 9)}`
}

export async function signChallenge(challenge: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(challenge)
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, data)
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function isValidWebSocketUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'ws:' || urlObj.protocol === 'wss:'
  } catch {
    return false
  }
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

export function sanitizeHtml(html: string): string {
  // 简化版本，实际应用中应该使用更完善的 HTML 清理库
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}