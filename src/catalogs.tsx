import { useDeferredValue, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  History,
  Info,
  Boxes,
} from "lucide-react";
import {
  meta,
  titles,
  labels,
  primaryKey,
  latestBarcode,
  currentCost,
  orderReference,
  type Entity,
  type Row,
} from "../shared/schema";
import {
  useApp,
  PageHeading,
  Button,
  LinkButton,
  displayField,
  Dialog,
  Badge,
  Empty,
  Tabs,
  text,
  money,
  shortDate,
  recordName,
} from "./ui";
import { CatalogForm, Documents } from "./forms";
import { ColumnHeader } from "./column-filter";
import {
  columnOptions,
  filterTableRows,
  hasFilter,
  sortTableRows,
  type Column,
  type ColumnCell,
  type ColumnFilter,
  type ColumnRow,
  type TableState,
} from "./order-table";

type CatalogFilterRow = ColumnRow<string> & {
  record: Row;
  searchText: string;
};

const productFilterColumns: Column<string>[] = [
  { key: "nombre_producto", label: "Producto", kind: "text" },
  { key: "id_maquilador", label: "Maquilador", kind: "text" },
  { key: "unidades_lote", label: "Unidades por lote", kind: "integer" },
  { key: "id_categoria", label: "Categoría", kind: "text" },
  { key: "activo", label: "Activo", kind: "enum" },
  { key: "maquila_iva", label: "Maquila / IVA", kind: "text" },
  { key: "codigo_activo", label: "Código activo", kind: "text" },
];

const materialFilterColumns: Column<string>[] = [
  { key: "codigo_material", label: "Código MAIA (3 dígitos)", kind: "text" },
  { key: "nombre_material", label: "Material", kind: "text" },
  { key: "id_tipo_material", label: "Tipo de material", kind: "text" },
];

const catalogCell = (
  value: string | number | boolean | null | undefined,
  label: string,
  searchValues?: string[],
  selectionKey?: string | number | null,
): ColumnCell => {
  const normalizedValue = value == null ? null : String(value);
  const key = String(selectionKey ?? normalizedValue ?? "__sin_valor__");
  return {
    values: [
      {
        key,
        label: normalizedValue === null ? "Sin valor" : label,
        value: normalizedValue,
      },
    ],
    sortValue: normalizedValue,
    ...(searchValues ? { searchValues } : {}),
  };
};

function buildCatalogFilterRows(
  db: ReturnType<typeof useApp>["db"],
  entity: Entity,
  fields: string[],
): CatalogFilterRow[] {
  return (db[entity] as Row[]).map((record) => {
    const visibleFields = fields.map((field) =>
      displayField(db, entity, field, record[field]),
    );
    const historicalCodes =
      entity === "productos"
        ? db.codigos_barras
            .filter((barcode) => barcode.id_producto === record.id)
            .map((barcode) => barcode.codigo)
        : [];
    const searchText = [...visibleFields, ...historicalCodes]
      .join(" ")
      .toLowerCase();
    const cells: Record<string, ColumnCell> = {};

    if (entity === "productos") {
      const hasAssociatedMaterials = db.materiales_asociados.some(
        (association) => association.id_producto === record.id,
      );
      const iva =
        db.categorias.find((category) => category.id === record.id_categoria)
          ?.iva ?? null;
      const maquilaIva = `${hasAssociatedMaterials ? "PARCIAL" : "FULL"} · IVA ${iva ?? "—"} %`;
      const barcode = latestBarcode(db, record.id)?.codigo ?? null;
      const active = record.activo == null ? null : Boolean(record.activo);
      const activeLabel = active === null ? "Sin valor" : active ? "Sí" : "No";
      cells.nombre_producto = catalogCell(
        record.nombre_producto,
        displayField(db, entity, "nombre_producto", record.nombre_producto),
      );
      cells.id_maquilador = catalogCell(
        displayField(db, entity, "id_maquilador", record.id_maquilador),
        displayField(db, entity, "id_maquilador", record.id_maquilador),
        undefined,
        record.id_maquilador,
      );
      cells.unidades_lote = catalogCell(
        record.unidades_lote,
        String(record.unidades_lote ?? ""),
      );
      cells.id_categoria = catalogCell(
        displayField(db, entity, "id_categoria", record.id_categoria),
        displayField(db, entity, "id_categoria", record.id_categoria),
        undefined,
        record.id_categoria,
      );
      cells.activo = catalogCell(active, activeLabel);
      cells.maquila_iva = catalogCell(maquilaIva, maquilaIva);
      cells.codigo_activo = catalogCell(barcode, barcode ?? "Sin código");
    } else {
      for (const field of fields) {
        cells[field] = catalogCell(
          displayField(db, entity, field, record[field]),
          displayField(db, entity, field, record[field]),
          undefined,
          record[field],
        );
      }
    }

    return { record, searchText, cells };
  });
}

export const catalogEntities: Entity[] = [
  "productos",
  "materiales",
  "categorias",
  "costos_maquila",
  "tipos_materiales",
  "materiales_asociados",
  "producto_corrugado",
  "proveedores_favoritos",
];
const columns: Partial<Record<Entity, string[]>> = {
  productos: [
    "nombre_producto",
    "id_maquilador",
    "unidades_lote",
    "id_categoria",
    "activo",
  ],
  proveedor: [
    "nombre_largo",
    "nombre_corto",
    "nit",
    "Es_maquila",
    "Es_materiales",
    "activo",
  ],
  materiales: ["codigo_material", "nombre_material", "id_tipo_material"],
  contacto: ["id_proveedor", "nombre", "cargo_area", "correo", "celular"],
  direccion_proveedor: [
    "id_proveedor",
    "nombre_dir",
    "ciudad",
    "linea_1",
    "linea_2",
  ],
  costos_maquila: ["id_producto", "costo", "fecha_inicio", "fecha_fin"],
  contacto_interno: ["nombre", "correo", "cargo_area", "activo"],
};
export function CatalogTable({ entity }: { entity: Entity }) {
  const { db, run, notify, navigate } = useApp();
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.toLowerCase());
  const [editing, setEditing] = useState<Row | null | undefined>();
  const [details, setDetails] = useState<Row | null>(null);
  const [tableState, setTableState] = useState<TableState<string>>({
    filters: {},
  });
  const [openedColumn, setOpenedColumn] = useState<string | null>(null);
  const fields =
    columns[entity] ??
    Object.keys(meta.tables[entity].fields).filter((f) => f !== "id");
  const filterColumns =
    entity === "productos"
      ? productFilterColumns
      : entity === "materiales"
        ? materialFilterColumns
        : null;
  const catalogRows = useMemo(
    () => buildCatalogFilterRows(db, entity, fields),
    [db, entity, fields],
  );
  const searchedCatalogRows = catalogRows.filter((row) =>
    row.searchText.includes(q),
  );
  const visibleCatalogRows = filterColumns
    ? sortTableRows(
        filterTableRows(searchedCatalogRows, filterColumns, tableState.filters),
        filterColumns,
        tableState.sort,
      )
    : null;
  const rows = visibleCatalogRows
    ? visibleCatalogRows.map((row) => row.record)
    : (db[entity] as Row[]).filter((record) =>
        [
          ...fields.map((field) =>
            displayField(db, entity, field, record[field]),
          ),
          ...(entity === "productos"
            ? db.codigos_barras
                .filter((barcode) => barcode.id_producto === record.id)
                .map((barcode) => barcode.codigo)
            : []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
  const activeFilterCount = Object.values(tableState.filters).filter(
    hasFilter,
  ).length;
  const clearFilters = () =>
    setTableState((current) => ({ filters: {}, sort: current.sort }));
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{titles[entity]}</h2>
            <p>{db[entity].length} registros locales</p>
          </div>
          <Button
            icon={Plus}
            variant="primary"
            onClick={() => setEditing(null)}
          >
            Agregar
          </Button>
        </div>
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <input
              className="control"
              aria-label={`Buscar en ${titles[entity]}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                entity === "productos"
                  ? "Buscar por nombre, maquilador o código actual/antiguo…"
                  : "Buscar registros…"
              }
            />
          </div>
          <div className="filter-actions">
            {query && (
              <Button variant="link" onClick={() => setQuery("")}>
                Limpiar búsqueda
              </Button>
            )}
            {activeFilterCount > 0 && filterColumns && (
              <Button variant="link" onClick={clearFilters}>
                Limpiar filtros ({activeFilterCount})
              </Button>
            )}
          </div>
        </div>
        {rows.length || filterColumns ? (
          <div className="table-scroll">
            <table className="data-table catalog-table">
              <thead>
                <tr>
                  {filterColumns
                    ? filterColumns.map((column) => {
                        const availableRows = filterTableRows(
                          searchedCatalogRows,
                          filterColumns,
                          tableState.filters,
                          column.key,
                        );
                        const options = columnOptions(availableRows, column);
                        const optionMap = new Map(
                          options.map((option) => [option.key, option]),
                        );
                        for (const option of columnOptions(
                          catalogRows,
                          column,
                        )) {
                          if (
                            tableState.filters[column.key]?.selected?.includes(
                              option.key,
                            )
                          )
                            optionMap.set(option.key, option);
                        }
                        return (
                          <ColumnHeader
                            key={column.key}
                            column={column}
                            options={[...optionMap.values()]}
                            filter={tableState.filters[column.key]}
                            sort={tableState.sort}
                            open={openedColumn === column.key}
                            onOpen={() => setOpenedColumn(column.key)}
                            onClose={() => setOpenedColumn(null)}
                            onFilter={(filter?: ColumnFilter) =>
                              setTableState((current) => {
                                const filters = { ...current.filters };
                                if (filter) filters[column.key] = filter;
                                else delete filters[column.key];
                                return { ...current, filters };
                              })
                            }
                            onSort={(sort) =>
                              setTableState((current) => ({
                                ...current,
                                sort,
                              }))
                            }
                          />
                        );
                      })
                    : fields.map((field) => (
                        <th scope="col" key={field}>
                          {labels[field] ?? text(field)}
                        </th>
                      ))}
                  <th scope="col">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={primaryKey(entity, row)}>
                      {fields.map((f) => (
                        <td key={f}>
                          {typeof row[f] === "boolean" ? (
                            <Badge value={row[f] ? "cerrada" : "inactivo"}>
                              {row[f] ? "Sí" : "No"}
                            </Badge>
                          ) : (
                            displayField(db, entity, f, row[f])
                          )}
                        </td>
                      ))}
                      {entity === "productos" && (
                        <>
                          <td>
                            <strong>
                              {db.materiales_asociados.some(
                                (a) => a.id_producto === row.id,
                              )
                                ? "PARCIAL"
                                : "FULL"}
                            </strong>
                            <small>
                              IVA{" "}
                              {db.categorias.find(
                                (c) => c.id === row.id_categoria,
                              )?.iva ?? "—"}{" "}
                              %
                            </small>
                          </td>
                          <td className="mono">
                            {latestBarcode(db, row.id)?.codigo ?? "Sin código"}
                          </td>
                        </>
                      )}
                      <td>
                        <div className="inline">
                          <Button
                            className="icon-btn"
                            icon={Pencil}
                            aria-label={`Editar ${recordName(db, entity, row)}`}
                            onClick={() => setEditing(row)}
                          />
                          {[
                            "productos",
                            "materiales",
                            "lote_material",
                          ].includes(entity) && (
                            <Button
                              className="icon-btn"
                              icon={History}
                              aria-label={`Consultar historial de ${recordName(db, entity, row)}`}
                              onClick={() => setDetails(row)}
                            />
                          )}
                          <Button
                            className="icon-btn"
                            icon={Trash2}
                            aria-label={`Eliminar ${recordName(db, entity, row)}`}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "¿Eliminar este registro? Solo se eliminará si no deja referencias pendientes.",
                                )
                              )
                                void run(
                                  "deleteEntity",
                                  { entity, key: row },
                                  "Registro eliminado",
                                ).catch((e) => notify(e.message, true));
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={(filterColumns?.length ?? fields.length) + 1}>
                      <Empty />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
        <div className="table-footer">
          <span>
            {rows.length} de {db[entity].length} registros
          </span>
          <span>Los registros relacionados conservan su trazabilidad.</span>
        </div>
      </section>
      {editing !== undefined && (
        <CatalogForm
          entity={entity}
          record={editing ?? undefined}
          onClose={() => setEditing(undefined)}
        />
      )}{" "}
      {details && (
        <Dialog
          title={recordName(db, entity, details)}
          subtitle="Información relacionada e historial"
          onClose={() => setDetails(null)}
          wide
        >
          <div className="dialog-body">
            {entity === "productos" && (
              <>
                <div className="form-grid">
                  <div>
                    <small>Tipo de maquila</small>
                    <h3>
                      {db.materiales_asociados.some(
                        (a) => a.id_producto === details.id,
                      )
                        ? "PARCIAL"
                        : "FULL"}
                    </h3>
                  </div>
                  <div>
                    <small>Costo de maquila vigente</small>
                    <h3>
                      {currentCost(db, details.id)?.costo !== null &&
                      currentCost(db, details.id)
                        ? money(currentCost(db, details.id)!.costo!)
                        : "Sin costo registrado"}
                    </h3>
                  </div>
                </div>
                <h3>Materiales asociados</h3>
                <div className="inline">
                  {db.materiales_asociados
                    .filter((a) => a.id_producto === details.id)
                    .map((a) => (
                      <Badge key={a.id_material} value="material">
                        {
                          db.materiales.find((m) => m.id === a.id_material)
                            ?.nombre_material
                        }
                      </Badge>
                    ))}
                  {!db.materiales_asociados.some(
                    (a) => a.id_producto === details.id,
                  ) && <p>No tiene materiales asociados.</p>}
                </div>
                <h3>Historial de códigos de barras</h3>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Estado</th>
                        <th>Creado</th>
                        <th>Órdenes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.codigos_barras
                        .filter((c) => c.id_producto === details.id)
                        .map((c) => (
                          <tr key={c.id}>
                            <td className="mono">{c.codigo}</td>
                            <td>
                              <Badge value={c.estado} />
                            </td>
                            <td>{shortDate(c.fecha_creacion)}</td>
                            <td>
                              <LinkButton
                                variant="link"
                                href={`/ordenes?q=${c.codigo}`}
                                onClick={() => setDetails(null)}
                              >
                                Consultar{" "}
                                {
                                  db.orden_producto.filter(
                                    (l) => l.id_codigo_barras === c.id,
                                  ).length
                                }{" "}
                                órdenes
                              </LinkButton>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <h3>Historial de costos</h3>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Costo</th>
                        <th>Desde</th>
                        <th>Hasta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.costos_maquila
                        .filter((c) => c.id_producto === details.id)
                        .map((c) => (
                          <tr key={c.id}>
                            <td>{c.costo === null ? "—" : money(c.costo)}</td>
                            <td>{shortDate(c.fecha_inicio)}</td>
                            <td>
                              {c.fecha_fin
                                ? shortDate(c.fecha_fin)
                                : "Sin fecha final"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {entity === "materiales" && (
              <>
                <h3>Proveedores asociados</h3>
                <div className="inline">
                  {db.proveedores_favoritos
                    .filter((v) => v.id_material === details.id)
                    .map((v) => (
                      <Badge key={v.id_proveedor} value="producto">
                        {
                          db.proveedor.find((p) => p.id === v.id_proveedor)
                            ?.nombre_largo
                        }
                      </Badge>
                    ))}
                  {!db.proveedores_favoritos.some(
                    (v) => v.id_material === details.id,
                  ) && <p>Sin proveedores asociados.</p>}
                </div>
                <h3>Precios conservados en órdenes</h3>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Orden</th>
                        <th>Proveedor</th>
                        <th>Fecha</th>
                        <th>Precio unitario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.orden_material
                        .filter((l) => l.id_material === details.id)
                        .map((l) => {
                          const o = db.orden_compra.find(
                            (o) => o.id === l.id_orden_compra,
                          )!;
                          return (
                            <tr key={l.id}>
                              <td>
                                <LinkButton
                                  variant="link"
                                  href={`/ordenes/${o.id}`}
                                  onClick={() => setDetails(null)}
                                >
                                  {orderReference(o.tipo_orden, o.no_orden)}
                                </LinkButton>
                              </td>
                              <td>
                                {
                                  db.proveedor.find(
                                    (p) => p.id === o.id_proveedor,
                                  )?.nombre_corto
                                }
                              </td>
                              <td>{shortDate(o.fecha_elaboracion)}</td>
                              <td>{money(l.precio_unitario)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {entity === "lote_material" && (
              <>
                {db.orden_material
                  .filter((l) => l.id_lote_material === details.id)
                  .map((l) => {
                    const o = db.orden_compra.find(
                      (o) => o.id === l.id_orden_compra,
                    )!;
                    return (
                      <a
                        className="related-link"
                        key={l.id}
                        href={`/ordenes/${o.id}`}
                        onClick={() => setDetails(null)}
                      >
                        <div>
                          <strong>
                            {orderReference(o.tipo_orden, o.no_orden)} ·{" "}
                            {
                              db.materiales.find((m) => m.id === l.id_material)
                                ?.nombre_material
                            }
                          </strong>
                          <small>
                            {l.cantidad_recibida ?? 0} unidades ·{" "}
                            {l.ubicacion ?? "Sin ubicación"}
                          </small>
                        </div>
                      </a>
                    );
                  })}
                <Documents owner="lote_material" ownerId={details.id} compact />
              </>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
export function CatalogPage({
  group = "catalogos",
  params,
}: {
  group?: string;
  params: URLSearchParams;
}) {
  type CatalogGroup = "productos" | "materiales" | "relacionados";
  const catalogGroups: Record<CatalogGroup, Entity[]> = {
    productos: ["productos", "costos_maquila", "categorias"],
    materiales: ["materiales", "tipos_materiales", "proveedores_favoritos"],
    relacionados: ["materiales_asociados", "producto_corrugado"],
  };
  const providerList: Entity[] = [
    "proveedor",
    "direccion_proveedor",
    "contacto",
  ];
  const initial = params.get("tab") as Entity;
  const catalogEntityList: Entity[] = Object.values(catalogGroups).flat();
  const [entity, setEntity] = useState<Entity>(() =>
    group === "proveedores"
      ? providerList.includes(initial)
        ? initial
        : providerList[0]
      : catalogEntityList.includes(initial)
        ? initial
        : catalogGroups.productos[0],
  );
  const parentFor = (selected: Entity): CatalogGroup =>
    (Object.keys(catalogGroups) as CatalogGroup[]).find((parent) =>
      catalogGroups[parent].includes(selected),
    ) ?? "productos";
  const [catalogGroup, setCatalogGroup] = useState<CatalogGroup>(() =>
    parentFor(entity),
  );
  const childTabs: Entity[] =
    group === "proveedores" ? providerList : [...catalogGroups[catalogGroup]];
  const childLabel: Partial<Record<Entity, string>> = {
    productos: "Lista de productos",
    materiales: "Lista de materiales",
    categorias: "Categorías",
    costos_maquila: "Costos de maquila",
    tipos_materiales: "Tipos de material",
    proveedores_favoritos: "Proveedores de material",
    materiales_asociados: "Materiales por producto",
    producto_corrugado: "Corrugado por producto",
  };
  return (
    <>
      <PageHeading
        title={
          group === "proveedores" ? "Proveedores y contactos" : "Catálogos"
        }
        description={
          group === "proveedores"
            ? "Directorio de proveedores, bodegas y personas de contacto."
            : "Productos, materiales y sus condiciones de abastecimiento."
        }
      />
      {group === "proveedores" ? null : (
        <div className="order-group-tabs">
          <Tabs
            label="Grupos de catálogos"
            items={[
              { id: "productos", label: "Productos" },
              { id: "materiales", label: "Materiales" },
              { id: "relacionados", label: "Productos & materiales" },
            ]}
            value={catalogGroup}
            onChange={(value) => {
              const nextGroup = value as CatalogGroup;
              setCatalogGroup(nextGroup);
              setEntity(catalogGroups[nextGroup][0]);
            }}
          />
        </div>
      )}
      <div
        className="catalog-tabs"
        role="navigation"
        aria-label={
          group === "proveedores"
            ? "Apartados de proveedores"
            : `Catálogos de ${catalogGroup === "relacionados" ? "productos y materiales" : catalogGroup}`
        }
      >
        {childTabs.map((e) => (
          <button
            type="button"
            key={e}
            className={entity === e ? "active" : ""}
            aria-current={entity === e ? "page" : undefined}
            onClick={() => setEntity(e)}
          >
            {childLabel[e] ?? titles[e]}
          </button>
        ))}
      </div>
      <CatalogTable key={entity} entity={entity} />
    </>
  );
}
