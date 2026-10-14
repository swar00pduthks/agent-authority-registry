import { fileUrl } from "../../lib/langgraph";
import type { FileRef } from "../../lib/route";

const formatSize = (n?: number) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 4) : "FILE");

type Props = { file: FileRef; /** Output files get Open and Download links. */ output?: boolean };

export function FileCard({ file, output }: Props) {
  const href = output && file.url ? fileUrl(file.url) : undefined;
  const image = href && file.mime?.startsWith("image/");
  return (
    <li className="file">
      <span className="file-badge" aria-hidden="true">{extOf(file.name)}</span>
      <span className="file-main">
        <span className="file-name">{file.name}</span>
        {file.size != null && <span className="file-meta">{formatSize(file.size)}</span>}
      </span>
      {href && (
        <span className="file-actions">
          <a href={href} target="_blank" rel="noreferrer">Open</a>
          <a href={href} download={file.name}>Download</a>
        </span>
      )}
      {image && <img className="file-thumb" src={href} alt={file.name} />}
    </li>
  );
}
