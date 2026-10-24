function gradeFor(score) {
  if (score >= 70) return { grade: "A", gradePoint: 5 };
  if (score >= 60) return { grade: "B", gradePoint: 4 };
  if (score >= 50) return { grade: "C", gradePoint: 3 };
  if (score >= 45) return { grade: "D", gradePoint: 2 };
  if (score >= 40) return { grade: "E", gradePoint: 1 };
  return { grade: "F", gradePoint: 0 };
}
function summarizeResults(results) {
  const completed = results.filter(result => result.caScore !== null && result.examScore !== null);
  const qualityPoints = completed.reduce((sum, result) => sum + result.course.creditUnits * gradeFor(result.caScore + result.examScore).gradePoint, 0);
  const completedUnits = completed.reduce((sum, result) => sum + result.course.creditUnits, 0);
  return { gpa: completedUnits ? Number((qualityPoints / completedUnits).toFixed(2)) : null, completedCourses: completed.length, completedUnits };
}
function presentResult(result) {
  const totalScore = result.caScore !== null && result.examScore !== null ? result.caScore + result.examScore : null;
  const grade = totalScore === null ? null : gradeFor(totalScore);
  return { ...result, totalScore, grade: grade?.grade ?? null, gradePoint: grade?.gradePoint ?? null, qualityPoints: grade ? grade.gradePoint * result.course.creditUnits : null };
}
module.exports = { gradeFor, summarizeResults, presentResult };
