import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRoute, orderListReturnAfterNavigation } from "../src/routing";

test("volver recupera el origen de la orden; abandonar la vista descarta filtros y scroll", () => {
  for (const [type, list] of [
    ["producto", "ordenes/productos?vista=seguimiento&q=Aurora"],
    ["material", "ordenes/materiales?vista=seguimiento&tipo=material"],
    ["otro", "ordenes/materiales?vista=seguimiento&tipo=otro"],
  ]) {
    const detail = `ordenes/${type}-id`;
    const position = { top: 432, tableLeft: 127 };
    const origin = orderListReturnAfterNavigation(null, list, detail, position);
    assert.deepEqual(origin, {
      ...position,
      path: `/${list}`,
      detailPath: detail,
    });
    const print = `${detail}/imprimir?returnTo=${encodeURIComponent(`/${detail}`)}`;
    const whilePrinting = orderListReturnAfterNavigation(
      origin,
      detail,
      print,
      { top: 72, tableLeft: null },
    );
    const afterPrinting = orderListReturnAfterNavigation(
      whilePrinting,
      print,
      detail,
      { top: 0, tableLeft: null },
    );
    assert.deepEqual(
      afterPrinting,
      origin,
      `${type}: impresión conserva el origen`,
    );
    assert.equal(
      orderListReturnAfterNavigation(afterPrinting, detail, list, position),
      null,
      `${type}: volver consume el origen`,
    );
    for (const other of [
      "catalogos",
      "facturas",
      "ordenes/materiales",
      "ordenes/otra-id",
    ]) {
      const discarded = orderListReturnAfterNavigation(
        origin,
        detail,
        other,
        position,
      );
      assert.equal(
        discarded,
        null,
        `${type}: salir a ${other} descarta el origen`,
      );
      const orders = normalizeRoute("/ordenes");
      assert.equal(orders, "ordenes/productos");
      assert.equal(
        orderListReturnAfterNavigation(discarded, other, orders, position),
        null,
        `${type}: regresar por navegación no recupera la posición anterior`,
      );
      const reopened = orderListReturnAfterNavigation(
        discarded,
        other,
        detail,
        position,
      );
      if (other === "ordenes/materiales")
        assert.deepEqual(
          reopened,
          {
            ...position,
            path: "/ordenes/materiales",
            detailPath: detail,
          },
          `${type}: entrar desde otro listado captura su nuevo origen sin filtros`,
        );
      else
        assert.equal(
          reopened,
          null,
          `${type}: reabrir desde otra vista no recupera el origen anterior`,
        );
    }
    assert.equal(
      orderListReturnAfterNavigation(
        origin,
        detail,
        "ordenes/otra-id/imprimir",
        position,
      ),
      null,
      `${type}: imprimir otra orden también descarta el origen`,
    );
    assert.equal(
      orderListReturnAfterNavigation(null, detail, detail, position),
      null,
      `${type}: abrir directamente o recargar no tiene origen guardado`,
    );
  }
});
