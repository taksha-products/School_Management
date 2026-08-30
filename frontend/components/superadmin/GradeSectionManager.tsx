"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type JSX } from "react";

import { Button } from "@/components/ui/Button";
import type { OrgGradeEntry } from "@/types/orgConfig";

interface EditableGrade extends OrgGradeEntry {
  clientId: string;
}

interface GradeSectionManagerProps {
  grades: OrgGradeEntry[];
  onChange: (grades: OrgGradeEntry[]) => void;
}

const createClientId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `grade-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const toEditableGrades = (grades: OrgGradeEntry[]): EditableGrade[] =>
  grades.map((grade) => ({
    ...grade,
    sections: [...grade.sections],
    clientId: createClientId()
  }));

const fromEditableGrades = (grades: EditableGrade[]): OrgGradeEntry[] =>
  grades.map(({ label, sections }) => ({
    label: label.trim(),
    sections: sections.map((section) => section.trim()).filter((section) => section.length > 0)
  }));

interface SortableSectionChipProps {
  id: string;
  label: string;
  onRemove: () => void;
}

const SortableSectionChip = ({ id, label, onRemove }: SortableSectionChipProps): JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <span
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-sm ${
        isDragging ? "opacity-60 shadow-md" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab text-gray-400 hover:text-gray-600"
        aria-label={`Drag section ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 text-gray-400 hover:text-red-600"
        aria-label={`Remove section ${label}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
};

interface GradeCardProps {
  grade: EditableGrade;
  onLabelChange: (label: string) => void;
  onSectionsChange: (sections: string[]) => void;
  onDelete: () => void;
}

const GradeCard = ({
  grade,
  onLabelChange,
  onSectionsChange,
  onDelete
}: GradeCardProps): JSX.Element => {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(grade.label);
  const [sectionDraft, setSectionDraft] = useState("");

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: grade.clientId
  });

  const sectionIds = useMemo(
    () => grade.sections.map((section, index) => `${grade.clientId}-section-${index}`),
    [grade.clientId, grade.sections]
  );

  const sectionSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setLabelDraft(grade.label);
  }, [grade.label]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const commitLabel = (): void => {
    const next = labelDraft.trim();
    if (next) {
      onLabelChange(next);
    } else {
      setLabelDraft(grade.label);
    }
    setEditingLabel(false);
  };

  const addSection = (): void => {
    const value = sectionDraft.trim();
    if (!value || grade.sections.includes(value)) {
      return;
    }
    onSectionsChange([...grade.sections, value]);
    setSectionDraft("");
  };

  const handleSectionDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sectionIds.indexOf(String(active.id));
    const newIndex = sectionIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    onSectionsChange(arrayMove(grade.sections, oldIndex, newIndex));
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-gray-200 bg-gray-50/80 p-4 ${
        isDragging ? "opacity-70 shadow-lg" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-1 cursor-grab text-gray-400 hover:text-gray-600"
          aria-label="Drag grade"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between gap-3">
            {editingLabel ? (
              <input
                autoFocus
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitLabel();
                  }
                  if (e.key === "Escape") {
                    setLabelDraft(grade.label);
                    setEditingLabel(false);
                  }
                }}
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm font-medium"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingLabel(true)}
                className="text-left text-sm font-semibold text-gray-900 hover:underline"
              >
                {grade.label || "Untitled grade"}
              </button>
            )}
            <Button variant="danger" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Sections</p>
            <DndContext
              sensors={sectionSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSectionDragEnd}
            >
              <SortableContext items={sectionIds} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap gap-2">
                  {grade.sections.map((section, index) => (
                    <SortableSectionChip
                      key={sectionIds[index]}
                      id={sectionIds[index]}
                      label={section}
                      onRemove={() =>
                        onSectionsChange(grade.sections.filter((_, i) => i !== index))
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-2 flex gap-2">
              <input
                value={sectionDraft}
                onChange={(e) => setSectionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSection();
                  }
                }}
                placeholder="Add section"
                className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-sm"
              />
              <Button variant="secondary" size="sm" onClick={addSection} disabled={!sectionDraft.trim()}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const GradeSectionManager = ({ grades, onChange }: GradeSectionManagerProps): JSX.Element => {
  const [editableGrades, setEditableGrades] = useState<EditableGrade[]>(() => toEditableGrades(grades));

  const gradeIds = useMemo(() => editableGrades.map((grade) => grade.clientId), [editableGrades]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const syncGrades = (next: EditableGrade[]): void => {
    setEditableGrades(next);
    onChange(fromEditableGrades(next));
  };

  const handleGradeDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = gradeIds.indexOf(String(active.id));
    const newIndex = gradeIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    syncGrades(arrayMove(editableGrades, oldIndex, newIndex));
  };

  const updateGrade = (clientId: string, patch: Partial<EditableGrade>): void => {
    syncGrades(editableGrades.map((grade) => (grade.clientId === clientId ? { ...grade, ...patch } : grade)));
  };

  const addGrade = (): void => {
    syncGrades([
      ...editableGrades,
      { clientId: createClientId(), label: "", sections: [] }
    ]);
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGradeDragEnd}>
        <SortableContext items={gradeIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {editableGrades.map((grade) => (
              <GradeCard
                key={grade.clientId}
                grade={grade}
                onLabelChange={(label) => updateGrade(grade.clientId, { label })}
                onSectionsChange={(sections) => updateGrade(grade.clientId, { sections })}
                onDelete={() =>
                  syncGrades(editableGrades.filter((item) => item.clientId !== grade.clientId))
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button variant="secondary" onClick={addGrade}>
        <Plus className="h-4 w-4" />
        Add Grade
      </Button>
    </div>
  );
};
