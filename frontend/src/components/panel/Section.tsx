import type { ReactNode } from "react";
import { Chevron } from "./icons";

type Props = {
  title: string;
  count?: number;
  /** Initial state. When it changes (a file arrives, the plan starts) the section follows. */
  open?: boolean;
  children: ReactNode;
};

/** Collapsible panel section built on native <details> for free keyboard and a11y behaviour. */
export function Section({ title, count, open = true, children }: Props) {
  return (
    <details className="sec" open={open}>
      <summary>
        <span className="sec-title">{title}</span>
        {count ? <span className="sec-count">{count}</span> : null}
        <Chevron className="sec-chev" />
      </summary>
      <div className="sec-body">{children}</div>
    </details>
  );
}

export const Hint = ({ children }: { children: ReactNode }) => <p className="hint">{children}</p>;
