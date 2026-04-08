# 責務とスコープ

## プラグインが担うこと

- `electron()` factory による公開 API の提供
- `electron_main` と `electron_preload` custom environment の登録
- main / preload entry の正規化とバリデーション
- Electron 側 build 設定の生成（entry, format, outDir 等）
- dev 時の Electron 起動と再起動の orchestration
- debug 用 CLI 引数（`--inspect`, `--remote-debugging-port`）の付与
- renderer dev server URL の解決と環境変数への注入
- internal / external 両方の renderer 構成のサポート

## プラグインが担わないこと

以下は意図的にスコープ外としています。

### 利用者アプリ固有の設定

- `BrowserWindow` の設定
- preload bridge 自体の API 設計
- Electron アプリケーションロジック全体の終了戦略

### production renderer の配置と解決

この plugin は production renderer の配置、解決、load を直接の責務としません。

- **同居構成**: renderer の build 出力は Vite 標準の `dist/` に入ります。Electron main から `loadFile(path.join(__dirname, '../dist/index.html'))` のように読むのは利用者側の責務です
- **外部構成**: renderer app は別の Vite app として独立に build されます。その build 出力の配置先とロード方法は利用者側が管理します

plugin が担当するのは dev 時の renderer URL 解決と環境変数への注入までです。production 時のファイル配置戦略は意図的にスコープ外としています。

### external renderer 側の `base` 制御

external renderer mode では、renderer app は desktop app とは別の Vite app として build されます。renderer 側の `base` のような設定は、desktop 側へ入れたこのプラグインだけで直接上書きできません。

理論上は companion plugin や config helper を別途用意して、renderer app 側でも同じ package を使う形にすれば制御できます。ただしこれは現在のプラグイン単体の責務からは外れています。

### パッケージング

- `electron-builder` による installer / DMG の生成設定
- preview 時の Electron 起動設定

これらはサンプルアプリ側の責務です。
