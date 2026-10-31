import { Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { HomePage } from './pages/HomePage.js';
import { ProofPage } from './pages/ProofPage.js';
import { PayrollPage } from './pages/PayrollPage.js';
import { NewPayrollPage } from './pages/NewPayrollPage.js';
import { DocsPage } from './pages/DocsPage.js';
import { NotFound } from './pages/NotFound.js';
import { Footer } from './components/Footer.js';

// /lab only ships in dev builds; lazy import keeps it out of the production bundle.
const LabPage = import.meta.env.DEV
  ? lazy(() => import('./pages/LabPage.js').then(m => ({ default: m.LabPage })))
  : null;

function Layout() {
  const location = useLocation();
  // /lab is a dev-only playground; it manages its own layout.
  const isLab = location.pathname === '/lab';
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/proof" element={<ProofPage />} />
        <Route path="/p/:address" element={<PayrollPage />} />
        <Route path="/new" element={<NewPayrollPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/docs/:slug" element={<DocsPage />} />
        {import.meta.env.DEV && LabPage && (
          <Route
            path="/lab"
            element={
              <Suspense fallback={null}>
                <LabPage />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!isLab && <Footer />}
    </>
  );
}

export default function App() {
  return <Layout />;
}
