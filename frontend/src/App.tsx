import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import AnalysisPage from '@/pages/AnalysisPage'
import FieldsPage from '@/pages/FieldsPage'
import ReportPage from '@/pages/ReportPage'
import MeasuresPage from '@/pages/MeasuresPage'
import SourcesPage from '@/pages/SourcesPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AnalysisPage />} />
          <Route path="pola" element={<FieldsPage />} />
          <Route path="raport" element={<ReportPage />} />
          <Route path="dzialania" element={<MeasuresPage />} />
          <Route path="zrodla" element={<SourcesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
