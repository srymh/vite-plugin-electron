import { fileURLToPath } from 'node:url'

import { createWindow } from './create-window'
import { startApp } from './start-app'

/** 開発時の Vite dev server URL */
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const PRELOAD_ENTRY_PATH = fileURLToPath(
  new URL('./preload.cjs', import.meta.url),
)
const PRODUCTION_RENDERER_INDEX_URL = new URL(
  '../dist/index.html',
  import.meta.url,
)
const PRODUCTION_RENDERER_ROOT_URL = new URL('../dist/', import.meta.url)

const ALLOWED_DEV_ORIGIN = VITE_DEV_SERVER_URL
  ? new URL(VITE_DEV_SERVER_URL).origin
  : null

startApp({
  onAppReady: async () => {
    console.log('App is ready!')
  },
  openMainWindow: () => {
    console.log('Opening main window...')
    createWindow(
      async (win) => {
        if (VITE_DEV_SERVER_URL) {
          await win.loadURL(VITE_DEV_SERVER_URL)
        } else {
          await win.loadURL(PRODUCTION_RENDERER_INDEX_URL.toString())
        }
      },
      {
        navigation: {
          allowedDevOrigin: ALLOWED_DEV_ORIGIN,
          rendererRootUrl: PRODUCTION_RENDERER_ROOT_URL.toString(),
        },
        browserWindowOptions: {
          webPreferences: {
            preload: PRELOAD_ENTRY_PATH,
          },
        },
      },
    )
  },
  createAppContext: async () => {
    console.log('Creating app context...')
  },
})
