import type { RouteModel } from "../../lib/route";
import { FileCard } from "./FileCard";
import { Hint } from "./Section";

export function InputBody({ model }: { model: RouteModel }) {
  const { inputs, answers } = model;
  return (
    <>
      {inputs.length === 0 && answers.length === 0 && <Hint>Files you attach and answers you give appear here.</Hint>}
      {inputs.length > 0 && (
        <ul className="files" aria-label="Attached files">
          {inputs.map((f) => (
            <FileCard key={f.name} file={f} />
          ))}
        </ul>
      )}
      {answers.length > 0 && (
        <dl className="answers">
          {answers.map((a) => (
            <div key={a.id} className="answer">
              <dt>{a.question}</dt>
              <dd>{a.answer}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
