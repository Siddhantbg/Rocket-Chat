import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { socketClient } from './sockets/socket';
import { useEffect } from 'react';
import Header from './components/Header';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import './App.css'

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuthStore();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
  return (
    <>
      <Header />
      {children}
    </>
  );
};

// Temporary data for demo purposes
const DEMO_USER = {
  id: '123',
  name: 'Demo User'
};

function App() {
  const { user, initialize } = useAuthStore();

  useEffect(() => {
    // Initialize auth state
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user) {
      // Connect to socket and emit user:connect event
      socketClient.connect();
      socketClient.emit('user:connect', user.id);

      // Cleanup on unmount
      return () => {
        socketClient.disconnect();
      };
    }
  }, [user]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
