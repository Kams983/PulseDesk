import { Route, Routes } from 'react-router-dom';

// temporary shell, the real screens land with the feature phases
function Placeholder() {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-xl font-semibold text-slate-900">EMR Appointment Management</h1>
      <p className="mt-2 text-sm text-slate-600">Scaffolding only. Screens are added phase by phase.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Placeholder />} />
    </Routes>
  );
}
