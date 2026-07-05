// 依存を増やさない最小Markdownレンダラー(h1/h2/箇条書き/表/段落のみ)。
// スコープ2のreports/[id]と同じ方針。サーバ/クライアント両方のコンポーネントから使える純関数。
import type { ReactNode } from "react";

export function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      out.push(<h1 key={key++}>{line.slice(2)}</h1>);
      i++;
    } else if (line.startsWith("## ")) {
      out.push(<h2 key={key++}>{line.slice(3)}</h2>);
      i++;
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <ul key={key++}>
          {items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...bodyRows] = rows;
      out.push(
        <table key={key++}>
          <thead>
            <tr>
              {head.map((c, j) => (
                <th key={j}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, j) => (
              <tr key={j}>
                {row.map((c, k) => (
                  <td key={k}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      out.push(<p key={key++}>{line}</p>);
      i++;
    }
  }
  return out;
}
