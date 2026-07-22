import { memo, useEffect, useMemo, useRef } from 'react'
import DOMPurify from 'dompurify'
import { renderMarkdown } from './markdown'

let diagramId = 0
let mermaidReady = false

type Props = { source: string; className?: string; label?: string }

export const MarkdownView = memo(function MarkdownView({ source, className = 'markdown-body', label }: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const html = useMemo(() => renderMarkdown(source), [source])

  useEffect(() => {
    let cancelled = false
    const renderDiagrams = async () => {
      const blocks = Array.from(rootRef.current?.querySelectorAll('pre > code.language-mermaid') || [])
      if (!blocks.length) return
      const { default: mermaid } = await import('mermaid')
      if (!mermaidReady) {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', suppressErrorRendering: true })
        mermaidReady = true
      }
      for (const block of blocks) {
        if (cancelled) return
        const container = block.parentElement
        if (!container) continue
        const sourceCode = block.textContent || ''
        try {
          const { svg } = await mermaid.render(`mdrwer-diagram-${++diagramId}`, sourceCode)
          if (cancelled) return
          const figure = document.createElement('figure')
          figure.className = 'mermaid-diagram'
          figure.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
          container.replaceWith(figure)
        } catch {
          const error = document.createElement('p')
          error.className = 'mermaid-error'
          error.textContent = 'Mermaidを描画できませんでした。元のコードを表示しています。'
          container.before(error)
        }
      }
    }
    void renderDiagrams()
    return () => { cancelled = true }
  }, [html])

  return <article ref={rootRef} className={className} aria-label={label} dangerouslySetInnerHTML={{ __html: html }} />
})
