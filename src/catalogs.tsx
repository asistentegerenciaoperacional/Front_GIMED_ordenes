import { useDeferredValue, useState } from "react";
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
  text,
  money,
  shortDate,
  recordName,
} from "./ui";
import { CatalogForm, Documents } from "./forms";
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
  contacto: ["nombre", "id_proveedor", "cargo_area", "correo", "celular"],
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
  const fields =
    columns[entity] ??
    Object.keys(meta.tables[entity].fields).filter((f) => f !== "id");
  const rows = (db[entity] as Row[]).filter((r) =>
    [
      ...fields.map((f) => displayField(db, entity, f, r[f])),
      ...(entity === "productos"
        ? db.codigos_barras
            .filter((c) => c.id_producto === r.id)
            .map((c) => c.codigo)
        : []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
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
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table catalog-table">
              <thead>
                <tr>
                  {fields.map((f) => (
                    <th scope="col" key={f}>
                      {labels[f] ?? text(f)}
                    </th>
                  ))}
                  {entity === "productos" && (
                    <>
                      <th scope="col">Maquila / IVA</th>
                      <th scope="col">Código activo</th>
                    </>
                  )}
                  <th scope="col">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
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
                        {["productos", "materiales", "lote_material"].includes(
                          entity,
                        ) && (
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
                ))}
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
  const list: Entity[] =
    group === "proveedores"
      ? ["proveedor", "direccion_proveedor", "contacto"]
      : catalogEntities;
  const initial = params.get("tab") as Entity;
  const [entity, setEntity] = useState<Entity>(
    list.includes(initial) ? initial : list[0],
  );
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
      <div
        className="catalog-tabs"
        role="navigation"
        aria-label="Apartados del catálogo"
      >
        {list.map((e) => (
          <button
            type="button"
            key={e}
            className={entity === e ? "active" : ""}
            aria-current={entity === e ? "page" : undefined}
            onClick={() => setEntity(e)}
          >
            {titles[e]}
          </button>
        ))}
      </div>
      <CatalogTable key={entity} entity={entity} />
    </>
  );
}
