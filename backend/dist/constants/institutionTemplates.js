"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INSTITUTION_TEMPLATES = exports.DEFAULT_GRADE_LABELS = exports.DEFAULT_SECTION_LABELS = void 0;
exports.DEFAULT_SECTION_LABELS = ["A", "B", "C", "D"];
exports.DEFAULT_GRADE_LABELS = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12"
];
const templateGrades = (labels, withSections) => labels.map((label) => ({
    label,
    sections: withSections ? [...exports.DEFAULT_SECTION_LABELS] : []
}));
exports.INSTITUTION_TEMPLATES = {
    school_primary: {
        label: "Primary School (Nursery–8th)",
        grades: templateGrades(["Nursery", "KG", "KG2", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"], true)
    },
    school_secondary: {
        label: "Secondary School (1st–12th)",
        grades: templateGrades(["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"], true)
    },
    school_full: {
        label: "Full School (Nursery–12th)",
        grades: templateGrades([
            "Nursery",
            "KG",
            "KG2",
            "1st",
            "2nd",
            "3rd",
            "4th",
            "5th",
            "6th",
            "7th",
            "8th",
            "9th",
            "10th",
            "11th",
            "12th"
        ], true)
    },
    college_bcom: {
        label: "B.Com College",
        grades: templateGrades(["FY B.Com", "SY B.Com", "TY B.Com"], false)
    },
    college_mba: {
        label: "MBA College",
        grades: templateGrades([
            "MBA Year 1 (Sem 1)",
            "MBA Year 1 (Sem 2)",
            "MBA Year 2 (Sem 3)",
            "MBA Year 2 (Sem 4)"
        ], false)
    },
    college_engineering: {
        label: "Engineering College",
        grades: templateGrades(["FE", "SE", "TE", "BE"], true)
    },
    custom: {
        label: "Custom (define your own)",
        grades: []
    }
};
