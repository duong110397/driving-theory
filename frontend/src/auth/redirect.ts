/** Only allow in-app redirects to avoid open-redirect via router state. */
export function safeRedirect(from: unknown): string {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/'
}
