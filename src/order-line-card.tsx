import { ChevronDown } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import {
  Disclosure as AriaDisclosure,
  DisclosurePanel,
} from "react-aria-components/Disclosure";
import {
  productUnitCost,
  type LinkedMaterialLine,
} from "../shared/product-unit-cost";
import { orderReference } from "../shared/schema";
import { ControlLink } from "./components/controls";
import { Button, money, useApp } from "./ui";

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

export function ProductCostSummary({
  price,
  orderNumber,
  linked,
  children,
}: {
  price: string;
  orderNumber: string;
  linked?: readonly LinkedMaterialLine[];
  children: (metric: ReactNode) => ReactNode;
}) {
  const { db } = useApp();
  const { total, materials } = useMemo(
    () => productUnitCost(price, linked ?? []),
    [price, linked],
  );
  return (
    <AriaDisclosure className="product-cost-summary">
      {({ isExpanded }) => (
        <>
          {children(
            <div>
              <dt>Costo total unitario</dt>
              <dd className="num">{money(total)}</dd>
              <dd>
                <Button
                  className="product-cost-toggle"
                  slot="trigger"
                  variant="link"
                  icon={ChevronDown}
                >
                  {isExpanded ? "Ocultar desglose" : "Ver desglose"}
                </Button>
              </dd>
            </div>,
          )}
          <DisclosurePanel
            className="product-cost-panel"
            aria-hidden={!isExpanded}
            inert={!isExpanded}
          >
            {isExpanded && (
              <dl className="product-cost-breakdown">
                <div>
                  <dt>
                    Precio unitario · {orderReference("producto", orderNumber)}
                  </dt>
                  <dd className="num">{money(price)}</dd>
                </div>
                {materials.map(({ line, order }) => (
                  <div key={line.id}>
                    <dt>
                      {db.materiales.find(
                        (item) => item.id === line.id_material,
                      )?.nombre_material || "Material"}{" "}
                      <ControlLink href={`/ordenes/${order.id}`}>
                        {orderReference("material", order.no_orden)}
                      </ControlLink>
                    </dt>
                    <dd className="num">{money(line.precio_unitario)}</dd>
                  </div>
                ))}
                <div className="product-cost-total">
                  <dt>Costo total unitario</dt>
                  <dd className="num">{money(total)}</dd>
                </div>
              </dl>
            )}
            {isExpanded && !materials.length && (
              <p className="compact-note product-cost-empty">
                Sin materiales vinculados vigentes
              </p>
            )}
          </DisclosurePanel>
        </>
      )}
    </AriaDisclosure>
  );
}
