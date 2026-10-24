const express = require("express");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../prisma");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();
router.use(requireAuth);

const semesters = new Set(["Semester 1", "Semester 2"]);
const gradeFor = score => score >= 70 ? { grade: "A", gradePoint: 5 } : score >= 60 ? { grade: "B", gradePoint: 4 } : score >= 50 ? { grade: "C", gradePoint: 3 } : score >= 45 ? { grade: "D", gradePoint: 2 } : score >= 40 ? { grade: "E", gradePoint: 1 } : { grade: "F", gradePoint: 0 };
function summary(results) {
  const completed = results.filter(r => r.caScore !== null && r.examScore !== null);
  const points = completed.reduce((sum, r) => sum + (r.course.creditUnits * gradeFor((r.caScore || 0) + (r.examScore || 0)).gradePoint), 0);
  const units = completed.reduce((sum, r) => sum + r.course.creditUnits, 0);
  return { gpa: units ? Number((points / units).toFixed(2)) : null, completedCourses: completed.length, completedUnits: units };
}
function present(r) {
  const total = r.caScore !== null && r.examScore !== null ? r.caScore + r.examScore : null;
  const grade = total === null ? null : gradeFor(total);
  return { ...r, totalScore: total, grade: grade?.grade ?? null, gradePoint: grade?.gradePoint ?? null, qualityPoints: grade ? grade.gradePoint * r.course.creditUnits : null };
}
router.get("/", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { currentAcademicYear: true, currentSemester: true } });
    const year = typeof req.query.academicYear === "string" ? req.query.academicYear.trim() : user.currentAcademicYear;
    const semester = typeof req.query.semester === "string" ? req.query.semester : user.currentSemester;
    if (!year || year.length > 30 || !semesters.has(semester)) return res.status(400).json({ error: "Choose a valid academic year and semester." });
    const courses = await prisma.universityCourse.findMany({ where: { userId: req.userId }, orderBy: { code: "asc" }, include: { results: { where: { userId: req.userId } } } });
    const allResults = courses.flatMap(c => c.results.map(r => ({ ...r, course: { id: c.id, code: c.code, title: c.title, creditUnits: c.creditUnits } })));
    const semesterResults = allResults.filter(r => r.academicYear === year && r.semester === semester).map(present);
    const overall = summary(allResults.map(r => ({ ...r, course: { ...r.course } })));
    const semesterSummary = summary(allResults.filter(r => r.academicYear === year && r.semester === semester).map(r => ({ ...r, course: { ...r.course } })));
    res.json({ academicYear: year, semester, courses: courses.map(({ results, ...c }) => c), results: semesterResults, semesterGpa: semesterSummary.gpa, cgpa: overall.gpa, completedCourses: overall.completedCourses, completedUnits: overall.completedUnits });
  } catch (error) { next(error); }
});
router.post("/courses", async (req, res, next) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase().slice(0, 30) : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 120) : "";
    const creditUnits = req.body?.creditUnits;
    if (!/^[A-Z0-9][A-Z0-9 -]{1,29}$/.test(code)) return res.status(400).json({ error: "Enter a valid course code, for example CSC 201." });
    if (title.length < 2) return res.status(400).json({ error: "Enter the course title." });
    if (!Number.isInteger(creditUnits) || creditUnits < 1 || creditUnits > 12) return res.status(400).json({ error: "Credit units must be a whole number from 1 to 12." });
    const course = await prisma.universityCourse.create({ data: { userId: req.userId, code, title, creditUnits } });
    res.status(201).json({ course });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ error: "That course code already exists in your course list." });
    next(error);
  }
});
router.put("/courses/:courseId/result", async (req, res, next) => {
  try {
    const course = await prisma.universityCourse.findFirst({ where: { id: req.params.courseId, userId: req.userId } });
    if (!course) return res.status(404).json({ error: "Course not found." });
    const { academicYear, semester } = req.body || {};
    if (typeof academicYear !== "string" || !academicYear.trim() || academicYear.trim().length > 30 || !semesters.has(semester)) return res.status(400).json({ error: "Choose a valid academic year and semester." });
    const caMax = req.body?.caMax ?? 30;
    const examMax = req.body?.examMax ?? 70;
    const caScore = req.body?.caScore === "" || req.body?.caScore === undefined || req.body?.caScore === null ? null : req.body.caScore;
    const examScore = req.body?.examScore === "" || req.body?.examScore === undefined || req.body?.examScore === null ? null : req.body.examScore;
    for (const [name, value] of [["caMax", caMax], ["examMax", examMax]]) if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100) return res.status(400).json({ error: name + " must be greater than 0 and no more than 100." });
    for (const [name, value, max] of [["caScore", caScore, caMax], ["examScore", examScore, examMax]]) if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max)) return res.status(400).json({ error: name + " must be blank or between 0 and " + max + "." });
    if (Math.abs((caMax + examMax) - 100) > 0.001) return res.status(400).json({ error: "CA maximum and exam maximum must add up to 100." });
    const result = await prisma.universityCourseResult.upsert({
      where: { courseId_academicYear_semester: { courseId: course.id, academicYear: academicYear.trim(), semester } },
      create: { userId: req.userId, courseId: course.id, academicYear: academicYear.trim(), semester, caScore, caMax, examScore, examMax },
      update: { caScore, caMax, examScore, examMax }
    });
    res.json({ result: present({ ...result, course }) });
  } catch (error) { next(error); }
});
router.delete("/courses/:courseId", async (req, res, next) => {
  try {
    const result = await prisma.universityCourse.deleteMany({ where: { id: req.params.courseId, userId: req.userId } });
    if (!result.count) return res.status(404).json({ error: "Course not found." });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
module.exports = router;
