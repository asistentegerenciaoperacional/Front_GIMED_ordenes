import { useState } from "react";
import { makeSeed } from "../shared/seed";
import {
  Button,
  CancelButton,
  Dialog,
  Field,
  ProductPicker,
  DateInput,
} from "../src/ui";
import {
  ControlForm,
  ControlInput,
  ControlSelect,
} from "../src/components/controls";

export function AriaControlsFixture() {
  const product = makeSeed().productos[0];
  const products = [
    { ...product, id: "same-name-1", nombre_producto: "Producto repetido" },
    { ...product, id: "same-name-2", nombre_producto: "Producto repetido" },
  ];
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState("");
  const [price, setPrice] = useState("");
  const [open, setOpen] = useState(true);
  const [nested, setNested] = useState(false);
  const [choice, setChoice] = useState("a");
  return (
    <>
      {!open && <Button onClick={() => setOpen(true)}>Abrir formulario</Button>}
      {open && (
        <Dialog title="Controles accesibles" onClose={() => setOpen(false)}>
          <ControlForm onSubmit={(event) => event.preventDefault()} noValidate>
            <div className="dialog-body">
              <div className="form-grid">
                <Field id="product" label="Producto" required>
                  <ProductPicker
                    products={products}
                    value={selected}
                    onChange={setSelected}
                  />
                </Field>
                <Field id="date" label="Fecha">
                  <DateInput
                    value={date}
                    onChange={setDate}
                    calendarLabel="Fecha"
                  />
                </Field>
                <Field id="price" label="Precio">
                  <ControlInput
                    name="precio_unitario"
                    type="number"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </Field>
                <Field id="kind" label="Tipo">
                  <ControlSelect
                    value={choice}
                    onChange={(event) => setChoice(event.target.value)}
                  >
                    <option value="a">Primera</option>
                    <option value="b">Segunda</option>
                  </ControlSelect>
                </Field>
                <Field id="locked" label="Proveedor" required>
                  <ControlInput readOnly value="Proveedor bloqueado" />
                </Field>
              </div>
              <p role="status" aria-label="Selección guardada">
                {selected || "Sin selección"}
              </p>
              <Button onClick={() => setNested(true)}>Abrir documento</Button>
            </div>
            <div className="dialog-footer">
              <CancelButton onClick={() => setOpen(false)}>
                Cancelar
              </CancelButton>
            </div>
          </ControlForm>
          {nested && (
            <Dialog title="Documento anidado" onClose={() => setNested(false)}>
              <div className="dialog-body">
                <Field id="file" label="Nombre">
                  <ControlInput defaultValue="Orden.html" />
                </Field>
              </div>
              <div className="dialog-footer">
                <CancelButton onClick={() => setNested(false)}>
                  Cancelar
                </CancelButton>
              </div>
            </Dialog>
          )}
        </Dialog>
      )}
    </>
  );
}
