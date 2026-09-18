import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { CodexOpenGuiService } from '../src/codex/service.ts'
import { assertVersion, request as makeRequest, sendRequest, startDaemon } from '../src/daemon.ts'
import { FakeHost } from './fixtures.ts'
import { runCli } from '../src/cli.ts'

const cleanup: (() => Promise<void>)[] = []
const request = (name: string, args: Record<string, unknown> = {}) => makeRequest(name, args, 'task-a')
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.unstubAllEnvs() })
async function daemon(confirm = vi.fn(async () => false)) {
  const root = await mkdtemp(join(tmpdir(), 'opengui-daemon-test-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const host = new FakeHost()
  const service = new CodexOpenGuiService({ host })
  const server = await startDaemon({ root, service, confirm })
  cleanup.push(server.close)
  return { root, host, service, confirm, ...server }
}
async function open(endpoint: string): Promise<string> {
  const response = await sendRequest(endpoint, request('opengui_open_session', { deviceIds: ['phone-a'] }))
  expect(response.ok).toBe(true)
  return (response.result as { sessionId: string }).sessionId
}

describe('standalone daemon transport', () => {
  it('allows status and immediate cancellation during a granted in-flight observation', async () => {
    vi.stubEnv('OPENGUI_PLATFORM', 'harmonyos')
    const server = await daemon(), id = 'c'.repeat(32), specDigest = 'd'.repeat(64)
    await mkdir(join(server.root, 'task-grants'), { mode: 0o700 })
    await writeFile(join(server.root, 'task-grants', id + '.json'), JSON.stringify({
      schemaVersion: 1, id, profile: 'test-history-cleanup-v1', owner: 'task-a', platform: 'harmonyos', deviceId: 'phone-a',
      bundleName: 'com.example', caseId: 'case-1', specDigest, issuedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), maxDeletes: 2, context: { historyHeading: 'History', inputHint: 'Search' },
      runs: [{ runId: 'run-1', texts: ['sample', '测试'] }],
    }), { mode: 0o600 })
    const opened = await sendRequest(server.endpoint, request('opengui_open_session', {
      deviceIds: ['phone-a'], testCleanupGrant: { grantId: id, specDigest, runId: 'run-1' },
    }))
    expect(opened.ok).toBe(true)
    const sessionId = (opened.result as { sessionId: string }).sessionId
    let started = false
    server.host.observe = (_actor, signal) => new Promise((_resolve, reject) => {
      started = true
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
    const pending = sendRequest(server.endpoint, request('opengui_observe', { sessionId }))
    await vi.waitFor(() => expect(started).toBe(true))
    expect((await sendRequest(server.endpoint, request('opengui_status', { sessionId }))).ok).toBe(true)
    expect((await sendRequest(server.endpoint, request('opengui_cancel', { sessionId }))).ok).toBe(true)
    expect((await pending).ok).toBe(false)
    expect(server.confirm).not.toHaveBeenCalled()
    expect(server.service.listSessions()[0]?.state).toBe('cancelled')
    expect((await sendRequest(server.endpoint, request('opengui_act', {
      sessionId, action: 'long_press', observationId: 'old', externalSideEffect: 'delete',
      targetBBox: { left: 1, right: 2, top: 1, bottom: 2 },
    }))).ok).toBe(false)
    expect(server.confirm).not.toHaveBeenCalled()
  })
  it('executes scoped cleanup without native approval and blocks unrelated effects without fallback', async () => {
    vi.stubEnv('OPENGUI_PLATFORM', 'harmonyos')
    const server = await daemon(), id = 'a'.repeat(32), specDigest = 'b'.repeat(64)
    await mkdir(join(server.root, 'task-grants'), { mode: 0o700 })
    await writeFile(join(server.root, 'task-grants', id + '.json'), JSON.stringify({
      schemaVersion: 1, id, profile: 'test-history-cleanup-v1', owner: 'task-a', platform: 'harmonyos', deviceId: 'phone-a',
      bundleName: 'com.example', caseId: 'case-1', specDigest, issuedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), maxDeletes: 2, context: { historyHeading: 'History', inputHint: 'Search' },
      runs: [{ runId: 'run-1', texts: ['sample', '测试'] }],
    }), { mode: 0o600 })
    const openArgs = { deviceIds: ['phone-a'], testCleanupGrant: { grantId: id, specDigest, runId: 'run-1' } }
    const opened = await sendRequest(server.endpoint, request('opengui_open_session', openArgs))
    expect(opened.ok).toBe(true)
    const sessionId = (opened.result as { sessionId: string }).sessionId
    const original = server.host.observe.bind(server.host)
    let input = '', history = false
    const node = (text: string, top: number) => ({ text, hint: '', type: 'Text', bundleName: 'com.example', windowId: '1', focused: false,
      clickable: true, bounds: { left: 10, right: 80, top, bottom: top + 10 } })
    server.host.observe = async (actor, signal) => ({ ...await original(actor, signal), layout: {
      stable: true, truncated: false, warnings: [], nodes: [{ ...node(input, 10), hint: input ? '' : 'Search', type: 'TextInput', focused: true },
        ...(history ? [node('History', 50), node('sample', 100)] : [])],
    } })
    const act = vi.fn(async (actor: object, args: Record<string, unknown>, signal: AbortSignal) => {
      if (args.action === 'text') input = String(args.text)
      if (args.action === 'key') { input = ''; history = true }
      if (args.action === 'long_press') history = false
      return server.host.observe(actor, signal)
    })
    server.host.act = act
    let current = await sendRequest(server.endpoint, request('opengui_observe', { sessionId }))
    const action = async (args: Record<string, unknown>) => {
      current = await sendRequest(server.endpoint, request('opengui_act', {
        sessionId, observationId: (current.result as { observationId: string }).observationId, externalSideEffect: 'none', ...args,
      }))
      return current
    }
    expect((await action({ action: 'text', text: 'sample' })).ok).toBe(true)
    expect((await action({ action: 'key', key: 'Back' })).ok).toBe(true)
    expect((await action({ action: 'long_press', durationMs: 700, externalSideEffect: 'delete', targetBBox: { left: 20, right: 30, top: 101, bottom: 109 } })).ok).toBe(true)
    expect(server.confirm).not.toHaveBeenCalled()
    expect(act).toHaveBeenCalledTimes(3)
    expect((await action({ action: 'key', key: 'Enter', externalSideEffect: 'send' })).ok).toBe(false)
    expect(server.confirm).not.toHaveBeenCalled()
    expect(act).toHaveBeenCalledTimes(3)
    await sendRequest(server.endpoint, request('opengui_close_session', { sessionId }))
    expect((await sendRequest(server.endpoint, request('opengui_open_session', openArgs))).ok).toBe(false)
  })
  it('supports compact output through the CLI while retaining the full observation file', async () => {
    const server = await daemon(), sessionId = await open(server.endpoint)
    const observe = server.host.observe.bind(server.host)
    server.host.observe = async (actor, signal) => ({ ...await observe(actor, signal), layout: {
      stable: true, truncated: false, warnings: [],
      nodes: Array.from({ length: 100 }, (_, index) => ({ text: 'background '.repeat(30), hint: '',
        type: 'Text', focused: false, clickable: true, windowId: '1', bundleName: 'com.example',
        bounds: { left: 1, right: 20, top: index, bottom: index + 1 } })),
    } })
    vi.stubEnv('OPENGUI_CODEX_DATA_DIR', server.root)
    vi.stubEnv('CODEX_THREAD_ID', 'task-a')
    const result = await runCli(['--compact', 'opengui_observe', JSON.stringify({ sessionId })]) as {
      observationPath: string; layout: { nodes: unknown[]; truncated: boolean }
    }
    expect(result.layout.nodes).toEqual([])
    expect(result.layout.truncated).toBe(true)
    expect(JSON.stringify(result).length).toBeLessThan(2000)
    expect(JSON.parse(await readFile(result.observationPath, 'utf8')).layout.nodes).toHaveLength(100)
    await runCli(['opengui_close_session', JSON.stringify({ sessionId })])
    await expect(stat(result.observationPath)).rejects.toThrow()
  })
  it('scopes discovery and every session operation to the originating task', async () => {
    const server = await daemon(), sessionId = await open(server.endpoint)
    const other = (name: string, args: Record<string, unknown> = {}) => sendRequest(server.endpoint, makeRequest(name, args, 'task-b'))
    expect((await other('opengui_list_sessions')).result).toEqual({ sessions: [] })
    for (const name of ['opengui_status', 'opengui_observe', 'opengui_cancel', 'opengui_close_session']) {
      expect(await other(name, { sessionId })).toMatchObject({ ok: false, error: expect.stringContaining('another Codex task') })
    }
    expect(await other('opengui_act', { sessionId, action: 'key', key: 'Enter', observationId: 'frame', externalSideEffect: 'send' })).toMatchObject({ ok: false })
    expect(server.confirm).not.toHaveBeenCalled()
    expect(server.service.listSessions()[0]?.state).toBe('active')
    expect((await sendRequest(server.endpoint, request('opengui_status', { sessionId }))).ok).toBe(true)
    expect(await sendRequest(server.endpoint, { ...request('opengui_list_sessions'), owner: '' })).toMatchObject({ ok: false })
  })
  it('rejects mismatched versions and refuses silent replacement', async () => {
    const server = await daemon()
    expect(() => assertVersion({ version: '9.0.0', protocol: 1, activeSessions: 1 })).toThrow('finish existing sessions')
    const response = await sendRequest(server.endpoint, { ...request('opengui_list_devices'), version: '9.0.0' })
    expect(response).toMatchObject({ ok: false, error: expect.stringContaining('incompatible') })
  })

  it('materializes private screenshots and complete JSON evidence and deletes both on close', async () => {
    const server = await daemon(), sessionId = await open(server.endpoint)
    const response = await sendRequest(server.endpoint, request('opengui_observe', { sessionId }))
    const screenshot = (response.result as { screenshot: { path: string; data?: string } }).screenshot
    const observationPath = (response.result as { observationPath: string }).observationPath
    expect(screenshot.data).toBeUndefined()
    expect((await stat(screenshot.path)).mode & 0o777).toBe(0o600)
    expect((await stat(observationPath)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(observationPath, 'utf8'))).toEqual(response.result)
    expect((await stat(server.endpoint)).mode & 0o777).toBe(0o600)
    await sendRequest(server.endpoint, request('opengui_close_session', { sessionId }))
    await expect(stat(screenshot.path)).rejects.toThrow()
    await expect(stat(observationPath)).rejects.toThrow()
  })

  it('does not accept a caller-supplied approval boolean', async () => {
    const server = await daemon(), sessionId = await open(server.endpoint)
    const response = await sendRequest(server.endpoint, request('opengui_act', {
      sessionId, action: 'key', key: 'Enter', observationId: 'frame', externalSideEffect: 'send', confirmedExternalSideEffect: true,
    }))
    expect(response.ok).toBe(false)
    expect(server.confirm).not.toHaveBeenCalled()
  })

  it('executes only after native one-action approval', async () => {
    const confirm = vi.fn(async () => false), server = await daemon(confirm), sessionId = await open(server.endpoint)
    const args = { sessionId, action: 'key', key: 'Enter', observationId: 'frame', externalSideEffect: 'send' }
    expect((await sendRequest(server.endpoint, request('opengui_act', args))).ok).toBe(false)
    expect(server.service.listSessions()[0]?.devices[0]?.operationCount).toBe(0)
    confirm.mockResolvedValueOnce(true)
    expect((await sendRequest(server.endpoint, request('opengui_act', args))).ok).toBe(true)
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('cancels work when the requesting CLI disappears', async () => {
    const server = await daemon(), sessionId = await open(server.endpoint)
    let started = false
    server.host.observe = (_actor, signal) => new Promise((_resolve, reject) => {
      started = true
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
    const socket = createConnection(server.endpoint)
    await new Promise<void>(resolve => socket.once('connect', resolve))
    socket.write(JSON.stringify(request('opengui_observe', { sessionId })) + '\n')
    await vi.waitFor(() => expect(started).toBe(true))
    socket.destroy()
    await vi.waitFor(() => expect(server.service.listSessions()[0]?.state).toBe('cancelled'))
  })

  it('will not stop a daemon with an active device session', async () => {
    const server = await daemon()
    await open(server.endpoint)
    expect((await sendRequest(server.endpoint, request('__shutdown__'))).ok).toBe(false)
    expect(server.service.activeSessionCount).toBe(1)
  })

  it('returns JSON errors for malformed input without creating a phone session', async () => {
    const server = await daemon()
    const socket = createConnection(server.endpoint)
    const output = new Promise<string>(resolve => socket.once('data', chunk => resolve(String(chunk))))
    socket.once('connect', () => socket.write('{broken}\n'))
    expect(JSON.parse(await output).ok).toBe(false)
    socket.destroy()
    expect(server.service.activeSessionCount).toBe(0)
    expect(await readdir(join(server.root, 'observations'))).toEqual([])
  })
})
