import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProjectList } from './components/ProjectList';
import { Terminal } from './components/Terminal';
import { Settings } from './components/Settings';
import { Setup } from './components/Setup';
import { ProcessMonitor } from './components/ProcessMonitor';
import { NotificationCenter } from './components/NotificationCenter';
import { SessionInitializer } from './components/SessionInitializer';
import { CLIManager } from './components/cli';
import { LocalAgentConnection } from './pages/LocalAgentConnection';
import { Chat } from './components/Chat';

function App() {
  return (
    <>
      <SessionInitializer />
      <Layout>
        <Routes>
          <Route path='/' element={<ProjectList />} />
          <Route path='/terminal/:sessionId' element={<Terminal />} />
          <Route path='/monitor' element={<ProcessMonitor />} />
          <Route path='/cli' element={<CLIManager />} />
          <Route path='/connect' element={<LocalAgentConnection />} />
          <Route path='/chat' element={<Chat />} />
          <Route path='/setup' element={<Setup />} />
          <Route path='/settings' element={<Settings />} />
        </Routes>
      </Layout>
      <NotificationCenter />
    </>
  );
}

export default App;
