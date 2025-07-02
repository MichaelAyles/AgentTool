import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProjectList } from './components/ProjectList';
import { Terminal } from './components/Terminal';
import { Settings } from './components/Settings';
import { ProcessMonitor } from './components/ProcessMonitor';
import { NotificationCenter } from './components/NotificationCenter';
import { CLIManager } from './components/cli';

function App() {
  return (
    <>
      <Layout>
        <Routes>
          <Route path='/' element={<ProjectList />} />
          <Route path='/terminal/:sessionId' element={<Terminal />} />
          <Route path='/monitor' element={<ProcessMonitor />} />
          <Route path='/cli' element={<CLIManager />} />
          <Route path='/settings' element={<Settings />} />
        </Routes>
      </Layout>
      <NotificationCenter />
    </>
  );
}

export default App;
