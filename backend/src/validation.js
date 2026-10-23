const TERMS = new Set(["Term 1", "Term 2", "Term 3"]);
const COMPONENTS = [
  { key: "ca1", maxKey: "ca1Max", defaultMax: 10 },
  { key: "ca2", maxKey: "ca2Max", defaultMax: 10 },
  { key: "ca3", maxKey: "ca3Max", defaultMax: 10 },
  { key: "exam", maxKey: "examMax", defaultMax: 70 }
];

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validPeriod(academicYear, term) {
  return typeof academicYear === "string" &&
    academicYear.trim().length > 0 &&
    academicYear.trim().length <= 30 &&
    TERMS.has(term);
}

function validateTarget(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

function validateScores(body) {
  const output = {};
  for (const component of COMPONENTS) {
    const rawMax = body[component.maxKey];
    const max = rawMax === undefined ? component.defaultMax : rawMax;
    if (typeof max !== "number" || !Number.isFinite(max) || max <= 0 || max > 100) {
      return { error: `${component.maxKey} must be a number greater than 0 and no more than 100.` };
    }
    output[component.maxKey] = max;

    const raw = body[component.key];
    if (raw === undefined || raw === null || raw === "") {
      output[component.key] = null;
    } else {
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > max) {
        return { error: `${component.key} must be blank or a number between 0 and ${max}.` };
      }
      output[component.key] = raw;
    }
  }
  return { value: output };
}

module.exports = { COMPONENTS, TERMS, cleanString, validPeriod, validateTarget, validateScores };
