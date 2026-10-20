import {
  Fragment,
  memo,
  useId,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight, Pencil, X } from "lucide-react";
import { Button } from "../ui";
import {
  CheckChoice,
  ChoiceGroup,
  ControlInput,
  type Choice,
} from "./controls";
import {
  DataTable,
  TableCell,
  TableColumn,
  TableHead,
  TableRow,
  TableRows,
} from "./data-table";

export type RelationGroup = {
  id: string;
  label: string;
  count: number;
  details: ReactNode;
  autoExpand?: boolean;
};
export const GroupedRelationsTable = memo(GroupedRelationsTableView);

function useRelationDisclosure(openIds: string[]) {
  const openKey = openIds.join("|");
  const [present, setPresent] = useState(() => new Set(openIds));
  const [expanded, setExpanded] = useState(new Set<string>());
  useLayoutEffect(() => {
    const open = new Set(openKey ? openKey.split("|") : []);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPresent(open);
      setExpanded(open);
      return;
    }
    setPresent((current) => new Set([...current, ...open]));
    setExpanded(
      (current) => new Set([...current].filter((id) => open.has(id))),
    );
    // Let newly mounted, collapsed panels paint before the CSS transition.
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => setExpanded(open));
    });
    const timer = window.setTimeout(() => setPresent(open), 180);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
      window.clearTimeout(timer);
    };
  }, [openKey]);
  return { present, expanded };
}

function GroupedRelationsTableView({
  groups,
  expanded,
  collapsed,
  onToggle,
  onEdit,
  empty,
  groupLabel = "Tipo de material",
  tableLabel = "Proveedores favoritos por tipo",
  relationName = "proveedores",
  countLabel = (count: number) =>
    count
      ? `${count} ${count === 1 ? "proveedor" : "proveedores"}`
      : "Sin proveedores",
}: {
  groups: RelationGroup[];
  expanded: Set<string>;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  empty: ReactNode;
  groupLabel?: string;
  tableLabel?: string;
  relationName?: string;
  countLabel?: (count: number) => string;
}) {
  const prefix = useId();
  const disclosure = useRelationDisclosure(
    groups
      .filter(
        (group) =>
          group.count > 0 &&
          !collapsed.has(group.id) &&
          (expanded.has(group.id) || group.autoExpand),
      )
      .map((group) => group.id),
  );
  return (
    <div className="table-scroll">
      <DataTable
        className="data-table grouped-relations"
        aria-label={tableLabel}
      >
        <TableHead>
          <TableRow>
            <TableColumn>{groupLabel}</TableColumn>
            <TableColumn>
              {relationName[0].toLocaleUpperCase() + relationName.slice(1)}
            </TableColumn>
            <TableColumn>
              <span className="visually-hidden">Acciones</span>
            </TableColumn>
          </TableRow>
        </TableHead>
        <TableRows>
          {groups.length ? (
            groups.map((group) => {
              const open =
                group.count > 0 &&
                !collapsed.has(group.id) &&
                (expanded.has(group.id) || group.autoExpand);
              const detailId = `${prefix}-${group.id}`;
              return (
                <Fragment key={group.id}>
                  <TableRow key={group.id} className="relation-group-row">
                    <TableCell>
                      <div className="inline relation-group-label">
                        <Button
                          className="icon-btn relation-toggle"
                          variant="ghost"
                          icon={ChevronRight}
                          disabled={!group.count}
                          aria-label={`${open ? "Ocultar" : "Mostrar"} ${relationName} de ${group.label}`}
                          aria-expanded={Boolean(open)}
                          aria-controls={open ? detailId : undefined}
                          onClick={() => onToggle(group.id)}
                        />
                        <strong>{group.label}</strong>
                      </div>
                    </TableCell>
                    <TableCell>{countLabel(group.count)}</TableCell>
                    <TableCell>
                      <Button
                        className="icon-btn"
                        icon={Pencil}
                        aria-label={`Editar ${relationName} de ${group.label}`}
                        onClick={() => onEdit(group.id)}
                      />
                    </TableCell>
                  </TableRow>
                  {disclosure.present.has(group.id) && (
                    <TableRow
                      key={`${group.id}-details`}
                      className="relation-details-row"
                      aria-hidden={!open}
                      inert={!open}
                    >
                      <TableCell colSpan={3} className="relation-details-cell">
                        <div
                          id={detailId}
                          className="relation-disclosure"
                          data-expanded={disclosure.expanded.has(group.id)}
                          aria-hidden={!open}
                          inert={!open}
                        >
                          <div className="relation-disclosure-inner">
                            <div className="relation-details">
                              {group.details}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={3}>{empty}</TableCell>
            </TableRow>
          )}
        </TableRows>
      </DataTable>
    </div>
  );
}

export function MultiRelationPicker({
  options,
  selected,
  original,
  onChange,
  query,
  onQueryChange,
  disabled = false,
  labels: overrides,
}: {
  options: Choice[];
  selected: string[];
  original: string[];
  onChange: (ids: string[]) => void;
  query: string;
  onQueryChange: (query: string) => void;
  disabled?: boolean;
  labels?: Partial<{
    available: string;
    selected: string;
    search: string;
    placeholder: string;
    choices: string;
    noMatches: string;
    empty: string;
  }>;
}) {
  const labels = {
    available: "Proveedores disponibles",
    selected: "Proveedores seleccionados",
    search: "Buscar proveedores disponibles",
    placeholder: "Buscar por nombre o NIT…",
    choices: "Seleccionar proveedores",
    noMatches: "No hay proveedores coincidentes.",
    empty: "Sin proveedores favoritos para este tipo de material.",
    ...overrides,
  };
  const q = query.trim().toLocaleLowerCase("es");
  const matches = options.filter((option) =>
    `${option.label} ${option.description ?? ""}`
      .toLocaleLowerCase("es")
      .includes(q),
  );
  const selectedSet = new Set(selected);
  return (
    <div className="relation-picker">
      <div className="relation-picker-headings">
        <h3>{labels.available}</h3>
        <h3>
          {labels.selected} · {selected.length}
        </h3>
      </div>
      <section
        className="relation-available-column"
        aria-label={labels.available}
      >
        <ControlInput
          className="control"
          type="search"
          aria-label={labels.search}
          placeholder={labels.placeholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          disabled={disabled}
        />
        <ChoiceGroup
          aria-label={labels.choices}
          value={selected}
          isDisabled={disabled}
          onChange={(ids) =>
            onChange([
              ...new Set([
                ...selected.filter(
                  (id) => !matches.some((option) => option.id === id),
                ),
                ...ids,
              ]),
            ])
          }
          className="check-list relation-available"
        >
          {matches.map((option) => (
            <CheckChoice key={option.id} value={option.id}>
              <span>
                {option.label}
                <small>{option.description}</small>
              </span>
            </CheckChoice>
          ))}
          {!matches.length && <p>{labels.noMatches}</p>}
        </ChoiceGroup>
      </section>
      <section className="relation-final" aria-label={labels.selected}>
        <div className="relation-final-list">
          {options
            .filter((option) => selectedSet.has(option.id))
            .map((option) => (
              <div className="relation-selected" key={option.id}>
                <span>
                  {option.label}
                  <small>{option.description}</small>
                  {!original.includes(option.id) && (
                    <small className="relation-new">Nuevo</small>
                  )}
                </span>
                <Button
                  className="icon-btn"
                  icon={X}
                  aria-label={`Quitar ${option.label}${options.some((other) => other.id !== option.id && other.label === option.label) ? ` · ${option.description ?? option.id}` : ""}`}
                  disabled={disabled}
                  onClick={() =>
                    onChange(selected.filter((id) => id !== option.id))
                  }
                />
              </div>
            ))}
          {!selected.length && <p>{labels.empty}</p>}
        </div>
      </section>
    </div>
  );
}
