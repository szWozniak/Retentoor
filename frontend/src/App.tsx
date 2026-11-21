import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import RecordsPage from '@/pages/RecordsPage'
import StatusPage from '@/pages/StatusPage'
import UploadPage from '@/pages/UploadPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<RecordsPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="status" element={<StatusPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
