import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskCleanupGrants } from '../src/task-cleanup-grant.ts'
import type { CodexObservation } from '../src/codex/service.ts'
import type { UiNode } from '../src/device-driver.ts'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const reference = { grantId: 'a'.repeat(32), runId: 'run-1', specDigest: 'b'.repeat(64) }
const args = { deviceIds: ['phone-a'], testCleanupGrant: reference }
const type = (text = 'sample') => ({ action: 'text', text, observationId: 'frame', externalSideEffect: 'none' })
const deletion = { action: 'long_press', observationId: 'frame', externalSideEffect: 'delete', targetBBox: { left: 11, top: 101, right: 19, bottom: 109 } }
function node(text: string, top: number, extra: Partial<UiNode> = {}): UiNode {
  return { text, top, hint: '', type: 'Text', bundleName: 'com.example', windowId: '1', focused: false, clickable: false,
    bounds: { left: 10, top, right: 20, bottom: top + 10 }, ...extra } as UiNode
}
function observation(input = '', history: string[] = []): CodexObservation {
  return { sessionId: 'session', deviceId: 'phone-a', observationId: 'frame', width: 100, height: 200, foregroundPackage: 'com.example',
    screenshot: { data: '', mimeType: 'image/jpeg', bytes: 0, width: 100, height: 200, name: 'test' },
    layout: { stable: true, truncated: false, warnings: [], nodes: [node(input, 10, { hint: 'Search', type: 'TextInput', focused: true }),
      ...(history.length ? [node('History', 50), ...history.map((text, index) => node(text, 100 + index * 20))] : [])] } }
}
async function fixture(change: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'opengui-grant-')); roots.push(root)
  const directory = join(root, 'task-grants'); await mkdir(directory, { mode: 0o700 })
  const grant = { schemaVersion: 1, id: reference.grantId, profile: 'test-history-cleanup-v1', owner: 'task-a', platform: 'harmonyos',
    deviceId: 'phone-a', bundleName: 'com.example', caseId: 'S118-064', specDigest: reference.specDigest,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), maxDeletes: 2,
    context: { historyHeading: 'History', inputHint: 'Search' }, runs: [{ runId: 'run-1', texts: ['sample', '测试'] }], ...change }
  const path = join(directory, reference.grantId + '.json')
  await writeFile(path, JSON.stringify(grant), { mode: 0o600 })
  const manager = new TaskCleanupGrants(root)
  const bind = async () => manager.bind('session', await manager.claim('task-a', 'harmonyos', args))
  const created = async () => {
    await bind(); manager.observe(observation()); await manager.before('session', type()); manager.observe(observation('sample'))
    manager.observe(observation('', ['sample']))
  }
  return { root, directory, path, grant, manager, bind, created }
}
async function recoveryFixture(change: Record<string, unknown> = {}, claimOriginal = true) {
  const original = await fixture()
  if (claimOriginal) await original.manager.claim('task-a', 'harmonyos', args)
  const reference = { grantId: 'c'.repeat(32), runId: 'recovery-1', specDigest: 'd'.repeat(64) }
  const grant = { ...original.grant, id: reference.grantId, caseId: 'recovery-case', specDigest: reference.specDigest,
    profile: 'test-history-cleanup-recovery-v1', maxDeletes: 1, runs: [{ runId: reference.runId, texts: ['sample'] }],
    source: { grantId: original.grant.id, runId: 'run-1', deviceId: original.grant.deviceId, grantDigest: createHash('sha256').update(await readFile(original.path)).digest('hex'), proofDigest: 'e'.repeat(64) }, ...change }
  const path = join(original.directory, reference.grantId + '.json')
  await writeFile(path, JSON.stringify(grant), { mode: 0o600 })
  const manager = new TaskCleanupGrants(original.root)
  let scope: Awaited<ReturnType<TaskCleanupGrants['claim']>> | undefined
  const bind = async () => {
    scope = await manager.claim('task-a', 'harmonyos', { ...args, testCleanupGrant: reference })
    manager.bind('session', scope)
  }
  return { original, path, grant, reference, manager, bind, get scope() { return scope } }
}
async function continuationFixture() {
  const previous = await recoveryFixture(); await previous.bind(); previous.manager.remove('session')
  const now = Date.parse(previous.grant.expiresAt) + 1000
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const reference = { grantId: 'f'.repeat(32), runId: 'continue-1', specDigest: 'f'.repeat(64) }
  const grant = { ...previous.grant, id: reference.grantId, caseId: 'continue-case', specDigest: reference.specDigest,
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString(),
    runs: [{ runId: reference.runId, texts: ['sample'] }],
    continuation: { grantId: previous.reference.grantId, runId: previous.reference.runId,
      grantDigest: createHash('sha256').update(await readFile(previous.path)).digest('hex'), proofDigest: 'a'.repeat(64) } }
  const path = join(previous.original.directory, grant.id + '.json')
  await writeFile(path, JSON.stringify(grant), { mode: 0o600 })
  const manager = new TaskCleanupGrants(previous.original.root)
  const bind = async () => manager.bind('session', await manager.claim('task-a', 'harmonyos', { ...args, testCleanupGrant: reference }))
  return { previous, manager, grant, path, reference, bind }
}

describe('task cleanup grant scope', () => {
  it('persists exclusive run claims across managers, including unopened sessions', async () => {
    const f = await fixture()
    await f.manager.claim('task-a', 'harmonyos', args)
    await expect(new TaskCleanupGrants(f.root).claim('task-a', 'harmonyos', args)).rejects.toThrow('scope denied')
  })
  it.each([
    { owner: 'task-b' }, { platform: 'android' }, { maxDeletes: 7 }, { surprise: true },
    { expiresAt: new Date(0).toISOString() }, { expiresAt: new Date(Date.now() + 7_200_000).toISOString() },
    { runs: [{ runId: '../escape', texts: ['sample', '测试'] }] }, { context: { historyHeading: 'History', inputHint: 'Search', wildcard: true } },
  ])('rejects invalid or out-of-scope grant fields %j', async change => {
    const f = await fixture(change)
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it.each([
    { mode: 'observe' }, { deviceIds: ['phone-b'] }, { deviceIds: [] },
    { testCleanupGrant: { ...reference, specDigest: 'c'.repeat(64) } },
    { testCleanupGrant: { ...reference, runId: 'missing' } },
  ])('rejects mismatched session binding %j', async change => {
    const f = await fixture()
    await expect(f.manager.claim('task-a', 'harmonyos', { ...args, ...change })).rejects.toThrow('scope denied')
  })
  it('rejects insecure file permissions and symlinked grant files', async () => {
    const f = await fixture(); await chmod(f.path, 0o644)
    await expect(f.bind()).rejects.toThrow('scope denied')
    await chmod(f.path, 0o600)
    const content = await readFile(f.path); await rm(f.path)
    const target = join(f.root, 'target'); await writeFile(target, content, { mode: 0o600 }); await symlink(target, f.path)
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('requires fresh empty history before proving session-created text', async () => {
    const f = await fixture(); await f.bind(); f.manager.observe(observation('', ['sample']))
    await expect(f.manager.before('session', type())).rejects.toThrow('scope denied')
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
  })
  it('requires a complete exact input after typing and permits only each own text once', async () => {
    const f = await fixture(); await f.bind(); f.manager.observe(observation()); await f.manager.before('session', type())
    f.manager.observe(observation('sam')); f.manager.observe(observation('', ['sample']))
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
  })
  it('supports the second text with previously created own history and consumes each deletion', async () => {
    const f = await fixture(); await f.created()
    await expect(f.manager.before('session', type('测试'))).resolves.toBe(false)
    f.manager.observe(observation('测试', ['sample']))
    f.manager.observe(observation('', ['sample', '测试']))
    await expect(f.manager.before('session', deletion)).resolves.toBe(true)
    f.manager.observe(observation('', ['sample', '测试']))
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
    await expect(f.manager.before('session', { ...deletion, targetBBox: { left: 11, top: 121, right: 19, bottom: 129 } })).resolves.toBe(true)
    const markers = await readdir(join(f.directory, reference.grantId + '.usage'))
    expect(markers.filter(name => name.startsWith('delete-'))).toHaveLength(2)
  })
  it.each(['truncated', 'unstable', 'wrong-bundle', 'stale', 'duplicate', 'unfocused', 'wrong-target', 'wrong-window'])('blocks unsafe deletion evidence: %s', async issue => {
    const f = await fixture(); await f.created()
    const value = observation('', ['sample']), layout = value.layout!
    const current: CodexObservation = { ...value,
      foregroundPackage: issue === 'wrong-bundle' ? 'another.app' : value.foregroundPackage,
      layout: { ...layout, stable: issue !== 'unstable', truncated: issue === 'truncated', nodes: issue === 'duplicate'
        ? [...layout.nodes, node('sample', 130)] : layout.nodes.map((n, i) => ({ ...n,
          focused: issue === 'unfocused' ? false : n.focused,
          windowId: issue === 'wrong-window' && i === 2 ? '2' : n.windowId })) } }
    f.manager.observe(current)
    await expect(f.manager.before('session', { ...deletion, observationId: issue === 'stale' ? 'old' : 'frame',
      ...(issue === 'wrong-target' ? { targetBBox: { left: 10, top: 100, right: 20, bottom: 110 } } : {}) })).rejects.toThrow('scope denied')
  })
  it('never refunds an authorized delete and enforces the global budget across runs', async () => {
    const f = await fixture({ maxDeletes: 1, runs: [{ runId: 'run-1', texts: ['sample', '测试'] }, { runId: 'run-2', texts: ['sample', '测试'] }] })
    await f.created(); await f.manager.before('session', deletion); f.manager.invalidate('session')
    const next = new TaskCleanupGrants(f.root)
    next.bind('session', await next.claim('task-a', 'harmonyos', { ...args, testCleanupGrant: { ...reference, runId: 'run-2' } }))
    next.observe(observation()); await next.before('session', type()); next.observe(observation('sample')); next.observe(observation('', ['sample']))
    await expect(next.before('session', deletion)).rejects.toThrow('scope denied')
  })
  it('rejects other external effects rather than requesting a fallback dialog', async () => {
    const f = await fixture(); await f.bind()
    await expect(f.manager.before('session', { ...deletion, externalSideEffect: 'send' })).rejects.toThrow('scope denied')
  })
  it.each(['removed', 'edited', 'permissions'])('revokes an active grant when its private artifact is %s', async change => {
    const f = await fixture(); await f.created()
    if (change === 'removed') await rm(f.path)
    if (change === 'edited') await writeFile(f.path, JSON.stringify({ ...f.grant, maxDeletes: 3 }))
    if (change === 'permissions') await chmod(f.path, 0o644)
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
  })
  it('preserves pending creation through a permission helper tap and a subsequent full observation', async () => {
    const f = await fixture(); await f.bind(); f.manager.observe(observation()); await f.manager.before('session', type())
    f.manager.observe({ ...observation('sample'), actionAssessment: { status: 'permission_required', detail: 'permission' } })
    await f.manager.before('session', { action: 'tap', externalSideEffect: 'none' })
    f.manager.observe(observation('sample')); f.manager.observe(observation('', ['sample']))
    await expect(f.manager.before('session', deletion)).resolves.toBe(true)
  })
  it('proves the exact filled field when its placeholder disappears and its clear button shortens the right edge', async () => {
    const f = await fixture(); await f.bind(); f.manager.observe(observation()); await f.manager.before('session', type())
    const filled = observation('sample')
    f.manager.observe({ ...filled, layout: { ...filled.layout!, nodes: filled.layout!.nodes.map(n => ({ ...n, hint: '', bounds: { ...n.bounds, right: 18 } })) } })
    f.manager.observe(observation('', ['sample']))
    await expect(f.manager.before('session', deletion)).resolves.toBe(true)
  })
  it.each(['window', 'type', 'position', 'width', 'permission_required', 'text_unconfirmed', 'unexpected-hint'])('does not prove a filled field with mismatched context: %s', async issue => {
    const f = await fixture(); await f.bind(); f.manager.observe(observation()); await f.manager.before('session', type())
    const filled = observation('sample')
    f.manager.observe({ ...filled, width: issue === 'width' ? 200 : filled.width,
      ...(issue === 'permission_required' || issue === 'text_unconfirmed' ? { actionAssessment: { status: issue, detail: 'not confirmed' } as const } : {}),
      layout: { ...filled.layout!, nodes: filled.layout!.nodes.map(n => ({ ...n,
        hint: issue === 'unexpected-hint' ? 'Different input' : '', windowId: issue === 'window' ? '2' : n.windowId,
        type: issue === 'type' ? 'EditText' : n.type,
        bounds: { ...n.bounds, top: issue === 'position' ? 15 : n.bounds.top },
      })) } })
    f.manager.observe(observation('', ['sample']))
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
  })
  it('still requires the configured placeholder on an empty field before typing', async () => {
    const f = await fixture(); await f.bind()
    const empty = observation()
    f.manager.observe({ ...empty, layout: { ...empty.layout!, nodes: empty.layout!.nodes.map(n => ({ ...n, hint: '' })) } })
    await expect(f.manager.before('session', type())).rejects.toThrow('scope denied')
  })
  it('ignores old flat-tree background prefixes but blocks unknown history suffixes', async () => {
    const f = await fixture(); await f.created()
    const value = observation('', ['sample'])
    f.manager.observe({ ...value, layout: { ...value.layout!, nodes: [node('background', 150, { type: 'Web' }), ...value.layout!.nodes] } })
    await expect(f.manager.before('session', type('测试'))).resolves.toBe(false)
    f.manager.observe(observation('测试', ['sample']))
    f.manager.observe(observation('', ['sample', 'unknown-history']))
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
  })
  it('never selects a background prefix as a history target or consumes its budget', async () => {
    const f = await fixture(); await f.created()
    const value = observation('', ['sample']), nodes = value.layout!.nodes
    f.manager.observe({ ...value, layout: { ...value.layout!, nodes: [nodes[2]!, nodes[0]!, nodes[1]!] } })
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
    const markers = await readdir(join(f.directory, reference.grantId + '.usage'))
    expect(markers.filter(name => name.startsWith('delete-'))).toEqual([])
  })
  it('excludes status bar and input-method windows from the application history suffix', async () => {
    const f = await fixture(); await f.created()
    const value = observation('', ['sample'])
    f.manager.observe({ ...value, layout: { ...value.layout!, nodes: [...value.layout!.nodes,
      node('13:50', 1, { bundleName: 'com.ohos.sceneboard', windowId: '21' }),
      node('keyboard candidate', 150, { bundleName: 'com.huawei.hmos.inputmethod', windowId: '38' }),
    ] } })
    await expect(f.manager.before('session', deletion)).resolves.toBe(true)
  })
  it('allows the unique Unicode history chip when an input-method suggestion repeats the same text', async () => {
    const f = await fixture(); await f.bind(); f.manager.observe(observation()); await f.manager.before('session', type('测试'))
    f.manager.observe(observation('测试'))
    const value = observation('', ['测试'])
    f.manager.observe({ ...value, layout: { ...value.layout!, nodes: [...value.layout!.nodes,
      node('测试', 150, { bundleName: 'com.huawei.hmos.inputmethod', windowId: '38' }),
    ] } })
    await expect(f.manager.before('session', deletion)).resolves.toBe(true)
  })
  it('still rejects a matching application-window prefix even when the history suffix is unique', async () => {
    const f = await fixture(); await f.created()
    const value = observation('', ['sample'])
    f.manager.observe({ ...value, layout: { ...value.layout!, nodes: [node('sample', 130), ...value.layout!.nodes] } })
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
    const markers = await readdir(join(f.directory, reference.grantId + '.usage'))
    expect(markers.filter(name => name.startsWith('delete-'))).toEqual([])
  })
  it.each([{ action: 'tap' }, { durationMs: 10 }, { text: 'unrelated' }])('rejects deletion action substitution %j', async change => {
    const f = await fixture(); await f.created()
    await expect(f.manager.before('session', { ...deletion, ...change })).rejects.toThrow('scope denied')
  })
  it('supports ISO UTC offsets from the project producer', async () => {
    const f = await fixture({ issuedAt: new Date(Date.now() - 1000).toISOString().replace('Z', '+00:00'),
      expiresAt: new Date(Date.now() + 60_000).toISOString().replace('Z', '+00:00') })
    await expect(f.bind()).resolves.toBeUndefined()
  })
})

describe('single-text cleanup recovery grants', () => {
  it('accepts a new opaque device ID bound to the original phone by the trusted recovery proof', async () => {
    const f = await recoveryFixture({ deviceId: 'phone-new-id' })
    f.manager.bind('session', await f.manager.claim('task-a', 'harmonyos', {
      deviceIds: ['phone-new-id'], testCleanupGrant: f.reference,
    }))
    f.manager.observe({ ...observation('', ['sample']), deviceId: 'phone-new-id' })
    await expect(f.manager.before('session', deletion)).resolves.toBe(true)
  })
  it('rejects a source device ID that does not match the unchanged original grant', async () => {
    const f = await recoveryFixture()
    await writeFile(f.path, JSON.stringify({ ...f.grant, source: { ...f.grant.source, deviceId: 'wrong-original-id' } }))
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('preconsumes original budget, imports only the attested text, and deletes at most once', async () => {
    const f = await recoveryFixture(); await f.bind()
    const usage = join(f.original.directory, f.original.grant.id + '.usage')
    expect((await readdir(usage)).filter(name => name.startsWith('delete-'))).toEqual(['delete-1'])
    f.manager.observe(observation('', ['sample']))
    await expect(f.manager.before('session', type('测试'))).rejects.toThrow('scope denied')
    await expect(f.manager.before('session', deletion)).resolves.toBe(true)
    expect((await readdir(usage)).filter(name => name.startsWith('delete-'))).toEqual(['delete-1'])
    f.manager.observe(observation('', ['sample']))
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
  })
  it('rejects recovery of an unclaimed original run', async () => {
    const f = await recoveryFixture({}, false)
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('cannot recover the same source run and text under another grant id', async () => {
    const f = await recoveryFixture(); await f.bind()
    const nextReference = { ...f.reference, grantId: 'f'.repeat(32), runId: 'recovery-2' }
    const next = { ...f.grant, id: nextReference.grantId, runs: [{ runId: nextReference.runId, texts: ['sample'] }] }
    await writeFile(join(f.original.directory, next.id + '.json'), JSON.stringify(next), { mode: 0o600 })
    await expect(new TaskCleanupGrants(f.original.root).claim('task-a', 'harmonyos', { ...args, testCleanupGrant: nextReference })).rejects.toThrow('scope denied')
  })
  it.each([
    { maxDeletes: 2 }, { owner: 'another-task' }, { bundleName: 'another.app' },
    { expiresAt: new Date(Date.now() + 900_000).toISOString() },
    { runs: [{ runId: 'recovery-1', texts: ['unproven'] }] },
    { runs: [{ runId: 'recovery-1', texts: ['sample', '测试'] }] },
  ])('rejects broader recovery authorization %j', async change => {
    const f = await recoveryFixture(change)
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('revokes recovery when the original artifact is edited or removed', async () => {
    const f = await recoveryFixture(); await f.bind(); f.manager.observe(observation('', ['sample']))
    await rm(f.original.path)
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
  })
  it('refuses unknown concurrent history even with an attested recovery text', async () => {
    const f = await recoveryFixture(); await f.bind(); f.manager.observe(observation('', ['sample', 'unrelated']))
    await expect(f.manager.before('session', deletion)).rejects.toThrow('scope denied')
  })
  it('cannot create a recovery allowance after the original budget is exhausted', async () => {
    const f = await recoveryFixture()
    const usage = join(f.original.directory, f.original.grant.id + '.usage')
    await writeFile(join(usage, 'delete-1'), 'consumed\n', { mode: 0o600 })
    await writeFile(join(usage, 'delete-2'), 'consumed\n', { mode: 0o600 })
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('cannot outlive the original grant even within the recovery duration limit', async () => {
    const f = await recoveryFixture({ expiresAt: new Date(Date.now() + 120_000).toISOString() })
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('requires the exact original artifact hash before reserving source budget', async () => {
    const f = await recoveryFixture()
    await writeFile(f.original.path, JSON.stringify({ ...f.original.grant, maxDeletes: 3 }))
    await expect(f.bind()).rejects.toThrow('scope denied')
    const usage = join(f.original.directory, f.original.grant.id + '.usage')
    expect((await readdir(usage)).filter(name => name.startsWith('delete-'))).toEqual([])
  })
})

describe('freshly authorized zero-action recovery continuation', () => {
  it('uses the original prepaid allowance after both old grants expire without rewriting them', async () => {
    const f = await continuationFixture()
    const originalBytes = await readFile(f.previous.original.path), previousBytes = await readFile(f.previous.path)
    await f.bind(); f.manager.observe(observation('', ['sample']))
    await expect(f.manager.before('session', deletion)).resolves.toBe(true)
    expect(await readFile(f.previous.original.path)).toEqual(originalBytes)
    expect(await readFile(f.previous.path)).toEqual(previousBytes)
    const originalUsage = join(f.previous.original.directory, f.previous.original.grant.id + '.usage')
    expect((await readdir(originalUsage)).filter(name => name.startsWith('delete-'))).toEqual(['delete-1'])
  })
  it.each(['acted', 'delete-1'])('rejects any previous action or consumed cleanup marker: %s', async marker => {
    const f = await continuationFixture()
    await writeFile(join(f.previous.original.directory, f.previous.grant.id + '.usage', marker), 'consumed\n', { mode: 0o600 })
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('records even a rejected recovery action before its scope check', async () => {
    const f = await recoveryFixture(); await f.bind()
    await expect(f.manager.before('session', { action: 'text', text: 'sample', externalSideEffect: 'none' })).rejects.toThrow('scope denied')
    expect(await readFile(join(f.original.directory, f.grant.id + '.usage', 'acted'), 'utf8')).toBe('consumed\n')
  })
  it('permits only one concurrent successor of a previous grant and run', async () => {
    const f = await continuationFixture()
    const otherReference = { ...f.reference, grantId: 'e'.repeat(32), runId: 'continue-2' }
    await writeFile(join(f.previous.original.directory, otherReference.grantId + '.json'), JSON.stringify({ ...f.grant,
      id: otherReference.grantId, runs: [{ runId: otherReference.runId, texts: ['sample'] }] }), { mode: 0o600 })
    const outcomes = await Promise.allSettled([f.bind(), new TaskCleanupGrants(f.previous.original.root).claim('task-a', 'harmonyos', { ...args, testCleanupGrant: otherReference })])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
  })
  it('rejects changed predecessor evidence and source identity', async () => {
    const f = await continuationFixture()
    await writeFile(f.path, JSON.stringify({ ...f.grant, source: { ...f.grant.source, proofDigest: 'b'.repeat(64) } }))
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('keeps the fresh continuation lifetime bounded to ten minutes', async () => {
    const f = await continuationFixture()
    await writeFile(f.path, JSON.stringify({ ...f.grant, expiresAt: new Date(Date.now() + 601_000).toISOString() }))
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('requires the predecessor to have no live session in this daemon', async () => {
    const f = await continuationFixture()
    f.previous.manager.bind('still-live', f.previous.scope!)
    await expect(f.previous.manager.claim('task-a', 'harmonyos', { ...args, testCleanupGrant: f.reference })).rejects.toThrow('scope denied')
  })
  it('rejects a changed predecessor artifact before allocating a successor', async () => {
    const f = await continuationFixture()
    await writeFile(f.previous.path, JSON.stringify({ ...f.previous.grant, caseId: 'modified' }))
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('requires the existing original budget reservation instead of creating new budget', async () => {
    const f = await continuationFixture()
    await rm(join(f.previous.original.directory, f.previous.original.grant.id + '.usage', 'delete-1'))
    await expect(f.bind()).rejects.toThrow('scope denied')
  })
  it('blocks an old recovery action after its successor has claimed the allowance', async () => {
    const f = await continuationFixture(); await f.bind()
    // Simulate an old in-memory scope surviving a separate preparation process.
    const old = new TaskCleanupGrants(f.previous.original.root)
    old.bind('old-session', f.previous.scope!)
    await expect(old.before('old-session', { action: 'tap', externalSideEffect: 'none' })).rejects.toThrow('scope denied')
  })
  it('does not turn a single continuation into an automatic renewal chain', async () => {
    const f = await continuationFixture(); await f.bind(); f.manager.remove('session')
    const reference = { ...f.reference, grantId: '2'.repeat(32), runId: 'continue-again' }
    const next = { ...f.grant, id: reference.grantId, runs: [{ runId: reference.runId, texts: ['sample'] }], continuation: {
      grantId: f.grant.id, runId: f.reference.runId, proofDigest: 'a'.repeat(64), grantDigest: createHash('sha256').update(await readFile(f.path)).digest('hex'),
    } }
    await writeFile(join(f.previous.original.directory, next.id + '.json'), JSON.stringify(next), { mode: 0o600 })
    await expect(new TaskCleanupGrants(f.previous.original.root).claim('task-a', 'harmonyos', { ...args, testCleanupGrant: reference })).rejects.toThrow('scope denied')
  })
})
