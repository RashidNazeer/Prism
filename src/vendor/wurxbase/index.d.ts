/**
 * Types for the vendored WurxBase app.
 *
 * WurxBase is plain JavaScript written by another developer for a separate
 * Create React App project. It was copied in whole and unchanged, on purpose:
 * Rashid asked for the code, features and logic to be left exactly alone and
 * only the look to become ours. So it is not converted to TypeScript, not
 * refactored, and not linted to our rules.
 *
 * These declarations are the seam. They tell our strict build what the two
 * entry components are without asking it to check thirty thousand lines of
 * somebody else's JavaScript, which would fail on the first line and would be
 * a change we were told not to make.
 */

declare module '@/vendor/wurxbase/App' {
  const App: React.ComponentType;
  export default App;
}

declare module '@/vendor/wurxbase/PaidCollabs' {
  const PaidCollabsApp: React.ComponentType;
  export default PaidCollabsApp;
}
