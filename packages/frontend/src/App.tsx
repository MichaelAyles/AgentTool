import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProjectList } from './components/ProjectList';
import { Terminal } from './components/Terminal';
import { Settings } from './components/Settings';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/terminal/:sessionId" element={<Terminal />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default App;