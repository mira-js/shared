// SPDX-License-Identifier: AGPL-3.0-only
// Ambient per-run usage carrier (ADR-019). Holds the recorder on a declared
// global so every module copy of this file shares one AsyncLocalStorage.
import { AsyncLocalStorage } from 'node:async_hooks'

export interface LlmUsageTotals {
  calls: number
  promptTokens: number
  completionTokens: number
  cacheHitTokens: number | null
}

export interface SourceUsage {
  cache: 'hit' | 'miss' | null
  billedResults: number | null
  apifyCalls: number
}

export interface RunUsageSnapshot {
  llm: LlmUsageTotals
  embeddingRequests: number
  sources: Record<string, SourceUsage>
}

export interface UsageRecorder {
  snapshot(): RunUsageSnapshot
}

interface MutableRecorder extends UsageRecorder {
  addLlm(u: { promptTokens: number; completionTokens: number; cacheHitTokens?: number }): void
  addEmbeddingRequest(): void
  source(name: string): SourceUsage
}

interface ScopeState {
  recorder: MutableRecorder
  source: string | null
}

declare global {
  var __miraUsageScope: AsyncLocalStorage<ScopeState> | undefined
  var __miraUsageRecorders: WeakMap<UsageRecorder, MutableRecorder> | undefined
}

const store = (globalThis.__miraUsageScope ??= new AsyncLocalStorage<ScopeState>())

const recorders = (globalThis.__miraUsageRecorders ??= new WeakMap<UsageRecorder, MutableRecorder>())

const UNATTRIBUTED = '_unattributed'

function freshSource(): SourceUsage {
  return { cache: null, billedResults: 0, apifyCalls: 0 }
}

export function createUsageRecorder(): UsageRecorder {
  const llm: LlmUsageTotals = { calls: 0, promptTokens: 0, completionTokens: 0, cacheHitTokens: null }
  const counters = { embeddingRequests: 0 }
  const sources = new Map<string, SourceUsage>()

  const recorder: MutableRecorder = {
    snapshot: () => ({
      llm: { ...llm },
      embeddingRequests: counters.embeddingRequests,
      sources: Object.fromEntries([...sources].map(([k, v]) => [k, { ...v }])),
    }),
    addLlm: (u) => {
      llm.calls += 1
      llm.promptTokens += u.promptTokens
      llm.completionTokens += u.completionTokens
      if (u.cacheHitTokens !== undefined) llm.cacheHitTokens = (llm.cacheHitTokens ?? 0) + u.cacheHitTokens
    },
    addEmbeddingRequest: () => {
      counters.embeddingRequests += 1
    },
    source: (name) => {
      const existing = sources.get(name)
      if (existing) return existing
      const created = freshSource()
      sources.set(name, created)
      return created
    },
  }
  recorders.set(recorder, recorder)
  return recorder
}

export function runWithUsageRecorder<T>(r: UsageRecorder, fn: () => Promise<T>): Promise<T> {
  const recorder = recorders.get(r)
  if (!recorder) return fn()
  return store.run({ recorder, source: null }, fn)
}

export function runInUsageSource<T>(source: string, fn: () => Promise<T>): Promise<T> {
  const state = store.getStore()
  if (!state) return fn()
  state.recorder.source(source)
  return store.run({ recorder: state.recorder, source }, fn)
}

export function recordLlmUsage(u: { promptTokens: number; completionTokens: number; cacheHitTokens?: number }): void {
  store.getStore()?.recorder.addLlm(u)
}

export function recordEmbeddingRequest(): void {
  store.getStore()?.recorder.addEmbeddingRequest()
}

export function recordApifyCall(): void {
  const state = store.getStore()
  if (!state) return
  state.recorder.source(state.source ?? UNATTRIBUTED).apifyCalls += 1
}

export function recordBilledResults(count: number | null): void {
  const state = store.getStore()
  if (!state) return
  const entry = state.recorder.source(state.source ?? UNATTRIBUTED)
  entry.billedResults = count === null || entry.billedResults === null ? null : entry.billedResults + count
}

export function recordSourceCache(hit: boolean): void {
  const state = store.getStore()
  if (!state || state.source === null) return
  state.recorder.source(state.source).cache = hit ? 'hit' : 'miss'
}
