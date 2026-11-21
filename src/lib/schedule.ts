// Kept as a small compatibility boundary for route files that import schedule helpers here.
export {
  parseAcademicClass,
  parseAcademicSession as parseSession,
  subscribeSchedule,
} from '@/features/academic/listeners';
