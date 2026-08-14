"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/hooks/use-confirm"
import {
  ColumnDef,
  FilterFn,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  SortingState,
  ColumnFiltersState,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  Row,
} from "@tanstack/react-table"
import { format } from "date-fns"
import { formatCurrency } from "@/lib/utils"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Trash } from "lucide-react"

// Matches the search text against everything a row contains: text fields,
// amounts (raw and ₹-formatted), dates (as displayed), and a "transfer"
// keyword for transfer rows. Multiple words must all match (AND).
const searchEverything: FilterFn<unknown> = (row, _columnId, filterValue) => {
  const search = String(filterValue ?? "").toLowerCase().trim();
  if (!search) return true;

  const original = row.original as Record<string, unknown>;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(original)) {
    if (value === null || value === undefined) continue;
    if (key === "id" || key.endsWith("Id")) continue;
    if (key === "date") {
      const date = value instanceof Date ? value : new Date(String(value));
      if (!isNaN(date.getTime())) parts.push(format(date, "dd MMMM yyyy"));
      continue;
    }
    if (typeof value === "number") {
      parts.push(String(value), formatCurrency(value));
      continue;
    }
    if (typeof value === "string") parts.push(value);
  }

  if ("transferId" in original && original.transferId) parts.push("transfer");

  const haystack = parts.join(" ").toLowerCase();
  return search.split(/\s+/).every((term) => haystack.includes(term));
};

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  filterKey: string
  onDelete: (rows: Row<TData>[]) => void;
  disabled?: boolean;
  onRowClick?: (row: Row<TData>) => void;
  searchPlaceholder?: string;
  /** Focus the search box on mount (widget 🔍 deep link) */
  autoFocusSearch?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  filterKey,
  onDelete,
  disabled,
  onRowClick,
  searchPlaceholder,
  autoFocusSearch,
}: DataTableProps<TData, TValue>) {

    const [ConfirmDialog, confirm] = useConfirm(
      "Are you sure?",
      "You are about to perform a bulk delete"
    )

    const [sorting, setSorting] = React.useState<SortingState>([])
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
        []
      )
    const [globalFilter, setGlobalFilter] = React.useState("")

      const [rowSelection, setRowSelection] = React.useState({})


  const table = useReactTable({
    data,
    columns,


    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: searchEverything as FilterFn<TData>,
    state: {
        sorting,
        columnFilters,
        rowSelection,
        globalFilter,
      },
  });

  return (
    <div>
      <ConfirmDialog />
        <div className="flex items-center py-4">
        <Input
          placeholder={searchPlaceholder ?? `Filter ${filterKey}...`}
          autoFocus={autoFocusSearch}
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          className="max-w-sm"
        />
        {table.getFilteredSelectedRowModel().rows.length > 0 && (
          <Button
            disabled={disabled}
            size="sm"
            variant="outline"
            className="ml-auto font-normal text-xs"
            onClick={async () => {
              const ok = await confirm();

              if (ok) {
                onDelete(table.getFilteredSelectedRowModel().rows)
                table.resetRowSelection();
              }
            }}
          >
            <Trash className="size-4 mr-2"/>
            Delete ({table.getFilteredSelectedRowModel().rows.length})
          </Button>
        )}
      </div>
        <div className="rounded-md border">
            <Table>
            <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                    return (
                    <TableHead key={header.id}>
                        {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                            )}
                    </TableHead>
                    )
                })}
                </TableRow>
            ))}
            </TableHeader>
            <TableBody>
            {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={onRowClick ? "cursor-pointer" : undefined}
                    onClick={onRowClick ? (e) => {
                      // Ignore clicks on interactive elements inside cells
                      // (checkboxes, sort buttons, action menus, links)
                      const target = e.target as HTMLElement;
                      if (target.closest("button, a, input, [role='checkbox'], [role='menuitem']")) return;
                      onRowClick(row);
                    } : undefined}
                >
                    {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                    ))}
                </TableRow>
                ))
            ) : (
                <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                    No results.
                </TableCell>
                </TableRow>
            )}
            </TableBody>
            </Table>
        </div>
        <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
};
