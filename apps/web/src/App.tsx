import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

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
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/courses" element={<BrowseCourses />} />
          <Route path="/courses/new" element={<CreateCourse />} />
          <Route path="/course-offerings/:id" element={<CourseOffering />} />
          <Route path="/books/new" element={<CreateBook />} />
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
    </BrowserRouter>
  );
}

export default App;