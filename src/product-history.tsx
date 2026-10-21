import { assignedBarcode, currentCost } from "../shared/schema";
import {
  DataTable,
  TableCell,
  TableColumn,
  TableHead,
  TableRow,
  TableRows,
} from "./components/data-table";
import { Badge, LinkButton, count, money, shortDate, useApp } from "./ui";

export function ProductHistory({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const { db } = useApp();
  const product = db.productos.find((record) => record.id === productId);
  if (!product) return null;

  const associations = db.materiales_asociados.filter(
    (association) => association.id_producto === productId,
  );
  const maquilaType = associations.length ? "PARCIAL" : "FULL";
  const cost = currentCost(db, productId)?.costo;
  const category = db.categorias.find(
    (record) => record.id === product.id_categoria,
  );
  const barcode = assignedBarcode(db, productId);
  const barcodes = db.codigos_barras.filter(
    (record) => record.id_producto === productId,
  );
  const costs = db.costos_maquila.filter(
    (record) => record.id_producto === productId,
  );

  return (
    <>
      <dl className="product-history-summary">
        <div>
          <dt>Tipo de maquila</dt>
          <dd>{maquilaType}</dd>
        </div>
        <div>
          <dt>Costo de maquila vigente</dt>
          <dd>{cost == null ? "Sin costo registrado" : money(cost)}</dd>
        </div>
        <div>
          <dt>Unidades por lote</dt>
          <dd>{count(product.unidades_lote)}</dd>
        </div>
        <div>
          <dt>Categoría</dt>
          <dd>{category?.nombre_categoria ?? "Sin categoría"}</dd>
        </div>
        <div>
          <dt>Maquila / IVA</dt>
          <dd>
            {maquilaType}
            <small>IVA {category?.iva ?? "—"} %</small>
          </dd>
        </div>
        <div>
          <dt>Código asignado</dt>
          <dd>{barcode?.codigo ?? "Sin código"}</dd>
        </div>
      </dl>

      <section className="product-history-section">
        <h3>Materiales asociados</h3>
        <div className="product-history-materials">
          {associations.length ? (
            associations.map((association) => (
              <Badge key={association.id_material} value="material">
                {
                  db.materiales.find(
                    (material) => material.id === association.id_material,
                  )?.nombre_material
                }
              </Badge>
            ))
          ) : (
            <p className="muted">No tiene materiales asociados.</p>
          )}
        </div>
      </section>

      <section className="product-history-section">
        <h3>Historial de códigos de barras</h3>
        <div className="table-scroll">
          <DataTable
            className="data-table product-history-table"
            aria-label="Historial de códigos de barras"
          >
            <TableHead>
              <TableRow>
                <TableColumn>Código</TableColumn>
                <TableColumn>Estado</TableColumn>
                <TableColumn>Creado</TableColumn>
                <TableColumn>Órdenes</TableColumn>
              </TableRow>
            </TableHead>
            <TableRows>
              {barcodes.length ? (
                barcodes.map((record) => {
                  const orderCount = db.orden_producto.filter(
                    (order) => order.id_codigo_barras === record.id,
                  ).length;
                  const orderLabel = `Consultar ${count(orderCount)} ${orderCount === 1 ? "orden" : "órdenes"}`;
                  return (
                    <TableRow key={record.id}>
                      <TableCell>{record.codigo}</TableCell>
                      <TableCell>
                        <Badge value={record.estado} />
                      </TableCell>
                      <TableCell>{shortDate(record.fecha_creacion)}</TableCell>
                      <TableCell>
                        <LinkButton
                          className="product-history-order-link"
                          variant="link"
                          href={`/ordenes?q=${record.codigo}`}
                          aria-label={`${orderLabel} del código ${record.codigo}`}
                          onClick={onClose}
                        >
                          {orderLabel}
                        </LinkButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4}>
                    No hay códigos de barras registrados.
                  </TableCell>
                </TableRow>
              )}
            </TableRows>
          </DataTable>
        </div>
      </section>

      <section className="product-history-section">
        <h3>Historial de costos</h3>
        <div className="table-scroll">
          <DataTable
            className="data-table product-history-table"
            aria-label="Historial de costos"
          >
            <TableHead>
              <TableRow>
                <TableColumn>Costo</TableColumn>
                <TableColumn>Desde</TableColumn>
                <TableColumn>Hasta</TableColumn>
              </TableRow>
            </TableHead>
            <TableRows>
              {costs.length ? (
                costs.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {record.costo === null ? "—" : money(record.costo)}
                    </TableCell>
                    <TableCell>{shortDate(record.fecha_inicio)}</TableCell>
                    <TableCell>
                      {record.fecha_fin
                        ? shortDate(record.fecha_fin)
                        : "Sin fecha final"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3}>No hay costos registrados.</TableCell>
                </TableRow>
              )}
            </TableRows>
          </DataTable>
        </div>
      </section>
    </>
  );
}
