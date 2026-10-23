import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, Trash2 } from "lucide-react";
import { canonical } from "../shared/schema";
import {
  materialRole,
  productMaterialConfig,
  productMaterialConfigIssue,
  type ProductMaterialConfig,
} from "../shared/product-materials";
import {
  CheckChoice,
  ControlForm,
  ControlInput,
  ControlSelect,
  FieldEditContext,
} from "./components/controls";
import {
  GroupedRelationsTable,
  MultiRelationPicker,
  type RelationGroup,
} from "./components/relations";
import {
  DataTable,
  TableCell,
  TableColumn,
  TableHead,
  TableRow,
  TableRows,
} from "./components/data-table";
import { ActionTooltip, confirmAction } from "./components/overlays";
import {
  ApiError,
  Button,
  CancelButton,
  Dialog,
  Empty,
  ErrorNotice,
  Field,
  MaterialPicker,
  useApp,
} from "./ui";

const filters = [
  ["todos", "Todos los productos"],
  ["con_materiales", "Con materiales"],
  ["sin_materiales", "Sin materiales"],
  ["full", "Maquila full"],
  ["parcial", "Maquila parcial"],
  ["cinta", "Con cinta"],
  ["sticker", "Con sticker"],
  ["sin_corrugado", "Sin corrugado asignado"],
] as const;
type Filter = (typeof filters)[number][0];
const countLabel = (count: number) =>
  `${count} ${count === 1 ? "material" : "materiales"}`;
const code = (value: number | null) =>
  value == null ? "—" : String(value).padStart(3, "0");
const equal = (a: ProductMaterialConfig, b: ProductMaterialConfig) =>
  JSON.stringify({ ...a, id_materiales: [...a.id_materiales].sort() }) ===
  JSON.stringify({ ...b, id_materiales: [...b.id_materiales].sort() });

export function ProductMaterialsTable() {
  const { db } = useApp();
  const [query, setQuery] = useState("");
  const q = useDeferredValue(canonical(query));
  const [filter, setFilter] = useState<Filter>("todos");
  const [expanded, setExpanded] = useState(new Set<string>());
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [editing, setEditing] = useState<string | null>(null);
  const origin = useRef({
    top: 0,
    left: 0,
    trigger: null as HTMLElement | null,
  });
  const panel = useRef<HTMLElement>(null);
  const edit = useCallback((id: string) => {
    origin.current = {
      top: window.scrollY,
      left: panel.current?.querySelector(".table-scroll")?.scrollLeft ?? 0,
      trigger: document.activeElement as HTMLElement,
    };
    setEditing(id);
  }, []);
  const close = () => {
    setEditing(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (origin.current.trigger?.isConnected)
          origin.current.trigger.focus({ preventScroll: true });
        else
          panel.current
            ?.querySelector<HTMLInputElement>('input[type="search"]')
            ?.focus({ preventScroll: true });
        const scroll = panel.current?.querySelector(".table-scroll");
        if (scroll) scroll.scrollLeft = origin.current.left;
        window.scrollTo({ top: origin.current.top, behavior: "instant" });
      }),
    );
  };
  const groups = useMemo<RelationGroup[]>(() => {
    const materials = new Map(db.materiales.map((row) => [row.id, row]));
    const types = new Map(
      db.tipos_materiales.map((row) => [
        row.id,
        row.tipo_material ?? "Sin tipo",
      ]),
    );
    const providers = new Map(
      db.proveedor.map((row) => [row.id, row.nombre_corto || row.nombre_largo]),
    );
    const names = new Map<string, number>();
    for (const product of db.productos)
      names.set(
        product.nombre_producto,
        (names.get(product.nombre_producto) ?? 0) + 1,
      );
    const associated = new Map<string, string[]>();
    for (const row of db.materiales_asociados) {
      const list = associated.get(row.id_producto) ?? [];
      list.push(row.id_material);
      associated.set(row.id_producto, list);
    }
    const boxes = new Map(
      db.producto_corrugado.map((row) => [row.id_producto, row]),
    );
    return [...db.productos]
      .sort(
        (a, b) =>
          a.nombre_producto.localeCompare(b.nombre_producto, "es") ||
          a.id.localeCompare(b.id),
      )
      .flatMap((product) => {
        const ids = associated.get(product.id) ?? [],
          box = boxes.get(product.id),
          count = ids.length + (box ? 1 : 0);
        if (
          (filter === "con_materiales" && count === 0) ||
          (filter === "sin_materiales" && count > 0) ||
          (filter === "full" && ids.length) ||
          (filter === "parcial" && !ids.length) ||
          (filter === "sin_corrugado" && box)
        )
          return [];
        if (
          (filter === "cinta" || filter === "sticker") &&
          !ids.some((id) => materialRole(db, id) === filter)
        )
          return [];
        const label =
          names.get(product.nombre_producto)! > 1
            ? `${product.nombre_producto} · ${providers.get(product.id_maquilador) ?? "Sin maquilador"} · ${product.id.slice(-6)}`
            : product.nombre_producto;
        const list = ids
          .map((id) => materials.get(id)!)
          .sort(
            (a, b) =>
              (types.get(a.id_tipo_material) ?? "").localeCompare(
                types.get(b.id_tipo_material) ?? "",
                "es",
              ) ||
              (a.nombre_material ?? "").localeCompare(
                b.nombre_material ?? "",
                "es",
              ) ||
              a.id.localeCompare(b.id),
          );
        const all = [
          ...list,
          ...(box ? [materials.get(box.id_material)!] : []),
        ];
        if (
          !canonical(
            `${label} ${providers.get(product.id_maquilador) ?? ""} ${all.map((m) => `${m.nombre_material} ${types.get(m.id_tipo_material)} ${code(m.codigo_material)}`).join(" ")}`,
          ).includes(q)
        )
          return [];
        return [
          {
            id: product.id,
            label,
            count,
            autoExpand: Boolean(q),
            details: (
              <DataTable
                className="data-table product-material-history"
                aria-label={`Materiales de ${label}`}
              >
                <TableHead>
                  <TableRow>
                    <TableColumn>Tipo de material</TableColumn>
                    <TableColumn>Material</TableColumn>
                    <TableColumn>Código MAIA</TableColumn>
                  </TableRow>
                </TableHead>
                <TableRows>
                  <TableRow>
                    <TableCell>Corrugado</TableCell>
                    <TableCell>
                      {box ? (
                        <>
                          {materials.get(box.id_material)?.nombre_material}
                          <small>
                            {box.unidades_por_corrugado} unidades por corrugado
                          </small>
                        </>
                      ) : (
                        "Sin asignar"
                      )}
                    </TableCell>
                    <TableCell>
                      {box
                        ? code(
                            materials.get(box.id_material)?.codigo_material ??
                              null,
                          )
                        : "—"}
                    </TableCell>
                  </TableRow>
                  {list.map((material) => (
                    <TableRow key={material.id}>
                      <TableCell>
                        {types.get(material.id_tipo_material)}
                      </TableCell>
                      <TableCell>
                        {material.nombre_material ?? material.id}
                      </TableCell>
                      <TableCell>{code(material.codigo_material)}</TableCell>
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
    db.materiales,
    db.tipos_materiales,
    db.proveedor,
    db.materiales_asociados,
    db.producto_corrugado,
    q,
    filter,
  ]);
  const toggle = useCallback(
    (id: string) => {
      const open = !collapsed.has(id) && (expanded.has(id) || Boolean(q));
      setExpanded((current) => {
        const next = new Set(current);
        open ? next.delete(id) : next.add(id);
        return next;
      });
      setCollapsed((current) => {
        const next = new Set(current);
        open ? next.add(id) : next.delete(id);
        return next;
      });
    },
    [collapsed, expanded, q],
  );
  const empty = useMemo(
    () => (
      <Empty
        title="Sin coincidencias"
        description="Prueba otra búsqueda o filtro."
      />
    ),
    [],
  );
  return (
    <>
      <section className="panel product-materials-panel" ref={panel}>
        <div className="section-heading">
          <div>
            <h2>Materiales por producto</h2>
            <p>{db.productos.length} productos</p>
          </div>
        </div>
        <div className="toolbar product-materials-toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <ControlInput
              className="control"
              type="search"
              aria-label="Buscar productos y materiales"
              placeholder="Buscar producto, material o código MAIA…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCollapsed(new Set());
              }}
            />
          </div>
          <ControlSelect
            aria-label="Filtro personalizado de materiales por producto"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
          >
            {filters.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </ControlSelect>
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
          onEdit={edit}
          groupLabel="Producto"
          tableLabel="Materiales agrupados por producto"
          relationName="materiales"
          countLabel={countLabel}
          empty={empty}
        />
        <div className="table-footer">
          <span>
            {groups.length} de {db.productos.length} productos ·{" "}
            {groups.reduce((sum, row) => sum + row.count, 0)} materiales
          </span>
        </div>
      </section>
      {editing && (
        <ProductMaterialsEditor
          key={editing}
          productId={editing}
          onClose={close}
          onSaved={() => {
            setExpanded((current) => new Set([...current, editing]));
            setCollapsed((current) => {
              const next = new Set(current);
              next.delete(editing);
              return next;
            });
          }}
        />
      )}
    </>
  );
}

function ProductMaterialsEditor({
  productId,
  onClose,
  onSaved,
}: {
  productId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { db, run } = useApp();
  const [original, setOriginal] = useState(() =>
    productMaterialConfig(db, productId),
  );
  const [selected, setSelected] = useState(original.id_materiales);
  const [box, setBox] = useState(original.corrugado?.id_material ?? "");
  const [capacity, setCapacity] = useState(
    String(original.corrugado?.unidades_por_corrugado ?? ""),
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const submitting = useRef(false);
  const product = db.productos.find((row) => row.id === productId);
  const options = useMemo(
    () =>
      db.materiales
        .filter((m) => materialRole(db, m.id) === "general")
        .map((m) => ({
          id: m.id,
          label: m.nombre_material ?? m.id,
          description: `${db.tipos_materiales.find((t) => t.id === m.id_tipo_material)?.tipo_material ?? "Sin tipo"} · MAIA ${code(m.codigo_material)}${db.materiales.some((other) => other.id !== m.id && other.nombre_material === m.nombre_material && other.id_tipo_material === m.id_tipo_material && other.codigo_material === m.codigo_material) ? ` · ${m.id.slice(-6)}` : ""}`,
        }))
        .sort(
          (a, b) =>
            a.label.localeCompare(b.label, "es") || a.id.localeCompare(b.id),
        ),
    [db.materiales, db.tipos_materiales],
  );
  const boxes = useMemo(
    () => db.materiales.filter((m) => materialRole(db, m.id) === "corrugado"),
    [db.materiales, db.tipos_materiales],
  );
  const specials = useMemo(
    () => ({
      cinta: db.materiales.filter((m) => materialRole(db, m.id) === "cinta"),
      sticker: db.materiales.filter(
        (m) => materialRole(db, m.id) === "sticker",
      ),
    }),
    [db.materiales, db.tipos_materiales],
  );
  const general = selected.filter((id) => materialRole(db, id) === "general");
  const originalGeneral = original.id_materiales.filter(
    (id) => materialRole(db, id) === "general",
  );
  const current: ProductMaterialConfig = {
    id_materiales: selected,
    corrugado: box
      ? { id_material: box, unidades_por_corrugado: Number(capacity) }
      : null,
  };
  const dirty = !equal(original, current);
  const conflict = error?.code === "PRODUCT_MATERIALS_CHANGED";
  const clearError = () => {
    if (!conflict) setError(null);
  };
  const materialName = (id: string) =>
    db.materiales.find((m) => m.id === id)?.nombre_material ?? id;
  const added = selected.filter((id) => !original.id_materiales.includes(id));
  const removed = original.id_materiales.filter((id) => !selected.includes(id));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || conflict) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const issue = productMaterialConfigIssue(db, productId, current);
      if (issue) throw new ApiError(issue);
      await run(
        "setProductMaterials",
        { id_producto: productId, ...current, expected: original },
        "Materiales del producto guardados",
      );
      onSaved();
      onClose();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure
          : new ApiError({ message: (failure as Error).message }),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={`Editar materiales · ${product?.nombre_producto ?? "Producto"}`}
      subtitle="Revisa la configuración antes de guardar."
      wide
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      <FieldEditContext.Provider value={clearError}>
        <ControlForm onSubmit={submit} fieldErrors={error?.fields} noValidate>
          <div className="dialog-body product-materials-editor" inert={busy}>
            <ErrorNotice error={error} />
            {conflict && (
              <div className="notice">
                <p>
                  Tu borrador se conserva. Revisa la configuración guardada más
                  reciente antes de continuar.
                </p>
                <Button
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "¿Reemplazar tu borrador por la configuración guardada más reciente?",
                        "Revisar configuración actual",
                      )
                    ) {
                      const next = productMaterialConfig(db, productId);
                      setOriginal(next);
                      setSelected(next.id_materiales);
                      setBox(next.corrugado?.id_material ?? "");
                      setCapacity(
                        String(next.corrugado?.unidades_por_corrugado ?? ""),
                      );
                      setError(null);
                    }
                  }}
                >
                  Revisar configuración actual
                </Button>
              </div>
            )}
            <Field id="field-id_producto" label="Producto">
              <ControlInput value={product?.nombre_producto ?? ""} disabled />
            </Field>
            <section aria-label="Corrugado">
              <h3>Corrugado</h3>
              <div className="product-materials-corrugado">
                <Field
                  id="field-corrugado.id_material"
                  label="Referencia de corrugado"
                >
                  <MaterialPicker
                    materials={boxes}
                    commitOnSelection
                    value={box}
                    onChange={(id) => {
                      setBox(id);
                      if (!id) setCapacity("");
                    }}
                    placeholder="Buscar corrugado…"
                  />
                </Field>
                <Field
                  id="field-corrugado.unidades_por_corrugado"
                  label="Unidades por corrugado"
                  required={Boolean(box)}
                >
                  <ControlInput
                    className="control"
                    type="number"
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                    disabled={!box}
                  />
                </Field>
                <ActionTooltip content="Quitar corrugado">
                  <Button
                    className="icon-btn delete-action product-materials-remove"
                    icon={Trash2}
                    aria-label="Quitar corrugado"
                    disabled={!box}
                    onClick={() => {
                      setBox("");
                      setCapacity("");
                      clearError();
                    }}
                  />
                </ActionTooltip>
              </div>
            </section>
            <section aria-label="Cinta o sticker">
              <h3>Cinta o sticker</h3>
              <div className="product-materials-specials">
                {(["sticker", "cinta"] as const).map((role) => (
                  <CheckChoice
                    key={role}
                    className="product-materials-choice"
                    checked={
                      specials[role].length === 1 &&
                      selected.includes(specials[role][0].id)
                    }
                    disabled={specials[role].length !== 1}
                    onChange={(checked) =>
                      setSelected((current) => [
                        ...current.filter(
                          (id) =>
                            !["cinta", "sticker"].includes(
                              materialRole(db, id),
                            ),
                        ),
                        ...(checked ? [specials[role][0].id] : []),
                      ])
                    }
                  >
                    <span>
                      {role === "sticker" ? "Sticker" : "Cinta"}
                      <small>
                        {specials[role].length === 1
                          ? `${specials[role][0].nombre_material} · MAIA ${code(specials[role][0].codigo_material)}`
                          : specials[role].length
                            ? "Revisa los materiales duplicados del catálogo."
                            : "Configura este material en Materiales."}
                      </small>
                    </span>
                  </CheckChoice>
                ))}
              </div>
            </section>
            <hr className="product-materials-divider" />
            <MultiRelationPicker
              error={error?.fields.id_materiales}
              options={options}
              selected={general}
              original={originalGeneral}
              onChange={(ids) =>
                setSelected([
                  ...ids,
                  ...selected.filter((id) =>
                    ["cinta", "sticker"].includes(materialRole(db, id)),
                  ),
                ])
              }
              query={query}
              onQueryChange={setQuery}
              disabled={busy}
              labels={{
                available: "Materiales disponibles",
                selected: "Materiales seleccionados",
                search: "Buscar materiales disponibles",
                placeholder: "Buscar por nombre, tipo o código MAIA…",
                choices: "Seleccionar materiales",
                noMatches: "No hay materiales coincidentes.",
                empty: "Sin materiales generales seleccionados.",
              }}
            />
          </div>
          <div className="dialog-footer">
            <CancelButton disabled={busy} onClick={onClose}>
              Cancelar
            </CancelButton>
            <Button
              variant="primary"
              type="submit"
              disabled={busy || Boolean(conflict)}
            >
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </ControlForm>
      </FieldEditContext.Provider>
    </Dialog>
  );
}
