/**
 * HMAC-SHA256 签名（浏览器 Web Crypto API）
 */
const hmacSha256 = async (secret: string, message: string): Promise<string> => {
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 生成随机 nonce
 */
const generateNonce = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 生成上报签名
 */
export const signReport = async (
  appId: string,
  appKey: string,
  body: string,
): Promise<{
  appId: string;
  timestamp: number;
  nonce: string;
  signature: string;
}> => {
  const timestamp = Date.now();
  const nonce = generateNonce();

  // 签名内容：appId.timestamp.nonce.body
  const message = `${appId}.${timestamp}.${nonce}.${body}`;
  const signature = await hmacSha256(appKey, message);

  return { appId, timestamp, nonce, signature };
}