import { Fragment } from "react"

import { TYPE } from "~components/system/tokens"

export function markdownInline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
      if (part.startsWith("`") && part.endsWith("`"))
        return (
          <code className="border border-border bg-background px-1 py-0.5 font-mono text-[0.8125em]" key={`${part}-${index}`}>
            {part.slice(1, -1)}
          </code>
        )
      return <Fragment key={`${part}-${index}`}>{part}</Fragment>
    })
}

function markdownCells(row: string) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

export function isMarkdownTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

export function MarkdownTable({ lines, tableKey }: { lines: string[]; tableKey: string }) {
  const [header = [], , ...bodyRows] = lines.map(markdownCells)

  return (
    <div className="my-4 overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-background/60">
            {header.map((cell, index) => (
              <th className={`${TYPE.label} p-2`} key={`${tableKey}-head-${index}`}>
                {markdownInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr className="border-b border-border align-top last:border-b-0" key={`${tableKey}-row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td className={`${TYPE.body} p-2`} key={`${tableKey}-cell-${rowIndex}-${cellIndex}`}>
                  {markdownInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MarkdownReport({ content }: { content: string }) {
  const blocks = []
  const lines = content.split(/\r?\n/)
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ""
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed === "---") {
      blocks.push(<hr className="my-5 border-border" key={`hr-${index}`} />)
      index += 1
      continue
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed)
    if (heading) {
      const level = (heading[1] ?? "").length
      const text = markdownInline(heading[2] ?? "")
      if (level === 1)
        blocks.push(
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight first:mt-0" key={`h-${index}`}>
            {text}
          </h1>
        )
      else if (level === 2)
        blocks.push(
          <h2 className="mt-6 font-display text-xl font-semibold tracking-tight" key={`h-${index}`}>
            {text}
          </h2>
        )
      else if (level === 3)
        blocks.push(
          <h3 className="mt-5 font-display text-base font-semibold tracking-tight" key={`h-${index}`}>
            {text}
          </h3>
        )
      else
        blocks.push(
          <h4 className={`${TYPE.label} mt-4`} key={`h-${index}`}>
            {text}
          </h4>
        )
      index += 1
      continue
    }

    if (trimmed.startsWith("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] ?? "")) {
      const tableLines = [line, lines[index + 1] ?? ""]
      index += 2
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        tableLines.push(lines[index] ?? "")
        index += 1
      }
      blocks.push(<MarkdownTable key={`table-${index}`} lines={tableLines} tableKey={`table-${index}`} />)
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? "").trim())) {
        items.push((lines[index] ?? "").trim().replace(/^[-*]\s+/, ""))
        index += 1
      }
      blocks.push(
        <ul className={`${TYPE.body} mt-3 list-disc pl-5`} key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{markdownInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? "").trim())) {
        items.push((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""))
        index += 1
      }
      blocks.push(
        <ol className={`${TYPE.body} mt-3 list-decimal pl-5`} key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{markdownInline(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^(#{1,4})\s+/.test((lines[index] ?? "").trim()) &&
      !/^[-*]\s+/.test((lines[index] ?? "").trim()) &&
      !/^\d+\.\s+/.test((lines[index] ?? "").trim()) &&
      !((lines[index] ?? "").trim().startsWith("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] ?? "")) &&
      (lines[index] ?? "").trim() !== "---"
    ) {
      paragraph.push((lines[index] ?? "").trim())
      index += 1
    }
    blocks.push(
      <p className={`${TYPE.body} mt-3`} key={`p-${index}`}>
        {markdownInline(paragraph.join(" "))}
      </p>
    )
  }

  return <div className="mt-3 max-w-none">{blocks}</div>
}
