import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** A single shimmering bar. `className` sets the shape/size. */
export function Bar({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} />;
}

/** Card-shaped placeholder mirroring the mobile card lists. */
export function CardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-2">
          <Bar className="h-4 w-1/2" />
          <Bar className="h-3 w-2/3" />
        </div>
        {rows > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: rows * 2 }).map((_, i) => (
              <Bar key={i} className="h-8" />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Placeholder for the mobile card lists (`sm:hidden` stacks).
 * @param rows how many cards to draw.
 */
export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3 sm:hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Placeholder for the desktop tables (`hidden sm:block`).
 * @param cols number of columns; the first column renders a wider bar.
 */
export function TableSkeleton({ cols = 5, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <Card className="hidden sm:block">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: cols }).map((_, i) => (
                <TableHead key={i}>
                  <Bar className={cn("h-3", i === 0 ? "w-24" : "w-16")} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, r) => (
              <TableRow key={r}>
                {Array.from({ length: cols }).map((_, c) => (
                  <TableCell key={c}>
                    <Bar
                      className={cn("h-3.5", c === 0 ? "w-32" : c === cols - 1 ? "w-12" : "w-20")}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Generic "still loading" block for regions that aren't lists or tables. */
export function PanelSkeleton({ className, bars = 3 }: { className?: string; bars?: number }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: bars }).map((_, i) => (
        <Bar key={i} className={cn("h-12 w-full", i % 2 === 1 && "w-4/5")} />
      ))}
    </div>
  );
}

/**
 * Standard page-level pair: card list for phones, table for wider screens.
 * Rendered instead of content while a query is in flight.
 */
export function ListPageSkeleton({ cols, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div className="space-y-4">
      <CardListSkeleton rows={Math.min(rows, 4)} />
      <TableSkeleton cols={cols} rows={rows} />
    </div>
  );
}
