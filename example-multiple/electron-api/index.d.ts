export type ElectronVersions = {
  chrome: string
  electron: string
  node: string
}

export type ElectronApi = {
  platform: NodeJS.Platform
  versions: ElectronVersions
}
