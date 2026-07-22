import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'
import katex from 'katex'

function mathPlugin(parser: MarkdownIt) {
  parser.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$' || state.src[state.pos + 1] === '$') return false
    let end = state.pos + 1
    while ((end = state.src.indexOf('$', end)) !== -1) {
      if (state.src[end - 1] !== '\\') break
      end += 1
    }
    if (end < 0 || end === state.pos + 1) return false
    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.content = state.src.slice(state.pos + 1, end)
    }
    state.pos = end + 1
    return true
  })

  parser.block.ruler.after('blockquote', 'math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const maximum = state.eMarks[startLine]
    if (state.src.slice(start, start + 2) !== '$$') return false
    if (silent) return true
    let nextLine = startLine
    let content = state.src.slice(start + 2, maximum)
    if (content.trimEnd().endsWith('$$')) content = content.trimEnd().slice(0, -2)
    else {
      const lines: string[] = [content]
      while (++nextLine < endLine) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
        const line = state.src.slice(lineStart, state.eMarks[nextLine])
        if (line.trimEnd().endsWith('$$')) { lines.push(line.trimEnd().slice(0, -2)); break }
        lines.push(line)
      }
      content = lines.join('\n')
    }
    const token = state.push('math_block', 'math', 0)
    token.block = true; token.content = content.trim(); token.map = [startLine, nextLine + 1]
    state.line = nextLine + 1
    return true
  })

  parser.renderer.rules.math_inline = (tokens, index) => katex.renderToString(tokens[index].content, { throwOnError: false, strict: 'warn' })
  parser.renderer.rules.math_block = (tokens, index) => `<div class="katex-display-wrap">${katex.renderToString(tokens[index].content, { displayMode: true, throwOnError: false, strict: 'warn' })}</div>`
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
