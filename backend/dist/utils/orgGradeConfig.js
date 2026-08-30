"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSectionValidationMessage = exports.formatGradeValidationMessage = exports.buildValidGradeSet = exports.orgHasAnySections = exports.getSectionsForGrade = exports.getGradeLabels = exports.resolveOrgGradeConfig = exports.DEFAULT_GRADES = void 0;
const institutionTemplates_1 = require("../constants/institutionTemplates");
exports.DEFAULT_GRADES = institutionTemplates_1.DEFAULT_GRADE_LABELS.map((label) => ({
    label,
    sections: []
}));
const normalizeGradeEntry = (entry) => ({
    label: entry.label.trim(),
    sections: entry.sections.map((section) => section.trim()).filter((section) => section.length > 0)
});
const resolveGradesFromLegacyFields = (org) => {
    if (!Array.isArray(org.gradeLabels) || org.gradeLabels.length === 0) {
        return null;
    }
    const sections = org.hasSections && Array.isArray(org.sectionLabels) && org.sectionLabels.length > 0
        ? org.sectionLabels
        : org.hasSections
            ? [...institutionTemplates_1.DEFAULT_SECTION_LABELS]
            : [];
    return org.gradeLabels.map((label) => ({
        label: label.trim(),
        sections: sections.map((section) => section.trim()).filter((section) => section.length > 0)
    }));
};
const resolveOrgGradeConfig = (org) => {
    let grades;
    if (Array.isArray(org.grades) && org.grades.length > 0) {
        grades = org.grades.map(normalizeGradeEntry);
    }
    else {
        const legacyGrades = resolveGradesFromLegacyFields(org);
        grades = legacyGrades ?? exports.DEFAULT_GRADES;
    }
    return {
        institutionType: org.institutionType ?? "school",
        grades
    };
};
exports.resolveOrgGradeConfig = resolveOrgGradeConfig;
const getGradeLabels = (config) => config.grades.map((grade) => grade.label);
exports.getGradeLabels = getGradeLabels;
const getSectionsForGrade = (config, gradeLabel) => config.grades.find((grade) => grade.label === gradeLabel)?.sections ?? [];
exports.getSectionsForGrade = getSectionsForGrade;
const orgHasAnySections = (config) => config.grades.some((grade) => grade.sections.length > 0);
exports.orgHasAnySections = orgHasAnySections;
const buildValidGradeSet = (grades) => new Set(grades.map((grade) => grade.label.trim()).filter((label) => label.length > 0));
exports.buildValidGradeSet = buildValidGradeSet;
const formatGradeValidationMessage = (grades) => `Grade must be one of: ${(0, exports.getGradeLabels)({ institutionType: "school", grades }).join(", ")}`;
exports.formatGradeValidationMessage = formatGradeValidationMessage;
const formatSectionValidationMessage = (sections) => `Section must be one of: ${sections.join(", ")}`;
exports.formatSectionValidationMessage = formatSectionValidationMessage;
