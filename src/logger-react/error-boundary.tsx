'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from '../logger'

export interface ErrorLogBoundaryProps {
  children: ReactNode
  /** 에러 발생 시 children 대신 렌더링할 화면 */
  fallback?: ReactNode
  /** 로그에 남길 컴포넌트 이름 */
  component?: string
}

interface ErrorLogBoundaryState {
  hasError: boolean
}

/**
 * 렌더 단계에서 터진 에러를 잡는다.
 * 화면이 뚫린 상황이므로 level을 fatal로 올린다.
 */
export class ErrorLogBoundary extends Component<
  ErrorLogBoundaryProps,
  ErrorLogBoundaryState
> {
  state: ErrorLogBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorLogBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError({
      error,
      type: 'boundary',
      level: 'fatal',
      context: {
        component: this.props.component ?? extractComponent(info.componentStack),
        route: typeof window === 'undefined' ? undefined : window.location.pathname,
      },
    })
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}

/** componentStack 첫 줄이 터진 컴포넌트다 ("    at OrderDetail (...)") */
function extractComponent(componentStack?: string | null): string | undefined {
  if (!componentStack) return undefined
  const first = componentStack.split('\n').find((line) => line.trim().length > 0)
  if (first === undefined) return undefined
  const matched = /at\s+([\w$.]+)/.exec(first)
  return matched?.[1]
}
