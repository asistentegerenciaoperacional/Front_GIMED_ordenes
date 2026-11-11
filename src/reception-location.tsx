import { selectableAddresses } from "../shared/reception-location";
import type { ComponentProps } from "react";
import { ControlSelect } from "./components/controls";
import { useApp } from "./ui";

const historicalKey = "historica";

export function ReceptionLocationPicker({
  value,
  historical,
  preserveHistorical = false,
  onChange,
  ...props
}: Omit<
  ComponentProps<typeof ControlSelect>,
  "value" | "onChange" | "children"
> & {
  value: string | null;
  historical: string | null;
  preserveHistorical?: boolean;
  onChange: (id: string | null) => void;
}) {
  const { db } = useApp();
  const addresses = selectableAddresses(db);
  const own = addresses.filter((address) => address.tipo === "propia");
  const suppliers = addresses.filter((address) => address.tipo === "proveedor");
  const historicalOnly = !!historical && !value;
  const unavailable =
    !!value && !addresses.some((address) => address.id === value);
  const supplierNames = new Map(
    db.proveedor.map((provider) => [
      provider.id,
      provider.nombre_corto ?? provider.nombre_largo,
    ]),
  );
  return (
    <ControlSelect
      {...props}
      value={value ?? (historicalOnly ? historicalKey : "")}
      onChange={(event) => {
        if (event.target.value !== historicalKey)
          onChange(event.target.value || null);
      }}
    >
      <option value="" disabled={historicalOnly && preserveHistorical}>Sin ubicación</option>
      {historicalOnly && (
        <option value={historicalKey} disabled>
          {historical}
        </option>
      )}
      {unavailable && (
        <option value={value} disabled>
          {historical ?? "Ubicación anterior"} (inactiva)
        </option>
      )}
      {!!own.length && (
        <optgroup label="Bodegas propias">
          {own.map((address) => (
            <option key={address.id} value={address.id}>
              {address.nombre_dir}
            </option>
          ))}
        </optgroup>
      )}
      {!!suppliers.length && (
        <optgroup label="Proveedores">
          {suppliers.map((address) => {
            const supplier = supplierNames.get(address.id_proveedor ?? "");
            return (
              <option key={address.id} value={address.id}>
                {supplier
                  ? `${address.nombre_dir} · ${supplier}`
                  : address.nombre_dir}
              </option>
            );
          })}
        </optgroup>
      )}
    </ControlSelect>
  );
}
