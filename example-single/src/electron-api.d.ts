export {}

declare global {
  interface Window {
    electronApi?: {
      platform: string
      versions: {
        chrome: string
        electron: string
        node: string
      }
    }
  }
}
