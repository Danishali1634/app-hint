/**
 * @file Root component. Kept intentionally tiny — providers and routes live in
 * app/router/AppRouter.js.
 */

import { AppRouter } from '@/app/router/AppRouter';

function App() {
  return <AppRouter />;
}

export default App;
