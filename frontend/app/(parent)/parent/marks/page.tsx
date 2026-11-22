"use client";

import { useQuery } from "@tanstack/react-query";
import { BookMarked, ClipboardList, FileText } from "lucide-react";
import type { JSX } from "react";

import { ParentBrandHeader } from "@/components/parent/ParentBrandHeader";
import { PastelDecor } from "@/components/parent/PastelDecor";
import { api } from "@/lib/api";
import { INK, pastelAt, SOFT_TEXT } from "@/lib/pastel";
import type { Student } from "@/types";

const ParentMarksPage = (): JSX.Element => {
  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () =>
      (await api.get<{ data: Student[] }>("/api/parent/children")).data.data
  });

  const children = childrenQuery.data ?? [];

  return (
    <div>
      <ParentBrandHeader title="Marks" tagline="Report cards coming soon" />

      <div className="relative mb-5 flex h-[190px] flex-col justify-end overflow-hidden rounded-[20px] bg-[#F4F5F6] p-5 md:h-56 md:border md:border-gray-200 md:bg-white md:shadow-sm">
        <PastelDecor pastel={pastelAt(1)} icon={ClipboardList} />
        <div className="relative z-10 max-w-[70%]">
          <span className="inline-flex rounded-full bg-[#EA8A3B] px-3 py-1 text-xs font-bold text-white">
            Coming soon
          </span>
          <p className="mt-2 text-[26px] font-extrabold tracking-tight" style={{ color: INK }}>
            Report cards
          </p>
          <p className="mt-1 text-sm" style={{ color: SOFT_TEXT }}>
            Published marks and exam results will show up here.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-2.5 md:grid md:grid-cols-3 md:gap-3">
        {[
          { icon: FileText, label: "Unit tests & mid-terms" },
          { icon: BookMarked, label: "Term-end report cards" },
          { icon: ClipboardList, label: "Teacher remarks" }
        ].map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className="flex items-center gap-3 rounded-[18px] bg-[#F4F5F6] px-3.5 py-3.5 md:border md:border-gray-200 md:bg-white md:shadow-sm"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F0E3D9] text-[#A8562F]">
                <Icon className="h-5 w-5" />
              </span>
              <p className="text-[15px] font-semibold text-[#3F3F46]">{row.label}</p>
            </div>
          );
        })}
      </div>

      {children.length > 0 ? (
        <>
          <h2 className="mb-3 text-[19px] font-bold" style={{ color: INK }}>
            Your children
          </h2>
          <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
            {children.map((child, index) => {
              const pastel = pastelAt(index);
              return (
                <div
                  key={child._id}
                  className="relative flex h-[140px] flex-col justify-end overflow-hidden rounded-[20px] p-[18px] md:h-44 md:shadow-sm"
                  style={{ backgroundColor: pastel.bg }}
                >
                  <PastelDecor pastel={pastel} icon={BookMarked} />
                  <div className="relative z-10 max-w-[62%]">
                    <p className="text-[19px] font-bold" style={{ color: INK }}>
                      {child.name}
                    </p>
                    <p className="mt-1 text-[15px]" style={{ color: SOFT_TEXT }}>
                      Marks not published yet
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default ParentMarksPage;
