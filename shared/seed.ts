import { syncProductLineStates } from "./product-line-state";
import type { Database } from "./models";
import { emptyDatabase, blankRow, type Entity, type Row } from "./schema";
export const sid = (n: number) => n.toString(16).padStart(24, "0");
export function makeSeed(): Database {
  const db = emptyDatabase();
  const add = (table: Entity, n: number | null, fields: Row) => {
    const row = {
      ...blankRow(table),
      ...(n !== null ? { id: sid(n) } : {}),
      ...fields,
    };
    (db[table] as Row[]).push(row);
    return row;
  };
  const d = (s: string) => `${s}T12:00:00.000Z`;
  add("proveedor", 1, {
    nombre_largo: "Laboratorios Aurora S.A.S.",
    nombre_corto: "Aurora",
    nit: "900123401",
    digito_verf: "1",
    Es_maquila: true,
    Es_materiales: false,
    activo: true,
  });
  add("proveedor", 2, {
    nombre_largo: "Laboratorios Andina S.A.S.",
    nombre_corto: "Andina",
    nit: "900123402",
    digito_verf: "2",
    Es_maquila: true,
    Es_materiales: false,
    activo: true,
  });
  add("proveedor", 3, {
    nombre_largo: "Envases del Norte S.A.S.",
    nombre_corto: "Envases del Norte",
    nit: "900123403",
    digito_verf: "3",
    Es_maquila: false,
    Es_materiales: true,
    activo: true,
  });
  add("proveedor", 4, {
    nombre_largo: "Empaques Horizonte S.A.S.",
    nombre_corto: "Horizonte",
    nit: "900123404",
    digito_verf: "4",
    Es_maquila: false,
    Es_materiales: true,
    activo: true,
  });
  add("proveedor", 5, {
    nombre_largo: "Servicios Punto S.A.S.",
    nombre_corto: "Punto",
    nit: "900123405",
    digito_verf: "5",
    Es_maquila: false,
    Es_materiales: false,
    activo: true,
  });
  for (let i = 1; i <= 5; i++) {
    add("direccion_proveedor", 10 + i, {
      id_proveedor: sid(i),
      nombre_dir: "Bodega principal",
      ciudad: i === 2 ? "Medellín" : "Bogotá",
      linea_1: `Calle demostración ${20 + i} # 10-20`,
      linea_2: null,
    });
    add("contacto", 20 + i, {
      id_proveedor: sid(i),
      nombre: [
        "Laura Mora",
        "Daniel Ríos",
        "Ana Torres",
        "Julián Paz",
        "Camila Sol",
      ][i - 1],
      celular: "3000000000",
      cargo_area: "Compras",
      correo: `compras${i}@proveedor.example`,
    });
  }
  add("categorias", 30, { nombre_categoria: "Cuidado personal", iva: 19 });
  add("categorias", 31, { nombre_categoria: "Bienestar", iva: 0 });
  const names = ["Envase", "Tapa", "Etiqueta", "Corrugado", "Sticker", "Cinta"];
  names.forEach((tipo_material, i) =>
    add("tipos_materiales", 40 + i, { tipo_material }),
  );
  const mats = [
    ["Envase ámbar 250 ml", 101, 40],
    ["Tapa dosificadora", 102, 41],
    ["Etiqueta crema 250 ml", 103, 42],
    ["Caja corrugada · 24 unidades", null, 43],
    ["Sticker de seguridad", 105, 44],
    ["Cinta de embalaje", 106, 45],
    ["Envase blanco 100 ml", 107, 40],
  ];
  mats.forEach(([nombre_material, codigo_material, tipo], i) =>
    add("materiales", 50 + i, {
      nombre_material,
      codigo_material,
      id_tipo_material: sid(Number(tipo)),
    }),
  );
  [
    ["Crema corporal · 250 ml", 1, 12000],
    ["Gel de limpieza · 100 ml", 1, 8000],
    ["Loción hidratante · 250 ml", 2, 6000],
    ["Bálsamo suave · 50 g", 2, 4000],
  ].forEach(([nombre_producto, provider, unidades_lote], i) => {
    add("productos", 70 + i, {
      nombre_producto,
      id_maquilador: sid(Number(provider)),
      id_categoria: sid(30),
      unidades_lote,
      activo: true,
    });
    if (i < 3)
      add("costos_maquila", 80 + i, {
        id_producto: sid(70 + i),
        costo: [3200, 2450, 4100][i],
        fecha_inicio: d("2026-01-01"),
        fecha_fin: null,
      });
    add("producto_corrugado", null, {
      id_producto: sid(70 + i),
      id_material: sid(53),
      unidades_por_corrugado: 24,
    });
  });
  add("costos_maquila", 84, {
    id_producto: sid(70),
    costo: 2900,
    fecha_inicio: d("2025-01-01"),
    fecha_fin: d("2025-12-31"),
  });
  [
    [70, 50],
    [70, 51],
    [70, 54],
    [71, 56],
    [71, 55],
    [72, 50],
    [72, 51],
  ].forEach(([p, m]) =>
    add("materiales_asociados", null, {
      id_producto: sid(p),
      id_material: sid(m),
    }),
  );
  [
    [40, 3],
    [41, 3],
    [42, 4],
    [43, 4],
    [44, 4],
    [45, 4],
    [40, 4],
  ].forEach(([m, p]) =>
    add("proveedores_favoritos", null, {
      id_tipo_material: sid(m),
      id_proveedor: sid(p),
    }),
  );
  for (let i = 0; i < 4; i++)
    add("codigos_barras", 90 + i, {
      codigo: `77010000000${i + 1}`,
      id_producto: sid(70 + i),
      estado: "asignado",
      fecha_creacion: d("2026-01-10"),
      fecha_act: d("2026-01-11"),
    });
  add("codigos_barras", 94, {
    codigo: "770999999999",
    id_producto: sid(70),
    estado: "inactivo",
    fecha_creacion: d("2025-01-10"),
    fecha_act: d("2026-01-11"),
  });
  add("codigos_barras", 95, {
    codigo: "770100000005",
    id_producto: null,
    estado: "creado_gs1",
    fecha_creacion: d("2026-09-30"),
    fecha_act: d("2026-09-30"),
  });
  add("codigos_barras", 96, {
    codigo: "770100000006",
    id_producto: null,
    estado: "verificado_sistema",
    fecha_creacion: d("2026-10-01"),
    fecha_act: d("2026-10-01"),
  });
  for (const [id, product, codigo] of [
    [360, 70, "770100000007"],
    [361, 70, "770100000008"],
    [362, 74, "770100000009"],
  ] as const)
    add("codigos_barras", id, {
      codigo,
      id_producto: sid(product),
      estado: "activo",
      fecha_creacion: d("2026-10-02"),
      fecha_act: d("2026-10-03"),
    });
  add("productos", 74, {
    nombre_producto: "Sérum facial · 30 ml",
    id_maquilador: sid(1),
    id_categoria: sid(30),
    unidades_lote: 2000,
    activo: true,
  });
  add("productos", 75, {
    nombre_producto: "Jabón líquido · 300 ml",
    id_maquilador: sid(2),
    id_categoria: sid(30),
    unidades_lote: 3000,
    activo: true,
  });
  const header = (
    n: number,
    type: string,
    no: string,
    p: number,
    auth: boolean,
    delivery: string,
  ) =>
    add("orden_compra", n, {
      tipo_orden: type,
      no_orden: no,
      id_proveedor: sid(p),
      fecha_elaboracion: d("2026-09-21"),
      fecha_solicitada_entrega: d(delivery),
      estado_autorizacion: auth ? "autorizada" : "no_autorizada",
      fecha_autorizacion: auth ? d("2026-09-22") : null,
    });
  header(100, "producto", "2801", 1, true, "2026-10-15");
  header(101, "producto", "2802", 2, false, "2026-10-18");
  header(102, "producto", "2803", 1, true, "2026-10-22");
  header(103, "producto", "2804", 1, true, "2026-10-09");
  header(104, "producto", "2750", 1, true, "2025-08-20");
  const pl = (
    id: number,
    h: number,
    p: number,
    qty: number,
    state = "en_seguimiento",
    pos = 1,
    code = p + 20,
  ) =>
    add("orden_producto", id, {
      id_orden_compra: sid(h),
      posicion: pos,
      id_producto: sid(p),
      id_codigo_barras: sid(code),
      cantidad_solicitada: qty,
      precio_unitario: p === 70 ? "3200.00" : p === 71 ? "2450.00" : "4100.00",
      ref_corrugado: sid(53),
      cantidad_corrugado: Math.ceil(qty / 24 + 5),
      cantidad_sticker: p === 70 ? Math.ceil(qty * 2.2) : null,
      cantidad_cinta: p === 71 ? Math.ceil(qty / 4000) : null,
      estado: state,
    });
  pl(110, 100, 70, 12000);
  pl(111, 100, 71, 8000, "en_seguimiento", 2);
  pl(112, 101, 72, 6000);
  pl(113, 102, 70, 5000, "anulada");
  pl(114, 102, 71, 3000, "en_seguimiento", 2);
  pl(115, 103, 70, 12000, "cerrada");
  pl(116, 104, 70, 10000, "cerrada", 1, 94);
  header(120, "material", "1601", 3, true, "2026-10-12");
  header(121, "material", "1602", 3, false, "2026-10-15");
  header(122, "material", "1603", 3, false, "2026-10-18");
  header(123, "otro", "1604", 5, false, "2026-10-20");
  header(124, "material", "1598", 4, true, "2026-09-20");
  add("lote_material", 130, { numero_lote: "MAT-26-041" });
  const ml = (
    id: number,
    h: number,
    m: number,
    qty: number,
    pos = 1,
    lot: number | null = null,
    state = "en_seguimiento",
  ) =>
    add("orden_material", id, {
      id_orden_compra: sid(h),
      posicion: pos,
      id_material: sid(m),
      cantidad_solicitada: qty,
      cantidad_recibida: lot ? qty : null,
      precio_unitario: m === 50 ? "450.00" : "120.00",
      fecha_estimada_entrega: d("2026-10-10"),
      fecha_entrega: lot ? d("2026-10-01") : null,
      id_lote_material: lot ? sid(lot) : null,
      id_factura: lot ? sid(151) : null,
      ubicacion: lot ? "Bodega principal" : null,
      estado: state,
    });
  ml(140, 120, 50, 13200, 1, 130);
  ml(141, 120, 51, 13200, 2, 130);
  ml(142, 121, 50, 13200);
  ml(143, 122, 50, 6600);
  ml(144, 124, 52, 1000, 1, null, "anulada");
  add("orden_otro", 145, {
    id_orden_compra: sid(123),
    posicion: 1,
    producto: "Servicio de impresión de artes",
    cantidad_solicitada: 1,
    cantidad_recibida: null,
    precio_unitario: "850000.00",
    fecha_estimada_entrega: d("2026-10-20"),
    fecha_entrega: null,
    id_factura: null,
    ubicacion: null,
    estado: "en_seguimiento",
  });
  [
    [110, 140],
    [110, 141],
    [110, 142],
    [112, 143],
  ].forEach(([p, m]) =>
    add("abastecimiento_material", null, {
      id_orden_producto: sid(p),
      id_orden_material: sid(m),
    }),
  );
  add("factura", 150, {
    id_proveedor: sid(1),
    numero_factura: "AUR-00128",
    fecha_registro: d("2026-10-01"),
  });
  add("factura", 151, {
    id_proveedor: sid(3),
    numero_factura: "ENV-00412",
    fecha_registro: d("2026-10-01"),
  });
  add("factura", 152, {
    id_proveedor: sid(2),
    numero_factura: "AND-00001",
    fecha_registro: d("2026-10-01"),
  });
  [
    [160, 110, "PRO-26-018", 6000, "cerrado"],
    [161, 110, "PRO-26-021", 4000, "en_seguimiento"],
    [162, 115, "PRO-26-012", 12000, "cerrado"],
    [163, 116, "PRO-25-006", 10000, "cerrado"],
    [164, 113, "PRO-26-AN01", 1500, "anulado"],
    [165, 113, "PRO-26-AN02", 500, "anulado"],
  ].forEach(([id, line, numero_lote, qty, estado]) =>
    add("lote_producto", Number(id), {
      id_orden_producto: sid(Number(line)),
      id_factura: sid(150),
      numero_lote,
      cantidad_recibida: qty,
      fecha_estimada_batch_record: d(id === 161 ? "2026-10-18" : "2026-10-12"),
      fecha_entrega_batch_record: estado === "cerrado" ? d("2026-10-01") : null,
      estado_batch_record: estado === "cerrado" ? "validado" : "pendiente",
      fecha_inspeccion: estado === "cerrado" ? d("2026-10-01") : null,
      estado_inspeccion: estado === "cerrado" ? "aprobada" : "pendiente",
      fecha_recepcion: d("2026-10-01"),
      fecha_confirmacion: estado === "cerrado" ? d("2026-10-01") : null,
      ubicacion: "Bodega Bogotá",
      estado,
    }),
  );
  db.orden_producto.forEach((line, index) => {
    if (!db.lote_producto.some((lot) => lot.id_orden_producto === line.id))
      add("lote_producto", 600 + index, {
        id_orden_producto: line.id,
        fecha_estimada_batch_record: db.orden_compra.find(
          (order) => order.id === line.id_orden_compra,
        )!.fecha_solicitada_entrega,
        estado: line.estado === "anulada" ? "anulado" : "en_seguimiento",
      });
  });
  const doc = (
    id: number,
    type: string,
    owner: string | null,
    oid: number | null,
    name: string,
  ) =>
    add("documento", id, {
      tipo_entidad: owner,
      id_entidad: oid ? sid(oid) : null,
      tipo_documento: type,
      clave_almacenamiento: `placeholder/${sid(id)}`,
      nombre_archivo: name,
      tipo_mime: "text/html",
      fecha_carga: d("2026-10-01"),
    });
  doc(
    170,
    "orden_compra_escaneada",
    "orden_compra",
    100,
    "OC-2801-escaneada.html",
  );
  doc(171, "factura_fisica", "factura", 150, "Factura-AUR-00128.html");
  doc(
    172,
    "certificado_calidad",
    "lote_material",
    130,
    "Calidad-MAT-26-041.html",
  );
  doc(
    173,
    "certificado_liberacion",
    "lote_material",
    130,
    "Liberacion-MAT-26-041.html",
  );
  doc(
    174,
    "plantilla_certificado_liberacion",
    null,
    null,
    "Plantilla-liberacion.html",
  );
  add("parametros_seguimiento", 180, {
    margen_tolerancia_pct: 10,
    fecha_inicio: d("2026-01-01"),
  });
  add("consecutivo_orden", null, { grupo: "producto", ultimo_numero: 2804 });
  add("consecutivo_orden", null, { grupo: "material", ultimo_numero: 1604 });
  [
    ["Brayan", "Registro de códigos"],
    ["Robin", "Verificación de códigos"],
    ["Zamira", "Compras"],
    ["Jesús", "Artes"],
    ["Linda", "Calidad"],
  ].forEach(([nombre, cargo_area], i) =>
    add("contacto_interno", 190 + i, {
      nombre,
      correo: `${nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()}@gimed-demo.example`,
      cargo_area,
      activo: true,
    }),
  );
  [
    ["codigos_barras_nuevos", "interno", "Verificación de códigos", "para"],
    ["codigos_barras_nuevos", "interno", "Compras", "cc"],
    ["codigos_barras_nuevos", "interno", "Artes", "cc"],
    ["envio_orden_compra", "proveedor", "Compras", "para"],
    ["envio_certificado_calidad", "interno", "Calidad", "para"],
    ["envio_certificado_liberacion", "proveedor", "Compras", "para"],
    ["cotizacion_materiales", "proveedor", "Compras", "para"],
  ].forEach(([tipo_evento, tipo_contacto, cargo_area, tipo_destinatario], i) =>
    add("destinatario_evento", 200 + i, {
      tipo_evento,
      tipo_contacto,
      cargo_area,
      tipo_destinatario,
    }),
  );
  [
    ["envio_orden_compra", "orden_compra_escaneada"],
    ["envio_certificado_calidad", "certificado_calidad"],
    ["envio_certificado_liberacion", "certificado_liberacion"],
  ].forEach(([tipo_evento, tipo_adjunto]) =>
    add("adjunto_evento", null, { tipo_evento, tipo_adjunto }),
  );
  add("correo_enviado", null, {
    id_correo: "sim-demo-0001",
    remitente: "zamira@gimed-demo.example",
    tipo_evento: "envio_orden_compra",
    fecha_envio: d("2026-10-01"),
  });
  add("correo_enviado_destinatario", null, {
    id_correo: "sim-demo-0001",
    remitente: "zamira@gimed-demo.example",
    destinatario: "compras1@proveedor.example",
    tipo_destinatario: "para",
  });
  syncProductLineStates(
    db,
    db.orden_producto.map((line) => line.id),
  );
  return db;
}
