import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { EmptyState } from '@purescience/platform-ui/components/common/feedback/EmptyState'
import { usePlatformBridge } from '@purescience/platform-ui/bridge/react/usePlatformBridge'
import { usePlatformViewportResource } from '@purescience/platform-ui/bridge/react/usePlatformViewportResource'
import { isStandaloneDevMode } from './bridge/platformBridge'
import { WhiteboardWorkspace } from './components/WhiteboardWorkspace'
import { WHITEBOARD_APP_TITLE } from './constants'
import { usePureWhiteboardBoot } from './hooks/usePureWhiteboardBoot'

export function App(): React.ReactElement {
  const { error: bridgeError, ready, meta } = usePlatformBridge()
  const standaloneDev = isStandaloneDevMode()
  const bootReady = ready || standaloneDev
  const { boot, bootError, booting } = usePureWhiteboardBoot(bootReady)
  const { resource, clearResource } = usePlatformViewportResource(
    ready && !standaloneDev,
    meta,
  )

  if (bridgeError && !standaloneDev) {
    return (
      <AppFrame>
        <EmptyState
          tone="error"
          title="Bridge unavailable"
          message={bridgeError.message}
        />
      </AppFrame>
    )
  }

  if (!bootReady || !boot) {
    const message = bootError
      ? bootError.message
      : booting
      ? 'Loading whiteboard...'
      : 'Waiting for PureDesktop shell bridge...'

    return (
      <AppFrame>
        <EmptyState
          tone={bootError ? 'error' : 'neutral'}
          title={bootError ? 'Boot failed' : WHITEBOARD_APP_TITLE}
          message={message}
        />
      </AppFrame>
    )
  }

  return (
    <WhiteboardWorkspace
      ready={ready}
      boot={boot}
      resource={resource}
      onResourceHandled={clearResource}
    />
  )
}
