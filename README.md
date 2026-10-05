# @mira/shared-core

[![npm](https://img.shields.io/npm/v/@mira/shared-core)](https://www.npmjs.com/package/@mira/shared-core)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

Shared TypeScript types for the MIRA ecosystem. This is the contract between collectors, the analysis pipeline, and API consumers. If you are writing a custom collector or consuming the API in TypeScript, this is the only package you need.

---

## Install

```bash
npm install @mira/shared-core
# or
pnpm add @mira/shared-core
```

---

## Exports

### Sources

```ts
import { CoreSource } from '@mira/shared-core'

CoreSource.reddit      // 'reddit'
CoreSource.hackernews  // 'hackernews'
CoreSource.news        // 'news'

// Community collectors can use any string slug — e.g. 'lobsters', 'capterra'
```

### CollectedItem

The normalized output every collector must return.

```ts
interface CollectedItem {
  source: string        // source slug (use CoreSource values for built-in sources)
  url: string           // canonical link to the original post/article
  title: string
  body: string          // post body or article text
  author: string
  timestamp: string     // ISO 8601
  engagement: {
    upvotes: number
    comments: number
  }
  raw_replies: string[] // top-level reply texts (optional, can be empty)
  subreddit?: string    // present on Reddit items
  category?: string     // present on RSS/News items (feed title)
}
```

### Collector interface

```ts
interface CollectorOptions {
  query: string
  limit?: number
}

interface Collector {
  collect(options: CollectorOptions): Promise<CollectedItem[]>
}
```

Any class or object satisfying `Collector` can be plugged into the pipeline.

### ResearchJob

Returned by the API on enqueue and status polling.

```ts
type JobStatus = 'queued' | 'active' | 'completed' | 'failed'
type ResearchDepth = 'quick' | 'deep'

interface ResearchJobInput {
  query: string
  sources?: string[]
  depth?: ResearchDepth
}

interface ResearchJob extends ResearchJobInput {
  jobId: string
  status: JobStatus
  progress?: number   // 0–100
  createdAt: string
  result?: ResearchResult
}
```

### ResearchResult

The fully analyzed output returned when a job completes.

```ts
interface PainPointTheme {
  theme: string
  frequency: number
  sources: string[]
  sentiment: number    // -1.0 (very negative) to 1.0 (very positive)
  evidence: Evidence[]
}

interface Evidence {
  source: string
  url: string
  excerpt: string
}

interface ResearchResult {
  query: string
  summary: string
  painPoints: PainPointTheme[]
  competitorWeaknesses: PainPointTheme[]
  emergingGaps: PainPointTheme[]
  rawItems: CollectedItem[]
}
```

### ExtractionResult

Per-item LLM output before theme aggregation.

```ts
type Sentiment = 'negative' | 'neutral' | 'positive'

type Category =
  | 'complaint'
  | 'feature-request'
  | 'workflow-friction'
  | 'pricing'
  | 'switching-signal'

interface ExtractionResult {
  pain_points: string[]
  sentiment: Sentiment
  category: Category
  mentioned_tools: string[]
  key_quote: string
}
```

### Result\<T, E\>

Railway-oriented result type used throughout the codebase. Avoid `throw` in service functions — return `Result` instead.

```ts
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

// Usage
function divide(a: number, b: number): Result<number> {
  if (b === 0) return { ok: false, error: new Error('Division by zero') }
  return { ok: true, value: a / b }
}

const r = divide(10, 2)
if (r.ok) console.log(r.value)  // 5
```

### OpenViking types

Used internally by the analysis pipeline. Exported for consumers building on top of the OpenViking context store.

```ts
interface OpenVikingResource { uri: string; content: string; metadata: OpenVikingResourceMetadata }
interface OpenVikingFindOptions { scope: string; maxResults: number; layers: ('L0'|'L1'|'L2')[] }
```

---

## Writing a custom collector

```ts
import type { Collector, CollectorOptions, CollectedItem } from '@mira/shared-core'

export class LobstersCollector implements Collector {
  async collect({ query, limit = 25 }: CollectorOptions): Promise<CollectedItem[]> {
    const url = `https://lobste.rs/search.json?q=${encodeURIComponent(query)}&what=stories&order=relevance`
    const { results } = await fetch(url).then((r) => r.json())

    return results.slice(0, limit).map((story: any) => ({
      source: 'lobsters',
      url: story.short_id_url,
      title: story.title,
      body: story.description ?? '',
      author: story.submitter_user.username,
      timestamp: story.created_at,
      engagement: { upvotes: story.score, comments: story.comment_count },
      raw_replies: [],
    }))
  }
}
```

---

## Part of mira-core

This package is part of the [mira-core](https://github.com/mira-js/mira-core) monorepo — a self-hostable market intelligence engine.

---

## License

AGPL-3.0-only — see [LICENSE](./LICENSE).
Contributions require signing the [CLA](https://github.com/mira-js/.github/blob/main/CLA.md) — see [CONTRIBUTING.md](https://github.com/mira-js/.github/blob/main/CONTRIBUTING.md).

Copyright (C) 2026 Fernando Nieto Pallares
