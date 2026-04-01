import type { ElectronApi } from '@repo/multi-electron-api'

declare global {
  interface Window {
    electronApi?: ElectronApi
  }
}

export {}
