import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'
import katex from 'katex'

const katexOptions = {
  throwOnError: false,
  strict: false as const,
  trust: false,
  output: 'htmlAndMathml' as const
}

function isEscaped(source: string, position: number) {
  let slashes = 0
  for (let index = position - 1; index >= 0 && source[index] === '\\'; index -= 1) slashes += 1
  return slashes % 2 === 1
}

function mathPlugin(parser: MarkdownIt) {
  parser.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    const dollarMath = state.src[state.pos] === '$' && state.src[state.pos + 1] !== '$'
    const parenthesizedMath = state.src.slice(state.pos, state.pos + 2) === '\\('
    if (!dollarMath && !parenthesizedMath) return false

    const openerLength = parenthesizedMath ? 2 : 1
    const closer = parenthesizedMath ? '\\)' : '$'
    let end = state.pos + openerLength
    while ((end = state.src.indexOf(closer, end)) !== -1) {
      if (!isEscaped(state.src, end) || parenthesizedMath) break
      end += closer.length
    }
    if (end < 0 || end === state.pos + openerLength) return false
    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.content = state.src.slice(state.pos + openerLength, end)
    }
    state.pos = end + closer.length
    return true
  })

  parser.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const maximum = state.eMarks[startLine]
    const firstLine = state.src.slice(start, maximum)
    const dollarMath = firstLine.startsWith('$$')
    const bracketMath = firstLine.startsWith('\\[')
    const environment = firstLine.match(/^\\begin\{(equation\*?|align\*?|alignat\*?|gather\*?|multline\*?|flalign\*?|aligned|gathered|cases|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\}/)?.[1]
    if (!dollarMath && !bracketMath && !environment) return false
    if (silent) return true

    const openerLength = environment ? 0 : 2
    const closer = environment ? `\\end{${environment}}` : dollarMath ? '$$' : '\\]'
    let nextLine = startLine
    let content = firstLine.slice(openerLength)
    let closed = content.trimEnd().endsWith(closer)
    if (closed) {
      content = content.trimEnd().slice(0, -closer.length)
      if (environment) content = `${firstLine.slice(0, firstLine.length - closer.length)}${closer}`
    } else {
      const lines: string[] = [content]
      while (++nextLine < endLine) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
        const line = state.src.slice(lineStart, state.eMarks[nextLine])
        if (line.trimEnd().endsWith(closer)) {
          lines.push(environment ? line : line.trimEnd().slice(0, -closer.length))
          closed = true
          break
        }
        lines.push(line)
      }
      content = lines.join('\n')
    }
    if (!closed) return false
    const token = state.push('math_block', 'math', 0)
    token.block = true; token.content = content.trim(); token.map = [startLine, nextLine + 1]
    state.line = nextLine + 1
    return true
  })

  parser.renderer.rules.math_inline = (tokens, index) => katex.renderToString(tokens[index].content, katexOptions)
  parser.renderer.rules.math_block = (tokens, index) => `<div class="katex-display-wrap">${katex.renderToString(tokens[index].content, { ...katexOptions, displayMode: true })}</div>`
}

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false })
  .use(taskLists, { enabled: false, label: true })
  .use(mathPlugin)

const defaultLink = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer')
  return defaultLink(tokens, idx, options, env, self)
}

export function renderMarkdown(source: string) {
  return DOMPurify.sanitize(md.render(source), {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: ['iframe', 'object', 'embed', 'script', 'style']
  })
}

export function titleFromContent(content: string, fallback = '無題のノート') {
  const heading = content.split('\n').find(line => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim()
  return heading || fallback
}

export function excerpt(content: string, max = 90) {
  const plain = content.replace(/```[\s\S]*?```/g, ' コード ').replace(/[#>*_`\[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim()
  return plain.length > max ? `${plain.slice(0, max)}…` : plain
}
