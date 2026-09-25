import { useCallback, useEffect, useState } from 'react'
import {
  fetchShellPreferences,
  fetchWhiteboardSettings,
} from '../bridge/platformBridge'
import type { PureWhiteboardBootState } from '../types'

interface UsePureWhiteboardBootResult {
  boot: PureWhiteboardBootState | null
  bootError: Error | null
  booting: boolean
  reloadBoot: () => void
}

export function usePureWhiteboardBoot(
  ready: boolean,
): UsePureWhiteboardBootResult {
  const [boot, setBoot] = useState<PureWhiteboardBootState | null>(null)
  const [bootError, setBootError] = useState<Error | null>(null)
  const [booting, setBooting] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const reloadBoot = useCallback(() => {
    setReloadToken(current => current + 1)
  }, [])

  useEffect(() => {
    if (!ready) return

    let cancelled = false

    async function load(): Promise<void> {
      setBooting(true)
      setBootError(null)
      try {
        const [prefs, appSettings] = await Promise.all([
          fetchShellPreferences(),
          fetchWhiteboardSettings(),
        ])
        if (!cancelled) setBoot({ prefs, appSettings })
      } catch (error) {
        if (cancelled) return
        setBoot(null)
        setBootError(error instanceof Error ? error : new Error(String(error)))
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [ready, reloadToken])

  return { boot, bootError, booting, reloadBoot }
}
