import {
  BrowserWindow,
  shell,
  type BrowserWindowConstructorOptions,
} from 'electron'

type NavigationPolicy = {
  /** 開発環境: 許可された Vite dev server のオリジン (例: http://localhost:5173) */
  allowedDevOrigin: string | null
  /** 本番環境: dist ディレクトリの file://.../dist/ パス（末尾セパレータ必須） */
  rendererRootUrl: string | null
}

/**
 * セキュリティ推奨設定。
 */
export const recommendedSecureOptions = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webviewTag: false,
  spellcheck: false,
  navigateOnDragDrop: false,
}

export async function createWindow(
  loadRenderer: (win: BrowserWindow) => Promise<void>,
  options: {
    browserWindowOptions?: BrowserWindowConstructorOptions
    /**
     * ナビゲーションポリシー
     * アプリ内で遷移を許可する URL を指定する
     */
    navigation?: NavigationPolicy
    /**
     * ライフサイクルフック: ウィンドウ作成後の処理
     * @param win 作成されたウィンドウ
     */
    onCreated?: (win: BrowserWindow) => void
    /**
     * ライフサイクルフック: ウィンドウがクローズされようとするときの処理
     * @param win クローズされようとしているウィンドウ
     */
    onClose?: (win: BrowserWindow) => void
    /**
     * ライフサイクルフック: ウィンドウが閉じられた後の処理
     */
    onClosed?: () => void
  } = {},
) {
  const { browserWindowOptions, navigation, onCreated, onClose, onClosed } =
    options

  const isAllowedNavigation = createIsAllowedNavigation(
    navigation ?? {
      allowedDevOrigin: null,
      rendererRootUrl: null,
    },
  )

  /** --------------------------------------------------------------------------
   *
   * BrowserWindow 作成
   *
   * ------------------------------------------------------------------------ */

  const win = new BrowserWindow({
    ...browserWindowOptions,
    webPreferences: {
      ...browserWindowOptions?.webPreferences,
      // preload を含む renderer 側も既定では sandbox を維持する。
      sandbox: browserWindowOptions?.webPreferences?.sandbox ?? true,
      // セキュリティ強化のために contextIsolation が省略された場合には明示的に有効化
      contextIsolation:
        browserWindowOptions?.webPreferences?.contextIsolation ?? true,
      // セキュリティ強化のために nodeIntegration が省略された場合には明示的に無効化
      nodeIntegration:
        browserWindowOptions?.webPreferences?.nodeIntegration ?? false,
    },
  })

  // 作成後フックの呼び出し
  onCreated?.(win)

  /** --------------------------------------------------------------------------
   *
   * BrowserWindow イベントハンドリング
   *
   * ------------------------------------------------------------------------ */

  /**
   * ウインドウがクローズされようとするときに発生します。
   *
   * https://www.electronjs.org/ja/docs/latest/api/browser-window#%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88-close
   */
  win.on('close', () => {
    onClose?.(win)
  })

  /**
   * ウインドウが閉じられたときに発生します。
   *
   * このイベントを受け取った後は、ウインドウへの参照を削除し、
   * 以降そのウインドウを使用しないようにしてください。
   *
   * https://www.electronjs.org/ja/docs/latest/api/browser-window#%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88-closed
   */
  win.on('closed', () => {
    // win は既に破棄されているので渡せない
    onClosed?.()
  })

  /** --------------------------------------------------------------------------
   *
   * WebContents イベントハンドリング
   *
   * ------------------------------------------------------------------------ */

  /**
   * 右クリックメニュー（コンテキストメニュー）が開かれる直前に発行されます。
   *
   * https://www.electronjs.org/ja/docs/latest/api/web-contents#%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88-context-menu
   */
  win.webContents.on('context-menu', () => {})

  /**
   * ナビゲーションが終了した時、すなわち、タブのくるくるが止まったときや、
   * onload イベントが送られた後に、発行されます。
   *
   * https://www.electronjs.org/ja/docs/latest/api/web-contents#%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88-did-finish-load
   */
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('main-process-message', new Date().toLocaleString())
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url)) return

    if (isAllowedExternalUrl(url)) {
      // 外部URLはアプリ内で開かず、OS既定ブラウザへ委譲
      event.preventDefault()
      void shell.openExternal(url)
      return
    }

    // 予期しない遷移（別オリジン等）はブロック
    event.preventDefault()
  })

  win.webContents.on('will-redirect', (event, url) => {
    if (isAllowedNavigation(url)) return

    if (isAllowedExternalUrl(url)) {
      // リダイレクト先が外部URLならOSで開く
      event.preventDefault()
      void shell.openExternal(url)
      return
    }

    event.preventDefault()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    // window.open は常に拒否。
    // ただし安全な外部URLならOS既定ブラウザで開く。
    if (!isAllowedNavigation(url) && isAllowedExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  /** --------------------------------------------------------------------------
   *
   * Renderer ロード処理
   *
   * ------------------------------------------------------------------------ */

  await loadRenderer(win)
}

/**
 * 許可されたナビゲーション URL かどうかを判定する。
 * アプリ内で遷移を許可する URL をここで指定する。
 */
const isAllowedExternalUrl = (urlString: string) => {
  try {
    const url = new URL(urlString)
    return (
      url.protocol === 'https:' ||
      url.protocol === 'http:' ||
      url.protocol === 'mailto:'
    )
  } catch {
    return false
  }
}

/**
 * ナビゲーションポリシーからナビゲーション許可判定関数を作成する。
 * @param policy ナビゲーションポリシー
 * @returns ナビゲーション許可判定関数
 */
const createIsAllowedNavigation = (policy: NavigationPolicy) => {
  return (targetUrl: string) => {
    // 開発環境の許可されたオリジンが設定されている場合はそちらを優先
    if (policy.allowedDevOrigin) {
      try {
        return new URL(targetUrl).origin === policy.allowedDevOrigin
      } catch {
        return false
      }
    }

    // 本番環境の rendererRootUrl が設定されている場合はそちらを判定

    if (!policy.rendererRootUrl) {
      return false
    }

    return targetUrl.startsWith(policy.rendererRootUrl)
  }
}
