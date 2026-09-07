#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { symbolicateStack } from './index'
import type { SourceMap } from './source-map'

const USAGE = `사용법:
  maintenance-kit-symbolicate --maps <소스맵 폴더> [로그파일]

  로그파일을 생략하면 표준입력에서 읽습니다.
  입력은 수집 로그 JSON(payload 봉투 또는 그 안의 payload)이거나, 스택 원문입니다.

예:
  maintenance-kit-symbolicate --maps ./dist/assets < error.json
  pbpaste | maintenance-kit-symbolicate --maps ./dist/assets`

interface Options {
  mapsDir: string
  file?: string
}

function parseArgs(argv: string[]): Options | null {
  let mapsDir: string | undefined
  let file: string | undefined

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--maps' || arg === '-m') {
      mapsDir = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') return null
    if (arg !== undefined && !arg.startsWith('-')) file = arg
  }

  return mapsDir === undefined ? null : { mapsDir, file }
}

/**
 * 폴더를 한 번만 훑어 파일명 → 경로 색인을 만든다.
 * 소스맵은 파일당 수 MB라 필요한 것만 읽고 캐시한다.
 */
function createResolver(mapsDir: string): (name: string) => SourceMap | null {
  const index = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.map')) index.set(entry.name, path)
    }
  }
  walk(mapsDir)

  const cache = new Map<string, SourceMap | null>()
  return (name) => {
    const cached = cache.get(name)
    if (cached !== undefined) return cached
    const path = index.get(name)
    let map: SourceMap | null = null
    if (path !== undefined) {
      try {
        map = JSON.parse(readFileSync(path, 'utf8')) as SourceMap
      } catch {
        process.stderr.write(`소스맵을 읽지 못했습니다: ${path}\n`)
      }
    }
    cache.set(name, map)
    return map
  }
}

interface LoggedEvent {
  name?: string
  message?: string
  stack?: string
  url?: string
  user?: string
  viewport?: string
}

interface LoggedPayload {
  release?: string
  service?: string
  env?: string
  events?: LoggedEvent[]
}

/** 수집 서버가 감싼 형태와 payload 원본 둘 다 받는다 */
function readPayload(input: string): LoggedPayload | null {
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>
    const inner = parsed.payload
    if (typeof inner === 'object' && inner !== null) return inner as LoggedPayload
    if (Array.isArray(parsed.events)) return parsed as LoggedPayload
    return null
  } catch {
    return null
  }
}

function readInput(file?: string): string {
  if (file !== undefined) return readFileSync(file, 'utf8')
  return readFileSync(0, 'utf8')
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  if (options === null) {
    process.stdout.write(`${USAGE}\n`)
    process.exit(process.argv.includes('--help') ? 0 : 1)
  }

  const resolve = createResolver(options.mapsDir)
  const input = readInput(options.file)
  const payload = readPayload(input)

  // 스택 원문을 그대로 붙여넣은 경우
  if (payload === null) {
    process.stdout.write(`${symbolicateStack(input, resolve)}\n`)
    return
  }

  const header = [payload.service, payload.env, payload.release]
    .filter((value) => value !== undefined && value !== '')
    .join(' · ')
  if (header !== '') process.stdout.write(`# ${header}\n\n`)

  const events = payload.events ?? []
  if (events.length === 0) {
    process.stderr.write('이벤트가 없습니다.\n')
    process.exit(1)
  }

  events.forEach((event, order) => {
    const title = [event.name, event.message].filter(Boolean).join(': ')
    const meta = [event.url, event.viewport, event.user && `user=${event.user}`]
      .filter(Boolean)
      .join('  ')
    process.stdout.write(`[${order + 1}] ${title}\n`)
    if (meta !== '') process.stdout.write(`    ${meta}\n`)
    if (event.stack !== undefined) {
      process.stdout.write(`${symbolicateStack(event.stack, resolve)}\n`)
    }
    process.stdout.write('\n')
  })
}

main()
