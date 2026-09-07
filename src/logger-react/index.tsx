'use client'

import { useEffect, type ReactNode } from 'react'
import { flushErrorLogs, initErrorLogger, resetErrorLogger } from '../logger'
import type { ErrorLoggerConfig } from '../logger'
import { installGlobalHandlers } from './handlers'
import type { GlobalHandlerOptions } from './handlers'

export type {
  CaptureInput,
  ErrorLogClient,
  ErrorLogContext,
  ErrorLogEvent,
  ErrorLogLevel,
  ErrorLogPayload,
  ErrorLogType,
  ErrorLoggerConfig,
  ErrorLoggerLimits,
  Transport,
  TransportResult,
} from '../logger'
export {
  captureError,
  consoleTransport,
  flushErrorLogs,
  httpTransport,
  initErrorLogger,
} from '../logger'
export { ErrorLogBoundary } from './error-boundary'
export { installGlobalHandlers } from './handlers'
export type { GlobalHandlerOptions } from './handlers'

export interface ErrorLogProviderProps
  extends ErrorLoggerConfig,
    GlobalHandlerOptions {
  children: ReactNode
}

/**
 * 로거를 초기화하고 전역 핸들러를 붙인다.
 * service·env·release는 빌드 플러그인이 주입하므로 보통 prop 없이 감싸기만 하면 된다.
 */
export function ErrorLogProvider({
  children,
  captureResource,
  ignoreResource,
  ...config
}: ErrorLogProviderProps) {
  useEffect(() => {
    const started = initErrorLogger(config)
    if (!started) return
    const uninstall = installGlobalHandlers({ captureResource, ignoreResource })
    return () => {
      uninstall()
      // reset은 큐를 통째로 버리므로 남은 이벤트를 먼저 내보낸다
      flushErrorLogs()
      resetErrorLogger()
    }
    // 설정은 마운트 시점 1회만 반영한다 (재초기화는 큐를 버리게 된다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
