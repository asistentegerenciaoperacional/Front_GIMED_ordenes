import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { makeSeed } from "../shared/seed";
import {
  buildProductSheet,
  productSheetColumns,
} from "../src/product-order-sheet-model";
import { SheetSelection } from "../src/product-sheet-selection";
import { ProductSheetGrid } from "../src/components/product-sheet-grid";
import "../src/styles.css";
import "../src/product-order-sheet.css";

const source = buildProductSheet(makeSeed(), "seguimiento")[0];
const rows = Array.from({ length: 500 }, (_, i) => ({
  ...source,
  key: `fixture-${i}`,
}));
const probe = { renders: 0, reads: [] as unknown[] };
(window as typeof window & { sheetProbe: typeof probe }).sheetProbe = probe;
function Fixture() {
  const [selection] = useState(() => new SheetSelection());
  return (
    <section className="product-order-sheet">
      <ProductSheetGrid
        rows={rows}
        columns={productSheetColumns}
        selection={selection}
        view="seguimiento"
        renderCell={(_row, col) => {
          probe.renders++;
          return col.key;
        }}
        renderHeader={(col) => col.label}
        onEdit={() => probe.reads.push(["edit", selection.read()])}
        editor={null}
        editing={null}
        onCommit={() => true}
        onCancel={() => {}}
        onCopy={() => probe.reads.push(["copy", selection.read()])}
        onPaste={() => probe.reads.push(["paste", selection.read()])}
        onClear={() => probe.reads.push(["clear", selection.read()])}
        onHideColumns={() => selection.reset()}
      />
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
