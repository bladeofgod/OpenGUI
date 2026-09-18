import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { CodexObservation } from './codex/service.ts'
import type { UiNode } from './device-driver.ts'

export interface CleanupGrantReference { grantId: string; runId: string; specDigest: string }
interface Grant {
  schemaVersion: 1; id: string; profile: 'test-history-cleanup-v1' | 'test-history-cleanup-recovery-v1'; owner: string; platform: 'harmonyos'
  deviceId: string; bundleName: string; caseId: string; specDigest: string
  issuedAt: string; expiresAt: string; maxDeletes: number
  context: { historyHeading: string; inputHint: string }
  runs: { runId: string; texts: string[] }[]
  source?: { grantId: string; runId: string; deviceId: string; grantDigest: string; proofDigest: string }
  continuation?: { grantId: string; runId: string; grantDigest: string; proofDigest: string }
}
interface Scope { grant: Grant; reference: CleanupGrantReference; usage: string; texts: string[]; digest: string }
interface Session {
  scope: Scope; latest?: CodexObservation; baseline: boolean; revoked: boolean
  created: Set<string>; deleted: Set<string>
  pending?: { text: string; input: UiNode; width: number; height: number }
}
const fail = (): never => { throw new Error('opengui: test cleanup grant scope denied') }
const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) return fail()
  return record
}
function string(value: unknown, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)
    || Buffer.from(value).toString('utf8') !== value) return fail()
  return value
}
export function cleanupGrantReference(value: unknown): CleanupGrantReference {
  const record = object(value, ['grantId', 'runId', 'specDigest'])
  if (!/^[a-f0-9]{32}$/.test(string(record.grantId)) || !safeId.test(string(record.runId))
    || !/^[a-f0-9]{64}$/.test(string(record.specDigest))) return fail()
  return record as unknown as CleanupGrantReference
}
function validateGrant(value: unknown, historical = false): Grant {
  const recovery = (value as Partial<Grant> | null)?.profile === 'test-history-cleanup-recovery-v1'
  const continuation = recovery && Object.hasOwn(value as object, 'continuation')
  const g = object(value, ['schemaVersion', 'id', 'profile', 'owner', 'platform', 'deviceId', 'bundleName', 'caseId', 'specDigest', 'issuedAt', 'expiresAt', 'maxDeletes', 'context', 'runs', ...(recovery ? ['source'] : []), ...(continuation ? ['continuation'] : [])])
  if (g.schemaVersion !== 1 || (!recovery && g.profile !== 'test-history-cleanup-v1') || g.platform !== 'harmonyos') return fail()
  if (recovery) {
    const source = object(g.source, ['grantId', 'runId', 'deviceId', 'grantDigest', 'proofDigest'])
    cleanupGrantReference({ grantId: source.grantId, runId: source.runId, specDigest: source.grantDigest })
    string(source.deviceId, 200)
    if (!/^[a-f0-9]{64}$/.test(string(source.proofDigest)) || g.maxDeletes !== 1) return fail()
    if (continuation) {
      const previous = object(g.continuation, ['grantId', 'runId', 'grantDigest', 'proofDigest'])
      cleanupGrantReference({ grantId: previous.grantId, runId: previous.runId, specDigest: previous.grantDigest })
      if (!/^[a-f0-9]{64}$/.test(string(previous.proofDigest)) || previous.grantId === g.id || previous.grantId === source.grantId) return fail()
    }
  }
  cleanupGrantReference({ grantId: g.id, runId: g.caseId, specDigest: g.specDigest })
  for (const key of ['owner', 'deviceId', 'bundleName']) string(g[key], 200)
  const context = object(g.context, ['historyHeading', 'inputHint'])
  string(context.historyHeading, 200); string(context.inputHint, 200)
  if (!Number.isInteger(g.maxDeletes) || Number(g.maxDeletes) < 1 || Number(g.maxDeletes) > 6) return fail()
  for (const key of ['issuedAt', 'expiresAt']) {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(string(g[key], 40)) || !Number.isFinite(Date.parse(String(g[key])))) return fail()
  }
  const issued = Date.parse(String(g.issuedAt)), expires = Date.parse(String(g.expiresAt))
  if (issued > Date.now() || expires <= issued || expires - issued > (recovery ? 600_000 : 3_600_000) || (!historical && expires <= Date.now())) return fail()
  if (!Array.isArray(g.runs) || g.runs.length < 1 || g.runs.length > (recovery ? 1 : 3)) return fail()
  const ids = new Set<string>()
  for (const item of g.runs) {
    const run = object(item, ['runId', 'texts']), id = string(run.runId, 96)
    if (!safeId.test(id) || ids.has(id)) return fail()
    ids.add(id)
    if (!Array.isArray(run.texts) || run.texts.length !== (recovery ? 1 : 2)) return fail()
    if (recovery) { string(run.texts[0]); continue }
    const [ascii, unicode] = run.texts.map(value => string(value))
    if (!/^[\x20-\x7e]+$/.test(ascii!) || !/[^\x00-\x7f]/u.test(unicode!) || ascii === unicode) return fail()
  }
  return g as unknown as Grant
}
async function privatePath(path: string, directory: boolean): Promise<void> {
  const info = await lstat(path)
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())
    || info.uid !== process.getuid?.() || (info.mode & 0o777) !== (directory ? 0o700 : 0o600)) fail()
}
async function marker(directory: string, name: string): Promise<boolean> {
  await privatePath(directory, true)
  let file
  try { file = await open(join(directory, name), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw error }
  try { await file.writeFile('consumed\n'); await file.sync() } finally { await file.close() }
  const dir = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { await dir.sync() } finally { await dir.close() }
  return true
}
async function readGrant(root: string, id: string): Promise<string> {
  const directory = join(root, 'task-grants'), path = join(directory, id + '.json')
  await privatePath(root, true); await privatePath(directory, true); await privatePath(path, false)
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600 || info.size > 16_384) fail()
    return await file.readFile('utf8')
  } finally { await file.close() }
}
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')
async function absent(path: string): Promise<void> {
  try { await lstat(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  fail()
}

/** Grants are local task artifacts; consumption is persistent and never refunded. */
export class TaskCleanupGrants {
  private readonly sessions = new Map<string, Session>()
  constructor(private readonly root: string) {}

  async claim(owner: string, platform: string, args: Record<string, unknown>): Promise<Scope> {
    try {
      const reference = cleanupGrantReference(args.testCleanupGrant)
      const directory = join(this.root, 'task-grants')
      const source = await readGrant(this.root, reference.grantId)
      const grant = validateGrant(JSON.parse(source))
      const run = grant.runs.find(item => item.runId === reference.runId)
      if (grant.id !== reference.grantId || grant.specDigest !== reference.specDigest || grant.owner !== owner
        || platform !== 'harmonyos' || args.mode === 'observe' || !Array.isArray(args.deviceIds)
        || args.deviceIds.length !== 1 || args.deviceIds[0] !== grant.deviceId || !run) return fail()
      const usage = join(directory, reference.grantId + '.usage')
      await mkdir(usage, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
      await privatePath(usage, true)
      if (!await marker(usage, 'run-' + createHash('sha256').update(reference.runId).digest('hex'))) return fail()
      if (grant.source) {
        const origin = grant.source
        const originalSource = await readGrant(this.root, origin.grantId)
        if (digest(originalSource) !== origin.grantDigest) return fail()
        const original = validateGrant(JSON.parse(originalSource), !!grant.continuation)
        if (original.profile !== 'test-history-cleanup-v1' || original.id !== origin.grantId
          || original.deviceId !== origin.deviceId
          || ['owner', 'platform', 'bundleName'].some(key => original[key as keyof Grant] !== grant[key as keyof Grant])
          || original.context.historyHeading !== grant.context.historyHeading || original.context.inputHint !== grant.context.inputHint
          || (!grant.continuation && Date.parse(grant.expiresAt) > Date.parse(original.expiresAt))
          || !original.runs.find(item => item.runId === origin.runId)?.texts.includes(run.texts[0]!)) return fail()
        if ([...this.sessions.values()].some(session => !session.revoked && session.scope.grant.id === origin.grantId
          && session.scope.reference.runId === origin.runId)) return fail()
        const originalUsage = join(directory, origin.grantId + '.usage')
        await privatePath(originalUsage, true)
        await privatePath(join(originalUsage, 'run-' + digest(origin.runId)), false)
        // The trusted preparation role attests saved project evidence through proofDigest.
        // It also binds old and new opaque device IDs to the same physical phone.
        // The plugin does not independently verify serial numbers or replay project facts.
        if (grant.continuation) {
          const link = grant.continuation
          const previousSource = await readGrant(this.root, link.grantId)
          if (digest(previousSource) !== link.grantDigest) return fail()
          const previous = validateGrant(JSON.parse(previousSource), true)
          if (previous.id !== link.grantId || previous.profile !== 'test-history-cleanup-recovery-v1' || previous.continuation
            || ['owner', 'platform', 'bundleName'].some(key => previous[key as keyof Grant] !== grant[key as keyof Grant])
            || previous.context.historyHeading !== grant.context.historyHeading || previous.context.inputHint !== grant.context.inputHint
            || !previous.source || Object.keys(origin).some(key => origin[key as keyof typeof origin] !== previous.source![key as keyof typeof origin])
            || previous.runs[0]?.runId !== link.runId || previous.runs[0]?.texts[0] !== run.texts[0]
            || Date.parse(grant.issuedAt) < Date.parse(previous.issuedAt)) return fail()
          if ([...this.sessions.values()].some(session => !session.revoked && session.scope.grant.id === link.grantId
            && session.scope.reference.runId === link.runId)) return fail()
          const previousUsage = join(directory, link.grantId + '.usage')
          await privatePath(previousUsage, true)
          await privatePath(join(previousUsage, 'run-' + digest(link.runId)), false)
          await privatePath(join(originalUsage, 'recovery-' + digest(origin.runId + '\0' + run.texts[0])), false)
          const prepaid = (await readdir(originalUsage)).filter(name => /^delete-[1-6]$/.test(name))
          if (!prepaid.length) return fail()
          for (const name of prepaid) await privatePath(join(originalUsage, name), false)
          if ((await readdir(previousUsage)).some(name => name === 'acted' || name.startsWith('delete-'))) return fail()
          // Only a fresh preparation proof may renew an expired, closed zero-action recovery.
          // The successor and acted markers interlock even across concurrent daemon calls.
          if (!await marker(previousUsage, 'continuation-' + digest(link.runId))) return fail()
          if ((await readdir(previousUsage)).some(name => name === 'acted' || name.startsWith('delete-'))) return fail()
        } else {
          if (!await marker(originalUsage, 'recovery-' + digest(origin.runId + '\0' + run.texts[0]))) return fail()
          let prepaid = false
          for (let slot = 1; slot <= original.maxDeletes; slot++) {
            if (await marker(originalUsage, 'delete-' + slot)) { prepaid = true; break }
          }
          if (!prepaid) return fail()
        }
      }
      return { grant, reference, usage, texts: run.texts, digest: digest(source) }
    } catch { return fail() }
  }

  bind(sessionId: string, scope: Scope): void {
    this.sessions.set(sessionId, { scope, baseline: !!scope.grant.source, revoked: false,
      created: new Set(scope.grant.source ? scope.texts : []), deleted: new Set() })
  }
  has(sessionId: string): boolean { return this.sessions.has(sessionId) }
  remove(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) { session.revoked = true; this.invalidate(sessionId) }
  }
  invalidate(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) { session.latest = undefined; session.pending = undefined }
  }
  observe(value: CodexObservation): void {
    const session = this.sessions.get(value.sessionId)
    if (!session || session.revoked) return
    session.latest = structuredClone(value)
    if (session.pending) {
      try {
        const input = this.input(session, false)
        if (input.text === session.pending.text) { session.created.add(session.pending.text); session.pending = undefined }
      } catch { /* Incomplete evidence never establishes ownership. */ }
    }
  }
  private input(session: Session, empty: boolean): UiNode {
    const observation = session.latest, grant = session.scope.grant
    if (Date.parse(grant.expiresAt) <= Date.now() || !observation || observation.deviceId !== grant.deviceId
      || observation.foregroundPackage !== grant.bundleName || !observation.layout?.stable || observation.layout.truncated) return fail()
    const nodes = observation.layout.nodes
    const matches = nodes.filter(node => /^(TextInput|TextArea|EditText)$/i.test(node.type)
      && (node.hint === grant.context.inputHint || (!empty && node.hint === '')) && node.focused && node.bundleName === grant.bundleName)
    if (matches.length !== 1 || (empty && matches[0]!.text !== '')) return fail()
    if (matches[0]!.text.length >= 1000 || ['permission_required', 'text_unconfirmed'].includes(observation.actionAssessment?.status ?? '')) return fail()
    if (nodes.filter(node => node.focused).length !== 1) return fail()
    if (!empty) {
      const prior = session.pending, current = matches[0]!
      if (!prior || current.type !== prior.input.type || current.windowId !== prior.input.windowId
        || current.bundleName !== prior.input.bundleName || observation.width !== prior.width || observation.height !== prior.height) return fail()
      const before = prior.input.bounds, after = current.bounds
      // A clear button may shorten the field's right edge while its other edges stay fixed.
      if (![...Object.values(before), ...Object.values(after)].every(Number.isFinite)
        || Math.abs(after.left - before.left) > 2 || Math.abs(after.top - before.top) > 2 || Math.abs(after.bottom - before.bottom) > 2
        || after.right <= after.left || after.bottom <= after.top || after.right > before.right + 2
        || before.right - after.right > Math.min(128, (before.right - before.left) * 0.25)) return fail()
    }
    return matches[0]!
  }
  async before(sessionId: string, args: Record<string, unknown>): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    if (session.revoked) return fail()
    const { grant } = session.scope
    try {
      if (grant.source) {
        await marker(session.scope.usage, 'acted')
        await privatePath(join(session.scope.usage, 'acted'), false)
        await absent(join(session.scope.usage, 'continuation-' + digest(session.scope.reference.runId)))
      }
      if (digest(await readGrant(this.root, grant.id)) !== session.scope.digest) return fail()
      if (grant.source && digest(await readGrant(this.root, grant.source.grantId)) !== grant.source.grantDigest) return fail()
      if (grant.continuation && digest(await readGrant(this.root, grant.continuation.grantId)) !== grant.continuation.grantDigest) return fail()
    } catch { return fail() }
    if (session.revoked) return fail()
    if (Date.parse(grant.expiresAt) <= Date.now() || (args.deviceId !== undefined && args.deviceId !== grant.deviceId)) return fail()
    const effect = args.externalSideEffect
    if (effect !== 'none' && effect !== 'delete') return fail()
    if (grant.source && args.action === 'text') return fail()
    if (effect === 'delete' || args.action === 'text') {
      const input = this.input(session, true)
      const observation = session.latest!
      if (args.observationId !== observation.observationId) return fail()
      const nodes = observation.layout!.nodes
      const headings = nodes.filter(node => node.text === grant.context.historyHeading)
      let history: readonly UiNode[] = []
      // The active native page follows its editable field in the flat tree. Older
      // background Web nodes may precede it even within the same window.
      if (headings.length > 0) {
        if (headings.length !== 1) return fail()
        const heading = headings[0]!
        if (heading.type !== 'Text' || heading.bundleName !== grant.bundleName || heading.windowId !== input.windowId
          || nodes.indexOf(heading) <= nodes.indexOf(input) || heading.bounds.top <= input.bounds.bottom) return fail()
        history = nodes.slice(nodes.indexOf(heading) + 1).filter(node => node.text
          && node.bundleName === grant.bundleName && node.windowId === input.windowId)
        if (history.some(node => node.type !== 'Text' || node.bundleName !== grant.bundleName || node.windowId !== input.windowId
          || node.bounds.top < heading.bounds.bottom || !session.created.has(node.text))) return fail()
      }
      if (args.action === 'text' && effect === 'none') {
        if (typeof args.text !== 'string' || !session.scope.texts.includes(args.text) || session.created.has(args.text)) return fail()
        if (!session.baseline && headings.length !== 0) return fail()
        session.baseline = true
        session.pending = { text: args.text, input: structuredClone(input), width: observation.width, height: observation.height }
        return false
      }
      if (args.action !== 'long_press' || headings.length !== 1 || (args.durationMs !== undefined
        && (!Number.isInteger(args.durationMs) || Number(args.durationMs) < 500 || Number(args.durationMs) > 2000))) return fail()
      const allowed = new Set(['sessionId', 'deviceId', 'action', 'observationId', 'externalSideEffect', 'targetBBox', 'durationMs'])
      if (Object.keys(args).some(key => !allowed.has(key))) return fail()
      const heading = headings[0]!
      if (heading.bundleName !== grant.bundleName) return fail()
      const box = args.targetBBox as UiNode['bounds'] | undefined
      if (!box || ![box.left, box.top, box.right, box.bottom].every(Number.isFinite) || box.left >= box.right || box.top >= box.bottom) return fail()
      const candidates = history.filter(node => session.created.has(node.text) && !session.deleted.has(node.text)
        && node.bundleName === grant.bundleName && node.windowId === heading.windowId && node.bounds.top >= heading.bounds.bottom
        && box.left > node.bounds.left && box.right < node.bounds.right && box.top > node.bounds.top && box.bottom < node.bounds.bottom)
      if (candidates.length !== 1) return fail()
      const target = candidates[0]!
      if (nodes.filter(node => node.text === target.text && node.bundleName === grant.bundleName
        && node.windowId === heading.windowId).length !== 1) return fail()
      let consumed = false
      for (let slot = 1; slot <= grant.maxDeletes; slot++) {
        try { if (await marker(session.scope.usage, 'delete-' + slot)) { consumed = true; break } } catch { return fail() }
      }
      if (!consumed) return fail()
      session.deleted.add(target.text)
      session.latest = undefined
      if (session.revoked) return fail()
      return true
    }
    return false
  }
}
