"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Student } from "@/types";

interface StudentSearchProps {
  onSelect: (student: Student) => void;
  placeholder?: string;
  className?: string;
  /** When true, only students with active bus transport appear in results. */
  activeTransportOnly?: boolean;
}

export const StudentSearch = ({
  onSelect,
  placeholder = "Search student by name...",
  className,
  activeTransportOnly = false
}: StudentSearchProps): JSX.Element => {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ["student-search", debounced],
    queryFn: async () =>
      (
        await api.get<{ data: Student[] }>("/api/students", {
          params: {
            search: debounced,
            status: "active",
            ...(activeTransportOnly ? { withTransport: true } : {}),
            page: 1,
            limit: 20
          }
        })
      ).data.data,
    enabled: debounced.length >= 2
  });

  const results = searchQuery.data ?? [];

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="form-input pl-10"
        />
      </div>
      {open && debounced.length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-md">
          {searchQuery.isLoading && (
            <p className="px-3 py-2 text-sm text-slate-500">Searching...</p>
          )}
          {!searchQuery.isLoading && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-500">No students found</p>
          )}
          {results.map((student) => {
            const bus = student.transport?.busNumber ?? "";
            return (
              <button
                key={student._id}
                type="button"
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-primary-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(student);
                  setQuery(student.name);
                  setOpen(false);
                }}
              >
                <span className="font-medium text-slate-900">{student.name}</span>
                <span className="text-xs text-slate-500">
                  Grade {student.grade}
                  {bus ? ` · Bus ${bus}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

