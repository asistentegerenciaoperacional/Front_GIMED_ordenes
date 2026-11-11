import type { Database } from "../shared/models";
import { selectableAddresses } from "../shared/reception-location";
import type { Row } from "../shared/schema";
import { check } from "./integrity";

export function saveReceptionLocation(
  db: Database,
  previous: Row | null | undefined,
  row: Row,
  input: Row,
) {
  const currentId = previous?.id_direccion ?? null;
  if (!Object.hasOwn(input, "id_direccion")) {
    // Older commands supplied text before the address catalogue existed.
    if (currentId !== null) row.ubicacion = previous?.ubicacion ?? null;
    return;
  }
  if (input.id_direccion === currentId) {
    row.ubicacion =
      currentId === null && input.ubicacion === null
        ? null
        : (previous?.ubicacion ?? null);
    return;
  }
  if (input.id_direccion === null) {
    row.ubicacion = null;
    return;
  }
  const address = selectableAddresses(db).find(
    (candidate) => candidate.id === input.id_direccion,
  );
  check(address, "Selecciona una ubicación activa.", "VALIDATION", {
    id_direccion: "La ubicación ya no está disponible.",
  });
  row.ubicacion = address.nombre_dir;
}
