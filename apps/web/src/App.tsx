import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider, RequireAuth } from "./auth/Auth";
import Login from "./pages/Login";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

import Home from "./pages/Home";
import CourseOffering from "./pages/CourseOffering";
import CreateCourse from "./pages/CreateCourse";
import CreateBook from "./pages/CreateBook";
import BrowseCourses from "./pages/BrowseCourses";
import InstructorGuides from "./pages/InstructorGuides";
import SystemDocumentation from "./pages/SystemDocumentation";
import NotFound from "./pages/NotFound";
import About from "./pages/About";
import Official from "./pages/Official";
import Contact from "./pages/Contact";


function App() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
      <Navbar />
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />
          <Route path="/courses" element={<BrowseCourses />} />
          <Route path="/courses/new" element={<RequireAuth instructor><CreateCourse /></RequireAuth>} />
          <Route path="/course-offerings/:id" element={<RequireAuth><CourseOffering /></RequireAuth>} />
          <Route path="/books/new" element={<RequireAuth instructor><CreateBook /></RequireAuth>} />
          <Route path="/guides" element={<InstructorGuides />} />
          <Route path="/about" element={<About />} />
          <Route path="/official" element={<Official />} />
          <Route path="/contact" element={<Contact />} />

          <Route
            path="/documentation"
            element={<SystemDocumentation />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />
      {import.meta.env.DEV && (
        <p>Backend status: {status}</p>
      )}
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;