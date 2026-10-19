import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supplierName } from "../shared/favorite-suppliers";
import {
  ControlForm,
  ControlInput,
  FieldEditContext,
} from "./components/controls";
import {
  GroupedRelationsTable,
  MultiRelationPicker,
} from "./components/relations";
import { confirmAction } from "./components/overlays";
import {
  ApiError,
  Button,
  CancelButton,
  Dialog,
  Empty,
  ErrorNotice,
  Field,
  useApp,
} from "./ui";

const same = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export function FavoriteSuppliersTable() {
  const { db } = useApp();
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLocaleLowerCase("es"));
  const [expanded, setExpanded] = useState(new Set<string>());
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [editing, setEditing] = useState<string | null>(null);
  const groups = useMemo(() => {
    const providers = new Map(db.proveedor.map((p) => [p.id, p]));
    const byType = new Map<string, typeof db.proveedor>();
    for (const favorite of db.proveedores_favoritos) {
      const provider = providers.get(favorite.id_proveedor);
      if (provider) {
        const suppliers = byType.get(favorite.id_tipo_material) ?? [];
        suppliers.push(provider);
        byType.set(favorite.id_tipo_material, suppliers);
      }
    }
    return [...db.tipos_materiales]
      .sort(
        (a, b) =>
          (a.tipo_material ?? "").localeCompare(b.tipo_material ?? "", "es") ||
          a.id.localeCompare(b.id),
      )
      .flatMap((type) => {
        const label = type.tipo_material ?? `Tipo ${type.id}`;
        const suppliers = (byType.get(type.id) ?? []).sort(
          (a, b) =>
            supplierName(a).localeCompare(supplierName(b), "es") ||
            a.id.localeCompare(b.id),
        );
        const providerMatch =
          Boolean(q) &&
          suppliers.some((p) =>
            `${supplierName(p)} ${p.nombre_corto ?? ""} ${p.nit ?? ""}`
              .toLocaleLowerCase("es")
              .includes(q),
          );
        if (q && !label.toLocaleLowerCase("es").includes(q) && !providerMatch)
          return [];
        return [
          {
            id: type.id,
            label,
            count: suppliers.length,
            autoExpand: providerMatch,
            details: (
              <ul className="relation-provider-list">
                {suppliers.map((p) => (
                  <li key={p.id}>
                    <strong>{supplierName(p)}</strong>
                    <small>
                      NIT {p.nit ?? "Sin registrar"}
                      {p.activo === false ? " · Inactivo" : ""}
                    </small>
                  </li>
                ))}
              </ul>
            ),
          },
        ];
      });
  }, [db.tipos_materiales, db.proveedor, db.proveedores_favoritos, q]);
  const toggleGroup = useCallback(
    (id: string) => {
      const open =
        !collapsed.has(id) &&
        (expanded.has(id) ||
          groups.find((group) => group.id === id)?.autoExpand);
      setExpanded((current) => {
        const next = new Set(current);
        if (open) next.delete(id);
        else next.add(id);
        return next;
      });
      setCollapsed((current) => {
        const next = new Set(current);
        if (open) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [collapsed, expanded, groups],
  );
  const emptyGroups = useMemo(
    () => (
      <Empty
        title={
          db.tipos_materiales.length
            ? "Sin coincidencias"
            : "No hay tipos de material"
        }
        description={
          db.tipos_materiales.length
            ? "Prueba otro nombre o NIT."
            : "Agrega un tipo en la pestaña Tipos de material para configurar sus proveedores."
        }
      />
    ),
    [db.tipos_materiales.length],
  );
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Proveedores favoritos por tipo</h2>
            <p>{db.tipos_materiales.length} tipos de material</p>
          </div>
        </div>
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <ControlInput
              className="control"
              type="search"
              aria-label="Buscar tipo o proveedor"
              placeholder="Buscar tipo o proveedor…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
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
          onToggle={toggleGroup}
          onEdit={setEditing}
          empty={emptyGroups}
        />
        <div className="table-footer">
          <span>
            {groups.length} de {db.tipos_materiales.length} tipos
          </span>
          <span>Los materiales heredan los favoritos de su tipo.</span>
        </div>
      </section>
      {editing && (
        <FavoriteSuppliersEditor
          key={editing}
          typeId={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function FavoriteSuppliersEditor({
  typeId,
  onClose,
}: {
  typeId: string;
  onClose: () => void;
}) {
  const { db, run } = useApp();
  const current = () =>
    db.proveedores_favoritos
      .filter((r) => r.id_tipo_material === typeId)
      .map((r) => r.id_proveedor);
  const [original, setOriginal] = useState(current);
  const [selected, setSelected] = useState(original);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const options = useMemo(
    () =>
      [...db.proveedor]
        .sort(
          (a, b) =>
            supplierName(a).localeCompare(supplierName(b), "es") ||
            a.id.localeCompare(b.id),
        )
        .map((p) => ({
          id: p.id,
          label: supplierName(p),
          description: `NIT ${p.nit ?? "Sin registrar"}${p.activo === false ? " · Inactivo" : ""}`,
        })),
    [db.proveedor],
  );
  const added = options.filter(
    (p) => selected.includes(p.id) && !original.includes(p.id),
  );
  const removed = options.filter(
    (p) => original.includes(p.id) && !selected.includes(p.id),
  );
  const type = db.tipos_materiales.find((t) => t.id === typeId);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || error?.code === "FAVORITES_CHANGED") return;
    setBusy(true);
    setError(null);
    try {
      await run(
        "setFavoriteSuppliers",
        {
          id_tipo_material: typeId,
          id_proveedores: selected,
          expected_id_proveedores: original,
        },
        "Proveedores favoritos guardados",
      );
      onClose();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure
          : new ApiError({ message: (failure as Error).message }),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={`Editar proveedores · ${type?.tipo_material ?? "Tipo de material"}`}
      subtitle="Revisa la selección final antes de guardar."
      wide
      busy={busy}
      dirty={!same(selected, original)}
      onClose={onClose}
    >
      <FieldEditContext.Provider value={() => {}}>
        <ControlForm onSubmit={submit}>
          <div className="dialog-body">
            <ErrorNotice error={error} />
            {error?.code === "FAVORITES_CHANGED" && (
              <div className="notice">
                <p>
                  Tu borrador se conserva. Revisa la selección guardada más
                  reciente para continuar.
                </p>
                <Button
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "¿Reemplazar tu borrador por la selección guardada más reciente?",
                        "Revisar selección actual",
                      )
                    ) {
                      const next = current();
                      setOriginal(next);
                      setSelected(next);
                      setError(null);
                    }
                  }}
                >
                  Revisar selección actual
                </Button>
              </div>
            )}
            <Field id="favorite-type" label="Tipo de material">
              <ControlInput
                id="favorite-type"
                value={type?.tipo_material ?? ""}
                disabled
              />
            </Field>
            <MultiRelationPicker
              options={options}
              selected={selected}
              original={original}
              onChange={setSelected}
              query={query}
              onQueryChange={setQuery}
              disabled={busy}
            />
          </div>
          <div className="dialog-footer">
            <CancelButton disabled={busy} onClick={onClose}>
              Cancelar
            </CancelButton>
            <Button
              variant="primary"
              type="submit"
              disabled={busy || Boolean(error?.code === "FAVORITES_CHANGED")}
            >
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </ControlForm>
      </FieldEditContext.Provider>
    </Dialog>
  );
}
