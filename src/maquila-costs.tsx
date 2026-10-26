import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { costos_maquila } from "../shared/models";
import type { Row } from "../shared/schema";
import { costDay } from "../shared/maquila-costs";
import { ControlInput, CustomFilterSelect } from "./components/controls";
import {
  DataTable,
  TableCell,
  TableColumn,
  TableHead,
  TableRow,
  TableRows,
} from "./components/data-table";
import {
  GroupedRelationsTable,
  type RelationGroup,
} from "./components/relations";
import { confirmAction } from "./components/overlays";
import { CatalogForm } from "./forms";
import { Button, Empty, money, shortDate, useApp } from "./ui";

type Editor = { record?: costos_maquila; productId?: string };
const searchDate = (value: string | null) =>
  value
    ? `${shortDate(value)} ${costDay(value)} ${costDay(value)?.split("-").reverse().join("/")}`
    : "";
const lockedProduct = ["id_producto"] as const;
const countCosts = (count: number) =>
  `${count} ${count === 1 ? "costo" : "costos"}`;

export function MaquilaCostsTable() {
  const { db, run, notify } = useApp();
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim().toLocaleLowerCase("es-CO"));
  const [allProducts, setAllProducts] = useState(false);
  const [expanded, setExpanded] = useState(new Set<string>());
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removedCost, setRemovedCost] = useState<costos_maquila | null>(null);
  const deletingGuard = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const origin = useRef<{ trigger: HTMLElement | null; top: number }>({
    trigger: null,
    top: 0,
  });
  const restore = useCallback((productId?: string) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = productId
          ? document.querySelector<HTMLButtonElement>(
              `[data-cost-add="${productId}"]`,
            )
          : origin.current.trigger;
        (target?.isConnected ? target : addButton.current)?.focus({
          preventScroll: true,
        });
        window.scrollTo({ top: origin.current.top, behavior: "instant" });
      }),
    );
  }, []);
  const open = useCallback((next: Editor) => {
    origin.current = {
      trigger: document.activeElement as HTMLElement | null,
      top: window.scrollY,
    };
    setEditor(next);
  }, []);
  const close = () => {
    setEditor(null);
    restore();
  };
  useEffect(() => {
    if (
      !removedCost ||
      db.costos_maquila.some((cost) => cost.id === removedCost.id)
    )
      return;
    // Choose a surviving focus target only after React commits the new collection.
    // The command can resolve before the former product row is removed.
    restore(removedCost.id_producto);
    setRemovedCost(null);
  }, [removedCost, db.costos_maquila, restore]);
  const remove = useCallback(
    async (cost: costos_maquila) => {
      if (deletingGuard.current) return;
      deletingGuard.current = true;
      origin.current = {
        trigger: document.activeElement as HTMLElement | null,
        top: window.scrollY,
      };
      try {
        if (
          !(await confirmAction(
            "¿Eliminar este costo de maquila? Las órdenes conservarán sus precios guardados.",
            "Eliminar costo",
            true,
          ))
        )
          return;
        setDeleting(cost.id);
        await run(
          "deleteEntity",
          { entity: "costos_maquila", key: { id: cost.id } },
          "Costo eliminado",
        );
        setRemovedCost(cost);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el costo.",
          true,
        );
      } finally {
        deletingGuard.current = false;
        setDeleting(null);
      }
    },
    [run, notify],
  );
  const productCosts = useMemo(() => {
    const byProduct = new Map<string, costos_maquila[]>();
    for (const cost of db.costos_maquila) {
      const list = byProduct.get(cost.id_producto) ?? [];
      list.push(cost);
      byProduct.set(cost.id_producto, list);
    }
    for (const list of byProduct.values())
      list.sort(
        (a, b) =>
          costDay(b.fecha_inicio)!.localeCompare(costDay(a.fecha_inicio)!) ||
          a.id.localeCompare(b.id),
      );
    return byProduct;
  }, [db.costos_maquila]);
  const groups = useMemo<RelationGroup[]>(() => {
    const names = new Map<string, number>();
    for (const product of db.productos)
      names.set(
        product.nombre_producto,
        (names.get(product.nombre_producto) ?? 0) + 1,
      );
    return [...db.productos]
      .sort(
        (a, b) =>
          a.nombre_producto.localeCompare(b.nombre_producto, "es") ||
          a.id.localeCompare(b.id),
      )
      .flatMap((product) => {
        const costs = productCosts.get(product.id) ?? [];
        if (!allProducts && !costs.length) return [];
        const provider = db.proveedor.find(
          (row) => row.id === product.id_maquilador,
        );
        const label =
          names.get(product.nombre_producto)! > 1
            ? `${product.nombre_producto} · ${provider?.nombre_corto || provider?.nombre_largo || "Sin maquilador"} · ${product.id.slice(-6)}`
            : product.nombre_producto;
        const matches =
          `${label} ${costs.map((cost) => `${cost.costo} ${money(cost.costo)} ${searchDate(cost.fecha_inicio)} ${searchDate(cost.fecha_fin)}`).join(" ")}`
            .toLocaleLowerCase("es-CO")
            .includes(search);
        if (!matches) return [];
        return [
          {
            id: product.id,
            label,
            count: costs.length,
            autoExpand: Boolean(search),
            details: (
              <DataTable
                className="data-table maquila-cost-history"
                aria-label={`Costos de ${label}`}
              >
                <TableHead>
                  <TableRow>
                    <TableColumn>Costo de maquila</TableColumn>
                    <TableColumn>Vigente desde</TableColumn>
                    <TableColumn>Vigente hasta</TableColumn>
                    <TableColumn>
                      <span className="visually-hidden">Acciones</span>
                    </TableColumn>
                  </TableRow>
                </TableHead>
                <TableRows>
                  {costs.map((cost) => (
                    <TableRow key={cost.id} className="maquila-cost-row">
                      <TableCell>{money(cost.costo)}</TableCell>
                      <TableCell>{shortDate(cost.fecha_inicio)}</TableCell>
                      <TableCell>
                        {cost.fecha_fin ? shortDate(cost.fecha_fin) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="inline maquila-cost-actions">
                          <Button
                            className="icon-btn table-action"
                            icon={Pencil}
                            disabled={deleting === cost.id}
                            aria-label={`Editar costo ${money(cost.costo)} de ${label}`}
                            onClick={() => open({ record: cost })}
                          />
                          <Button
                            className="icon-btn table-action delete-action"
                            icon={Trash2}
                            disabled={deleting === cost.id}
                            aria-label={`Eliminar costo ${money(cost.costo)} de ${label}`}
                            onClick={() => void remove(cost)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableRows>
              </DataTable>
            ),
          },
        ];
      });
  }, [
    db.productos,
    db.proveedor,
    productCosts,
    allProducts,
    search,
    deleting,
    open,
    remove,
  ]);
  const toggle = useCallback(
    (id: string) => {
      const isOpen =
        !collapsed.has(id) && (expanded.has(id) || Boolean(search));
      setExpanded((current) => {
        const next = new Set(current);
        isOpen ? next.delete(id) : next.add(id);
        return next;
      });
      setCollapsed((current) => {
        const next = new Set(current);
        isOpen ? next.add(id) : next.delete(id);
        return next;
      });
    },
    [collapsed, expanded, search],
  );
  const renderAction = useCallback(
    (group: RelationGroup) => (
      <Button
        className="icon-btn table-action"
        icon={Plus}
        data-cost-add={group.id}
        aria-label={`Agregar costo de ${group.label}`}
        onClick={() => open({ productId: group.id })}
      />
    ),
    [open],
  );
  const empty = useMemo(
    () => (
      <Empty
        title={search ? "Sin coincidencias" : "No hay productos con costos"}
        description={
          search
            ? "Prueba otro producto, importe o fecha."
            : "Selecciona Todos los productos o utiliza Agregar para registrar un costo."
        }
      />
    ),
    [search],
  );
  const saved = (row: Row) => {
    setExpanded((current) => new Set([...current, row.id_producto]));
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(row.id_producto);
      return next;
    });
  };
  return (
    <>
      <section className="panel maquila-costs-panel">
        <div className="section-heading">
          <div>
            <h2>Costos de maquila</h2>
            <p>
              {groups.length} {groups.length === 1 ? "producto" : "productos"}
              {allProducts ? "" : " con costos"}
            </p>
          </div>
          <div className="inline maquila-cost-heading-actions">
            <CustomFilterSelect
              aria-label="Filtro personalizado de costos"
              value={allProducts ? "todos" : "con_costos"}
              onChange={(event) =>
                setAllProducts(event.target.value === "todos")
              }
            >
              <option value="con_costos">Con costos</option>
              <option value="todos">Todos los productos</option>
            </CustomFilterSelect>
            <Button
              ref={addButton}
              icon={Plus}
              variant="primary"
              onClick={() => open({})}
            >
              Agregar
            </Button>
          </div>
        </div>
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <ControlInput
              className="control"
              type="search"
              aria-label="Buscar costos de maquila"
              placeholder="Buscar producto, importe o fecha…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCollapsed(new Set());
              }}
            />
          </div>
          {query && (
            <Button
              variant="link"
              onClick={() => {
                setQuery("");
                setCollapsed(new Set());
              }}
            >
              Limpiar búsqueda
            </Button>
          )}
        </div>
        <GroupedRelationsTable
          groups={groups}
          expanded={expanded}
          collapsed={collapsed}
          onToggle={toggle}
          renderAction={renderAction}
          groupLabel="Producto"
          tableLabel="Costos de maquila por producto"
          relationName="costos"
          countLabel={countCosts}
          empty={empty}
        />
        <div className="table-footer">
          <span>
            {groups.length} productos ·{" "}
            {groups.reduce((total, group) => total + group.count, 0)} costos
          </span>
        </div>
      </section>
      {editor && (
        <CatalogForm
          entity="costos_maquila"
          record={editor.record}
          initialValues={
            editor.productId ? { id_producto: editor.productId } : undefined
          }
          readOnlyFields={editor.productId ? lockedProduct : undefined}
          onSaved={saved}
          onClose={close}
        />
      )}
    </>
  );
}
