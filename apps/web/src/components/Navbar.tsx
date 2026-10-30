import { useState } from "react";
import { useAuth } from "../auth/Auth";
import { Link, useNavigate } from "react-router-dom";

function Navbar() {
  const { user, logout } = useAuth(); const navigate = useNavigate();
  const [error, setError] = useState("");
  async function signOut() {
    try { await logout(); setError(""); navigate("/login"); }
    catch { setError("Sign out failed. Please retry."); }
  }
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-logo">OpenDSA</Link>
        <span>Course ▼</span>

        <div className="dropdown">
            <button 
                type="button"
                className="dropdown-button"
                aria-haspopup="true">
                    Course ▼
            </button>
            
            <div className="dropdown-menu">
                <Link to="/courses">Browse All Courses</Link>
                <Link to="/courses/new">Create New Course</Link>
                <Link to="/books/new">Create New Textbook</Link>
                </div>
            </div>

            <Link to="/books/new">Create Book</Link>
            <Link to="/guides">Instructor Guides</Link>
            <Link to="/documentation">System Documentation</Link>
        </div>

        <div className="navbar-right">
            <span aria-label="Admin Settings" title="Admin Settings">⚙</span>
            {user ? <><span>{user.first_name || user.email}</span><button type="button" onClick={signOut}>Sign out</button></>
              : <Link to="/login">Sign in</Link>}
            {error && <span role="alert">{error}</span>}
      </div>
    </nav>
  );
}

export default Navbar;