import { type ReactNode } from "react";
import {
  Disclosure as AriaDisclosure,
  DisclosurePanel,
} from "react-aria-components/Disclosure";

type Disclosure = {
  expanded: boolean;
};

// Keep disclosure state local: toggling one line does not rerender its siblings.
export function OrderLineCard({
  state,
  children,
}: {
  state: string;
  children: (disclosure: Disclosure) => ReactNode;
}) {
  return (
    <article className="line-card" data-state={state}>
      <AriaDisclosure defaultExpanded>
        {({ isExpanded }) =>
          children({
            expanded: isExpanded,
          })
        }
      </AriaDisclosure>
    </article>
  );
}

export function LineDisclosure({
  expanded,
  children,
}: Pick<Disclosure, "expanded"> & { children: ReactNode }) {
  return (
    <DisclosurePanel
      className="line-disclosure"
      data-expanded={expanded}
      aria-hidden={!expanded}
      inert={!expanded}
    >
      <div className="line-disclosure-inner">{children}</div>
    </DisclosurePanel>
  );
}
