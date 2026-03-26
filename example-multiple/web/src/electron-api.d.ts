import type { ElectronApi } from '@srymh/electron-api'

declare global {
  interface Window {
    electronApi?: ElectronApi
  }
}

export {}
