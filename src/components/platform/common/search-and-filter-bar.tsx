import { Input } from "@/components/ui/input";

interface SearchAndFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: string[];
  activeFilter: string;
  onFilterChange: (value: string) => void;
}

export function SearchAndFilterBar({
  search,
  onSearchChange,
  filters,
  activeFilter,
  onFilterChange,
}: SearchAndFilterBarProps) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search donations, zones, users..." />
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => onFilterChange(filter)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              activeFilter === filter
                ? "border-emerald-600 bg-emerald-100 text-emerald-700"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  );
}
