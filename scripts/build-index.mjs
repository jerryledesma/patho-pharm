// Builds public/lectures/index.json: the lecture list the home page reads.
// Lecture numbers are computed from date order (never stored).
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LECTURES = join(ROOT, 'public/lectures');
const course = JSON.parse(readFileSync(join(ROOT, 'course.json'), 'utf8'));

const lectures = readdirSync(LECTURES)
  .filter(d => statSync(join(LECTURES, d)).isDirectory())
  .map(d => JSON.parse(readFileSync(join(LECTURES, d, 'lecture.json'), 'utf8')))
  .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  .map((L, i) => ({
    id: L.id, num: i + 1, date: L.date, title: L.title, instructor: L.instructor,
    questions: L.practice.length + L.clinical.reduce((a, s) => a + s.questions.length, 0),
    cards: L.cards.length,
  }));

writeFileSync(join(LECTURES, 'index.json'), JSON.stringify({ course: course.label, lectures }, null, 1) + '\n');
console.log(`index.json: ${lectures.length} lecture(s)`);
