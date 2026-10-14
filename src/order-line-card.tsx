import { useId, useState, type ReactNode } from "react";

type Disclosure = {
  expanded: boolean;
  contentId: string;
  toggle: () => void;
};

// Keep disclosure state local: toggling one line does not rerender its siblings.
export function OrderLineCard({
  state,
  children,
}: {
  state: string;
  children: (disclosure: Disclosure) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  return (
    <article className="line-card" data-state={state}>
      {children({
        expanded,
        contentId,
        toggle: () => setExpanded((current) => !current),
      })}
    </article>
  );
}

export function LineDisclosure({
  expanded,
  contentId,
  children,
}: Pick<Disclosure, "expanded" | "contentId"> & { children: ReactNode }) {
  return (
    <div
      id={contentId}
      className="line-disclosure"
      data-expanded={expanded}
      aria-hidden={!expanded}
      inert={!expanded}
    >
      <div className="line-disclosure-inner">{children}</div>
    </div>
  );
}
