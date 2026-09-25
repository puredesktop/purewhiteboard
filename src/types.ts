export interface ShellPreferences {
  workingDirectory?: string
  theme?: string
}

export interface PureWhiteboardSettings {
  lastExportName?: string
  packagePath?: string
}

export interface PureWhiteboardBootState {
  prefs: ShellPreferences
  appSettings: PureWhiteboardSettings
}

/** A resource the shell asks this tab to open (boot binding or `resource.open`). */
export interface WhiteboardResource {
  path: string
  name?: string
}

export interface PlatformAppSettingsUpdateRequest {
  appSlug: string
  patch: Partial<PureWhiteboardSettings>
}
