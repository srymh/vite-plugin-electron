import { contextBridge } from 'electron'

import type { ElectronApi } from '@srymh/electron-api'

const electronApi: ElectronApi = {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
}

contextBridge.exposeInMainWorld('electronApi', electronApi)
