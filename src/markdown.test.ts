import { describe, expect, it } from 'vitest'
import { excerpt, renderMarkdown, titleFromContent } from './markdown'

describe('Markdown utilities', () => {
  it('renders headings and task lists', () => {
    const html = renderMarkdown('# 見出し\n\n- [x] 完了')
    expect(html).toContain('<h1>見出し</h1>')
    expect(html).toContain('type="checkbox"')
  })

  it('does not execute raw HTML', () => {
    const html = renderMarkdown('<script>alert(1)</script><iframe src="evil"></iframe>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<iframe')
  })

  it('extracts a title and readable excerpt', () => {
    expect(titleFromContent('text\n# 日本語の題名')).toBe('日本語の題名')
    expect(excerpt('## 見出し\n**大切な本文**')).toContain('大切な本文')
  })

  it('renders inline and block KaTeX safely', () => {
    const html = renderMarkdown('Inline $E=mc^2$\n\n$$\\frac{a}{b}$$')
    expect(html).toContain('class="katex"')
    expect(html).toContain('katex-display-wrap')
  })

  it('keeps Mermaid source available for deferred rendering', () => {
    const html = renderMarkdown('```mermaid\ngraph TD\n A-->B\n```')
    expect(html).toContain('language-mermaid')
    expect(html).toContain('graph TD')
  })
})
